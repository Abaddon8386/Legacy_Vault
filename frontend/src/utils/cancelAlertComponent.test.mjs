import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';

const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost/dms?preview=true&scenario=triggered', pretendToBeVisual: true });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponent(entry, production = false) {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': String(!production), 'import.meta.env.PROD': String(production) },
    build: { write: false, minify: false, lib: {entry, formats:['es']}, rollupOptions: {external:['react','react-dom','react/jsx-runtime']} } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const OwnerCancelAlert = await loadComponent('src/components/dms/OwnerCancelAlert.jsx');
const DMSOverviewPage = await loadComponent('src/pages/dms/DMSOverviewPage.jsx');
const deferred = () => { let resolve; let reject; const promise = new Promise((a,b)=>{resolve=a; reject=b;}); return {promise,resolve,reject}; };
const click = async element => { assert.ok(element, 'Expected actual DOM button'); await act(async()=>{element.click();}); };
const button = text => [...document.querySelectorAll('button')].find(el => el.textContent.trim() === text);
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async()=>root.render(React.createElement(Component, props)));
  return { host, render: async next => {await act(async()=>root.render(React.createElement(Component,next)));}, close: async()=>{await act(async()=>root.unmount()); host.remove();} };
}
const base = {isOwner:true, ownerId:'owner-a', dmsStatus:'TRIGGERED', canCancel:true};
async function open() { await click(button('Hủy cảnh báo (Tôi vẫn an toàn)')); }
async function submit() { await click(button('Xác nhận hủy cảnh báo')); }

test('React component: portal, focus and duplicate submission use real DOM handlers', async()=>{
  const pending=deferred(); let calls=0;
  const view=await mount(OwnerCancelAlert,{...base,onCancelAlert:()=>{calls++;return pending.promise;}});
  try {
    await open();
    assert.equal(document.querySelector('[role=dialog]').parentElement.parentElement, document.body);
    await act(async()=>{await new Promise(r=>setTimeout(r,60));});
    assert.equal(document.activeElement,button('Xác nhận hủy cảnh báo'));
    await submit(); await click(button('Đang xử lý hủy cảnh báo…'));
    assert.equal(calls,1);
    await act(async()=>{pending.resolve({cancelled:true});});
    assert.match(document.body.textContent,/Đã hủy cảnh báo thành công/);
    assert.equal(document.querySelector('[role=alert]'),null);
  } finally {await view.close();}
});

test('React component: non-owner overrides explicit capability',async()=>{
  const view=await mount(OwnerCancelAlert,{...base,isOwner:false});
  try {assert.equal(button('Hủy cảnh báo (Tôi vẫn an toàn)'),undefined);} finally {await view.close();}
});

for (const change of [{isOwner:false},{ownerId:'owner-b'},{dmsStatus:'MONITORING'}]) {
  test('React component: context change aborts and ignores rogue late success '+JSON.stringify(change),async()=>{
    const pending=deferred();let success=0;let signal;
    const props={...base,onCancelAlert:s=>{signal=s;return pending.promise;},onSuccess:()=>success++};
    const view=await mount(OwnerCancelAlert,props);
    try {
      await open(); await submit(); await view.render({...props,...change});
      assert.equal(signal.aborted,true);
      await act(async()=>{pending.resolve({cancelled:true});});
      assert.equal(success,0); assert.doesNotMatch(document.body.textContent,/Đã hủy cảnh báo thành công/);
    } finally {await view.close();}
  });
}

for (const name of ['onSuccess','onRefreshRequired']) {
  for (const asynchronous of [false,true]) {
    test('React component: '+name+' failure remains separate from server success; async='+asynchronous,async()=>{
      const callback=()=>{if(asynchronous)return Promise.reject(new Error('callback failed'));throw new Error('callback failed');};
      const view=await mount(OwnerCancelAlert,{...base,onCancelAlert:async()=>({cancelled:true}),[name]:callback});
      try {
        await open();await submit();
        assert.match(document.body.textContent,/Đã hủy cảnh báo thành công/);
        assert.match(document.body.textContent,/tải lại dữ liệu gặp trục trặc/);
        assert.equal(document.querySelector('[role=alert]'),null);
      } finally {await view.close();}
    });
  }
}

test('React component: invalid receipt stays in dialog without success callback',async()=>{
  let success=0;
  const view=await mount(OwnerCancelAlert,{...base,onCancelAlert:async()=>({status:'FAILED',success:true}),onSuccess:()=>success++});
  try {await open();await submit();assert.equal(success,0);assert.match(document.querySelector('[role=alert]').textContent,/không hợp lệ/);}finally{await view.close();}
});

test('React component: unmount aborts pending request and suppresses late callbacks',async()=>{
  const pending=deferred();let signal;let success=0;
  const view=await mount(OwnerCancelAlert,{...base,onCancelAlert:s=>{signal=s;return pending.promise;},onSuccess:()=>success++});
  await open();await submit();await view.close();assert.equal(signal.aborted,true);
  await act(async()=>pending.resolve({success:true}));assert.equal(success,0);assert.equal(document.querySelector('[role=dialog]'),null);
});

test('React component: Escape closes dialog and restores trigger focus',async()=>{
  const view=await mount(OwnerCancelAlert,base);
  try {await open();await act(async()=>{window.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));await new Promise(r=>setTimeout(r,60));});assert.equal(document.querySelector('[role=dialog]'),null);assert.equal(document.activeElement,button('Hủy cảnh báo (Tôi vẫn an toàn)'));}finally{await view.close();}
});

test('DMS page component: numeric refresh counter and async parent callback use actual page handlers',async()=>{
  let calls=0; let unhandled=0;
  const listener=()=>unhandled++;process.on('unhandledRejection',listener);
  const view=await mount(DMSOverviewPage,{ownerId:'owner-a',isDevPreview:true,onRefreshTrigger:0,canCancelAlert:true,onCancelAlert:async()=>({cancelled:true}),onRequestRefreshParent:async()=>{calls++;throw new Error('parent refresh failed');}});
  try {
    await act(async()=>{await new Promise(r=>setTimeout(r,450));});
    await open();await submit();
    assert.equal(calls,1);assert.equal(unhandled,0);
  }finally{await view.close();process.off('unhandledRejection',listener);}
});


test('Actual production component forbids preview status fallback', async()=>{
  const Production = await loadComponent('src/components/dms/OwnerCancelAlert.jsx', true);
  const view = await mount(Production,{isOwner:true,isDevPreview:true,dmsStatus:'TRIGGERED'});
  try {assert.equal(button('Hủy cảnh báo (Tôi vẫn an toàn)'),undefined);}finally{await view.close();}
});

test('React component: Tab focus trap, English pending-service error and return focus', async()=>{
  const view=await mount(OwnerCancelAlert,{...base,lang:'en'});
  try {
    await click(button("Cancel Alert (I'm Safe)"));
    await act(async()=>{await new Promise(r=>setTimeout(r,60));});
    const confirm=button('Confirm Cancel Alert');const dismiss=button('Dismiss / Keep Alert');
    await act(async()=>confirm.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true})));
    assert.equal(document.activeElement,dismiss);
    await act(async()=>dismiss.dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Tab',shiftKey:true,bubbles:true,cancelable:true})));
    assert.equal(document.activeElement,confirm);
    await click(confirm);assert.match(document.querySelector('[role=alert]').textContent,/currently being updated/);
  }finally{await view.close();}
});
