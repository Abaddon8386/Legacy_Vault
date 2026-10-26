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
 const result=await build({configFile:false,plugins:[react()],logLevel:'silent',define:{'import.meta.env.DEV':String(!production),'import.meta.env.PROD':String(production)},build:{write:false,minify:false,lib:{entry:'src/pages/legal/ControlledUnlockPage.jsx',formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
 let code=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk'&&x.isEntry).code;
 for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime']) code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
 return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
async function mount(Component,props={}) { const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,close:async()=>{await act(async()=>root.unmount());host.remove();}}; }
const Preview=await compile();
test('Rendered preview permits only ticket-specific actions', async()=>{
 const view=await mount(Preview,{isDevPreview:true,lang:'vi'}); const {host}=view;
 try { assert.match(host.textContent,/Đang khóa/);const select=host.querySelector('select');await act(async()=>{select.value='unlocked';select.dispatchEvent(new window.Event('change',{bubbles:true}));});assert.match(host.textContent,/Đã mở khóa \(minh họa\)/);assert.equal(host.querySelectorAll('button').length,1); } finally { await view.close(); }
});
test('Real production build rejects preview override without synthetic success', async()=>{
 const Production=await compile(true);const view=await mount(Production,{isDevPreview:true,lang:'vi'});
 try { assert.match(view.host.textContent,/Chưa tải được trạng thái kho/i); assert.equal(view.host.querySelector('form'),null); } finally {await view.close();}
});
