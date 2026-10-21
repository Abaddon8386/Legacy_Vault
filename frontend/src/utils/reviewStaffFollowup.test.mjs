import {staffFixture,deliveredItem} from './staffReviewFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/close-and-archive' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(name) {
  const result = await build({
    configFile: false,
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry: `src/pages/staff/${name}.jsx`, formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const pkg of ['react', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${pkg}"`, `from "${import.meta.resolve(pkg)}"`);
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const Close = await component('CloseAndArchivePage');
const caseId = '11111111-1111-4111-8111-111111111111';
const sessionId = '22222222-2222-4222-8222-222222222222';
const recipient = '33333333-3333-4333-8333-333333333333';
const assetId = '44444444-4444-4444-8444-444444444444';
const otherCaseId = '55555555-5555-4555-8555-555555555555';
const otherSessionId = '66666666-6666-4666-8666-666666666666';

const props = { caseId, sessionId, accessToken: 'synthetic-review-token', lang: 'en' };
const json = (value, status = 200) =>
  new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const find = (host, text) => [...host.querySelectorAll('button')].find((b) => b.textContent.includes(text));

const originalFetch = globalThis.fetch;
test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

async function mount(Component, extra = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, { ...props, ...extra })));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}


test('receipt without recipient/allocation data must not invent IDs', async()=>{
 let posts=0;globalThis.fetch=async(url,init)=>{if(init?.method==='POST')posts++;return staffFixture({status:'COMPLETED'})(url);};
 const v=await mount(Close);try{assert.equal(find(v.host,'Generate Staff Receipt').disabled,true);assert.equal(posts,0);}finally{await v.close();}
});
test('real completed session reload permits archive only when every delivered item is covered',async()=>{
 globalThis.fetch=staffFixture({status:'COMPLETED',deliveries:[deliveredItem],receipts:[{receiptId:otherCaseId,recipientId:recipient,assetIds:[assetId]}]});
 const v=await mount(Close);try{assert.equal([...v.host.querySelectorAll('.lv-ca-btn-primary')].at(-1).disabled,false);assert.ok(v.host.textContent.includes('Session Completed'));}finally{await v.close();}
});
test('close gate data must be invalidated immediately when changing case',async()=>{
 globalThis.fetch=async url=>url.includes(otherCaseId)?new Promise(()=>{}):staffFixture()(url);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(Close,props)));assert.equal(host.querySelector('.lv-ca-btn-primary').disabled,false);
 await act(async()=>root.render(React.createElement(Close,{...props,caseId:otherCaseId,sessionId:otherSessionId})));
 assert.equal(host.querySelector('.lv-ca-btn-primary').disabled,true);}finally{await act(async()=>root.unmount());host.remove();}
});
test('receipt selection uses exact server delivery relationship; props cannot forge scope',async()=>{
 let body;const base=staffFixture({status:'COMPLETED',deliveries:[deliveredItem]});
 globalThis.fetch=async(url,init)=>{if(init?.method==='POST'){body=JSON.parse(init.body);return json({receiptId:otherCaseId,sessionId,recipientId:recipient,assetIds:[assetId]},201);}return base(url);};
 const v=await mount(Close,{recipientId:recipient,assetIds:[assetId]});
 try{assert.equal(find(v.host,'Generate Staff Receipt').disabled,false);await act(async()=>find(v.host,'Generate Staff Receipt').click());
 assert.deepEqual(body,{recipientId:recipient,assetIds:[assetId],supersedesReceiptId:null});}finally{await v.close();}
 const invalid=await mount(Close,{recipientId:otherCaseId,assetIds:[caseId]});try{assert.equal(find(invalid.host,'Generate Staff Receipt').disabled,true);}finally{await invalid.close();}
});
test('one receipt cannot cover another recipient; superseded receipts do not count',async()=>{
 globalThis.fetch=staffFixture({status:'COMPLETED',deliveries:[deliveredItem,{...deliveredItem,itemId:otherCaseId,recipientId:otherCaseId}],receipts:[{receiptId:otherSessionId,recipientId:recipient,assetIds:[assetId]}]});
 const v=await mount(Close);try{assert.equal([...v.host.querySelectorAll('.lv-ca-btn-primary')].at(-1).disabled,true);}finally{await v.close();}
});
test('late close response from A must never complete case B; transport is aborted',async()=>{
 let resolve;let signal;const base=staffFixture();globalThis.fetch=async(url,init)=>{if(init?.method==='POST'){signal=init.signal;return new Promise(r=>resolve=r);}return base(url);};
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(Close,props)));await act(async()=>find(host,'Close Handover Session').click());
 await act(async()=>root.render(React.createElement(Close,{...props,caseId:otherCaseId,sessionId:otherSessionId})));
 assert.equal(signal.aborted,true);await act(async()=>resolve(json({sessionId,status:'COMPLETED'})));
 assert.equal(host.textContent.includes('Session Completed'),false);assert.equal(find(host,'Close Handover Session').disabled,false);
 }finally{await act(async()=>root.unmount());host.remove();}
});
test('late receipt response cannot attach to a different account',async()=>{
 let resolve;const base=staffFixture({status:'COMPLETED',deliveries:[deliveredItem]});
 globalThis.fetch=async(url,init)=>init?.method==='POST'?new Promise(r=>resolve=r):base(url);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(Close,{...props,recipientId:recipient})));await act(async()=>find(host,'Generate Staff Receipt').click());
 await act(async()=>root.render(React.createElement(Close,{...props,accessToken:'second-synthetic-token'})));
 await act(async()=>resolve(json({receiptId:otherSessionId,sessionId,recipientId:recipient,assetIds:[assetId]},201)));
 assert.equal(host.textContent.includes(otherSessionId),false);
 }finally{await act(async()=>root.unmount());host.remove();}
});
test('archived history reload does not call protected progress and locks mutations',async()=>{
 const urls=[];const base=staffFixture({status:'COMPLETED',closed:true,deliveries:[deliveredItem]});globalThis.fetch=async url=>{urls.push(url);return base(url);};
 const v=await mount(Close);try{assert.ok(v.host.querySelector('.lv-ca-archive-banner'));assert.equal(v.host.querySelectorAll('.lv-ca-btn-primary').length,0);assert.equal(urls.some(u=>u.endsWith('/completion-progress')),false);}finally{await v.close();}
});
test('load failure and missing status never enable close; retry can recover',async()=>{
 let failing=true;globalThis.fetch=async url=>failing?json({code:'LEGAL_DECISION_STALE'},409):staffFixture()(url);
 const v=await mount(Close);try{assert.equal(find(v.host,'Close Handover Session').disabled,true);failing=false;await act(async()=>find(v.host,'Retry').click());assert.equal(find(v.host,'Close Handover Session').disabled,false);}finally{await v.close();}
});
test('StrictMode and language changes preserve receipt selection and render VI/EN labels',async()=>{
 globalThis.fetch=staffFixture({status:'COMPLETED',deliveries:[deliveredItem]});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Close,{...props,lang:'vi'}))));
 const select=host.querySelector('select');await act(async()=>{select.value=recipient;select.dispatchEvent(new window.Event('change',{bubbles:true}));});
 assert.equal(find(host,'Lập biên bản xác nhận').disabled,false);assert.ok(host.textContent.includes('Cổng bàn giao tài sản'));assert.equal(host.textContent.includes('(Confirmed)'),false);
 await act(async()=>root.render(React.createElement(React.StrictMode,null,React.createElement(Close,{...props,lang:'en'}))));
 assert.equal(host.querySelector('select').value,recipient);assert.ok(host.textContent.includes('Asset Delivery Gate'));assert.equal(find(host,'Generate Staff Receipt').disabled,false);
 }finally{await act(async()=>root.unmount());host.remove();}
});

test('late archive response cannot close or archive the next case',async()=>{
 let resolve;let signal;
 const base=staffFixture({status:'COMPLETED',deliveries:[deliveredItem],receipts:[{receiptId:otherCaseId,recipientId:recipient,assetIds:[assetId]}]});
 globalThis.fetch=async(url,init)=>init?.method==='POST'?(signal=init.signal,new Promise(r=>resolve=r)):base(url);
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{await act(async()=>root.render(React.createElement(Close,props)));
 await act(async()=>[...host.querySelectorAll('.lv-ca-btn-primary')].at(-1).click());
 await act(async()=>root.render(React.createElement(Close,{...props,caseId:otherCaseId,sessionId:otherSessionId})));
 assert.equal(signal.aborted,true);
 await act(async()=>resolve(json({caseId,sessionId,caseStatus:'CLOSED',vaultStatus:'ARCHIVED'})));
 assert.equal(host.querySelector('.lv-ca-archive-banner'),null);
 }finally{await act(async()=>root.unmount());host.remove();}
});
