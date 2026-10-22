import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<html><body></body></html>', {url:'http://localhost/?preview=true',pretendToBeVisual:true});
globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
async function compile(production=false) {
 const result=await build({configFile:false,plugins:[react(),{name:'trace-load',transform(code,id){if(id.endsWith('Page.jsx')) return code.replace('await fetchHandoverCase(scenario,','await (globalThis.__refreshLoads?.push(scenario), fetchHandoverCase)(scenario,');}}],logLevel:'silent',define:{'import.meta.env.DEV':String(!production),'import.meta.env.PROD':String(production)},build:{write:false,minify:false,lib:{entry:'src/pages/staff/BeneficiaryAccountPage.jsx',formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
 let code=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk'&&x.isEntry).code;
 for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime']) code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
 return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
async function mount(Component,props={}) { const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,render:async(props)=>{await act(async()=>root.render(React.createElement(Component,props)));},close:async()=>{await act(async()=>root.unmount());host.remove();}}; }
const Preview=await compile();

test('Create dialog clears password on Escape and cancel, returns focus, and retains draft on language change', async () => {
 const props={isDevPreview:true,lang:'en'};const view=await mount(Preview,props);
 const change=(element,value)=>{const key=Object.keys(element).find(key=>key.startsWith('__reactProps'));element[key].onChange({target:{value}});};
 try {
  for(const close of ['Escape','cancel']) {
   const opener=[...view.host.querySelectorAll('button')].find(button=>button.textContent.includes('Activate at Counter'));
   opener.focus();await act(async()=>opener.click());
   const input=view.host.querySelector('input[type=password]');assert.ok(input);
   await act(async()=>change(input,'synthetic-secret'));
   await view.render({...props,lang:'vi'});
   assert.equal(view.host.querySelector('input[type=password]').value,'synthetic-secret');
   if(close==='Escape')await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
   else await act(async()=>[...view.host.querySelectorAll('[role=dialog] button')].find(button=>button.textContent.includes('Hủy')).click());
   assert.equal(view.host.querySelector('[role=dialog]'),null);
   assert.equal(document.activeElement,opener);
   await view.render(props);
   await act(async()=>opener.click());
   assert.equal(view.host.querySelector('input[type=password]').value,'');
   await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  }
 } finally {await view.close();}
});
test('Rendered preview permits only ticket-specific actions', async()=>{
 const view=await mount(Preview,{isDevPreview:true,lang:'vi'}); const {host}=view;
 try { const link=[...host.querySelectorAll('button')].find(b=>/Liên kết/.test(b.textContent));assert.ok(link);await act(async()=>link.click());const dialog=host.querySelector('[role=dialog]');assert.ok(dialog);assert.equal(document.activeElement,dialog.querySelector('input'));await act(async()=>{document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true}));});assert.equal(host.querySelector('[role=dialog]'),null);assert.equal([...host.querySelectorAll('button')].some(b=>/Ký nhận|Lưu trữ|Giao tài sản/.test(b.textContent)),false); } finally { await view.close(); }
});
test('Real production build rejects preview override without synthetic success', async()=>{
 const previous=globalThis.fetch;const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({code:'BACKEND_NOT_READY'}),{status:503,headers:{'Content-Type':'application/json'}});};
 const Production=await compile(true);const view=await mount(Production,{isDevPreview:true,lang:'vi'});
 try { assert.ok(view.host.querySelector('[role=alert]')); assert.ok(calls.some(url=>url.includes('/staff/verification-cases'))); assert.doesNotMatch(view.host.textContent,/CASE-2026-0049|HDS-/); assert.equal(view.host.querySelector('input[type=password]') === null,true); } finally {await view.close();globalThis.fetch=previous;}
});

test('Create/link validation shows specific localized errors and re-translates on VI/EN switch', async()=>{
 const props={isDevPreview:true,lang:'en'};const view=await mount(Preview,props);
 try {
  const create=[...view.host.querySelectorAll('button')].find(b=>/Activate at Counter/.test(b.textContent));assert.ok(create);await act(async()=>create.click());
  await act(async()=>view.host.querySelector('[role=dialog] form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(view.host.querySelector('[role=dialog]').textContent,/Enter the beneficiary email/);
  assert.doesNotMatch(view.host.querySelector('[role=dialog]').textContent,/Operation failed|Thông tin tạo/);
  await view.render({...props,lang:'vi'});assert.match(view.host.querySelector('[role=dialog]').textContent,/Vui lòng nhập email người thụ hưởng/);
  await act(async()=>document.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape',bubbles:true})));
  await view.render(props);
  const link=[...view.host.querySelectorAll('button')].find(b=>/Link/.test(b.textContent));assert.ok(link);await act(async()=>link.click());
  await act(async()=>view.host.querySelector('[role=dialog] form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(view.host.querySelector('[role=dialog]').textContent,/Enter the beneficiary email/);
 } finally { await view.close(); }
});

test('Refresh fetches the selected case again without changing the scenario', async () => {
 globalThis.__refreshLoads = [];
 let refreshes = 0;
 const view = await mount(Preview, {isDevPreview:true,lang:'en',onRefresh:()=>{refreshes++;}});
 try {
  const select = view.host.querySelector('select');
  await act(async()=>{select.value='case-out-of-scope';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  const before = globalThis.__refreshLoads.length;
  await act(async()=>view.host.querySelector('button[title="Refresh Data"]').click());
  assert.equal(globalThis.__refreshLoads.length,before+1);
  assert.equal(globalThis.__refreshLoads.at(-1),'case-out-of-scope');
  assert.equal(view.host.querySelector('select').value,'case-out-of-scope');
  assert.equal(refreshes,1);
 } finally {await view.close();delete globalThis.__refreshLoads;}
});
