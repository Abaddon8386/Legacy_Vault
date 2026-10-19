import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/profile' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent=()=>{};
dom.window.HTMLElement.prototype.detachEvent=()=>{};
async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}


const { AssetFormModal }=await loadComponentModule('src/components/assets/AssetFormModal.jsx');
const { AssetEditModal }=await loadComponentModule('src/components/assets/AssetEditModal.jsx');
const { ASSET_I18N }=await import('../pages/assets/assetI18n.js');
async function mount(Component,props){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function change(host,id,value){const field=host.querySelector('#'+id);assert.ok(field,id);const key=Object.keys(field).find(k=>k.startsWith('__reactProps$'));await act(async()=>field[key].onChange({target:{value}}));}
async function submit(host){await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
for(const lang of ['vi','en']) test(`Bug 10: ${lang} credential form uses dedicated inputs and the existing payload contract`,async()=>{
 let saved;const view=await mount(AssetFormModal,{isOpen:true,onClose(){},onSubmit:data=>{saved=data;},lang});
 try{await change(view.host,'asset-name','Account');await change(view.host,'asset-type','CREDENTIAL');
 assert.equal(view.host.querySelector('#asset-payload'),null);assert.equal(view.host.querySelector('#asset-credential-password').type,'password');
 await change(view.host,'asset-credential-username',' user ');await change(view.host,'asset-credential-password',' pass with spaces ');await submit(view.host);
 assert.deepEqual(JSON.parse(saved.payload),{username:'user',password:' pass with spaces '});assert.equal(saved.assetType,'CREDENTIAL');
 await change(view.host,'asset-type','TEXT');assert.ok(view.host.querySelector('#asset-payload'));assert.equal(view.host.querySelector('#asset-credential-password'),null);
 await change(view.host,'asset-payload','Original free text');await submit(view.host);assert.equal(saved.payload,'Original free text');
 }finally{await view.close();}
});
test('Bug 10: empty credential fields cannot create an empty secret',async()=>{let calls=0;const view=await mount(AssetFormModal,{isOpen:true,onClose(){},onSubmit:()=>calls++});try{await change(view.host,'asset-name','Account');await change(view.host,'asset-type','CREDENTIAL');await submit(view.host);assert.equal(calls,0);assert.ok(view.host.querySelector('[role=alert]'));}finally{await view.close();}});
test('Bug 10: metadata edits do not replace an existing credential payload; replacement is explicit',async()=>{
 const asset={id:'test-asset',name:'Old name',assetType:'CREDENTIAL',description:'',hasPayload:true};const calls=[];
 const view=await mount(AssetEditModal,{isOpen:true,asset,t:ASSET_I18N.en,onClose(){},onSubmit:(...args)=>calls.push(args)});
 try{assert.equal(view.host.querySelector('#edit-credential-password').value,'');await change(view.host,'edit-asset-name','New name');await submit(view.host);assert.deepEqual(calls[0],['test-asset',{name:'New name'}]);await change(view.host,'edit-credential-username','new-user');await change(view.host,'edit-credential-password','new-secret');await submit(view.host);assert.deepEqual(JSON.parse(calls[1][1].payload),{username:'new-user',password:'new-secret'});}finally{await view.close();}
});
