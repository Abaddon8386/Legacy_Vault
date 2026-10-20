import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<html><body></body></html>', {url:'http://localhost/?preview=true',pretendToBeVisual:true});
globalThis.window=dom.window; globalThis.document=dom.window.document; globalThis.HTMLElement=dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT=true;
async function compile(production=false) {
 const result=await build({configFile:false,plugins:[react(),{name:'trace-load',transform(code,id){if(id.endsWith('Page.jsx')) return code.replace('await fetchHandoverCase(scenario,','await (globalThis.__refreshLoads?.push(scenario), fetchHandoverCase)(scenario,');}}],logLevel:'silent',define:{'import.meta.env.DEV':String(!production),'import.meta.env.PROD':String(production)},build:{write:false,minify:false,lib:{entry:'src/pages/staff/CounterHandoverPage.jsx',formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
 let code=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk'&&x.isEntry).code;
 for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime']) code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
 return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
async function mount(Component,props={}) { const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,close:async()=>{await act(async()=>root.unmount());host.remove();}}; }
const Preview=await compile();
test('Rendered preview permits only ticket-specific actions', async()=>{
 const view=await mount(Preview,{isDevPreview:true,lang:'vi'}); const {host}=view;
 try { assert.match(host.textContent,/CASE-2026-0049/);const select=host.querySelector('select');await act(async()=>{select.value='case-ready-to-open';select.dispatchEvent(new window.Event('change',{bubbles:true}));});const open=[...host.querySelectorAll('button')].find(b=>/Mở phiên/.test(b.textContent));assert.ok(open);await act(async()=>open.click());assert.match(host.textContent,/HDS-/);assert.equal([...host.querySelectorAll('button')].some(b=>/Ký nhận|Lưu trữ|Giao tài sản/.test(b.textContent)),false); } finally { await view.close(); }
});
test('Real production build rejects preview override without synthetic success', async()=>{
 const previous=globalThis.fetch;const calls=[];globalThis.fetch=async(url)=>{calls.push(url);return new Response(JSON.stringify({code:'BACKEND_NOT_READY'}),{status:503,headers:{'Content-Type':'application/json'}});};
 const Production=await compile(true);const view=await mount(Production,{isDevPreview:true,lang:'vi'});
 try { assert.ok(view.host.querySelector('[role=alert]')); assert.ok(calls.some(url=>url.includes('/staff/verification-cases'))); assert.doesNotMatch(view.host.textContent,/CASE-2026-0049|HDS-/); assert.equal(view.host.querySelector('form'),null); } finally {await view.close();globalThis.fetch=previous;}
});

test('Refresh fetches the selected case again without changing the scenario', async () => {
 globalThis.__refreshLoads = [];
 let refreshes = 0;
 const view = await mount(Preview, {isDevPreview:true,lang:'en',onRefresh:()=>{refreshes++;}});
 try {
  const select = view.host.querySelector('select');
  await act(async()=>{select.value='case-ready-to-open';select.dispatchEvent(new window.Event('change',{bubbles:true}));});
  const before = globalThis.__refreshLoads.length;
  await act(async()=>view.host.querySelector('button[title="Refresh Data"]').click());
  assert.equal(globalThis.__refreshLoads.length,before+1);
  assert.equal(globalThis.__refreshLoads.at(-1),'case-ready-to-open');
  assert.equal(view.host.querySelector('select').value,'case-ready-to-open');
  assert.equal(refreshes,1);
 } finally {await view.close();delete globalThis.__refreshLoads;}
});
