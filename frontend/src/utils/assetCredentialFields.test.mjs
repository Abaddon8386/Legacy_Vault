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
const { AssetDetailModal }=await loadComponentModule('src/components/assets/AssetDetailModal.jsx');
const { ASSET_I18N }=await import('../pages/assets/assetI18n.js');
for (const lang of ['vi','en']) test(`asset dialog ${lang}: close icon and Escape close without submitting`, async () => {
 let closed=0, submitted=0;
 const view=await mount(AssetFormModal,{isOpen:true,lang,onClose:()=>closed++,onSubmit:()=>submitted++});
 try {
  const close=view.host.querySelector('.lv-modal__close-btn');
  assert.ok(close.querySelector('svg'));
  assert.equal(close.getAttribute('aria-label'),ASSET_I18N[lang].assets.closeBtn);
  await act(async()=>close.click());
  assert.equal(closed,1);
  await act(async()=>window.dispatchEvent(new window.KeyboardEvent('keydown',{key:'Escape'})));
  assert.equal(closed,2); assert.equal(submitted,0);
 } finally { await view.close(); }
});
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
 try{assert.equal(view.host.querySelector('#edit-credential-password').value,'');await change(view.host,'edit-asset-name','New name');await change(view.host,'edit-confirm-password','fixture-password');await submit(view.host);assert.equal(calls[0][0],'test-asset');assert.deepEqual(calls[0][1],{name:'New name',password:'fixture-password'});await change(view.host,'edit-credential-username','new-user');await change(view.host,'edit-credential-password','new-secret');await change(view.host,'edit-confirm-password','fixture-password');await submit(view.host);assert.deepEqual(JSON.parse(calls[1][1].payload),{username:'new-user',password:'new-secret'});}finally{await view.close();}
});
test('editing an asset accepts new images and documents while submitting them separately from metadata',async()=>{
 const asset={id:'test-asset',name:'Asset',assetType:'TEXT',description:'',hasPayload:true};let saved;
 const view=await mount(AssetEditModal,{isOpen:true,asset,t:ASSET_I18N.en,onClose(){},onSubmit:(_id,patch)=>{saved=patch;}});
 try{
  const image=new File(['image'],'new.png',{type:'image/png'}),doc=new File(['%PDF-1.7\n%%EOF'],'new.pdf',{type:'application/pdf'});
  const inputs=view.host.querySelectorAll('input[type=file]');assert.equal(inputs.length,2);
  for(const [input,file] of [[inputs[0],image],[inputs[1],doc]]){const key=Object.keys(input).find(k=>k.startsWith('__reactProps$'));await act(async()=>input[key].onChange({target:{files:[file],value:''}}));}
  await change(view.host,'edit-confirm-password','current-password');await submit(view.host);
  assert.deepEqual(saved.images,[image]);assert.deepEqual(saved.documents,[doc]);
 }finally{await view.close();}
});

test('revealed credential JSON is decrypted by API and displayed as labeled fields; legacy text remains readable',async()=>{
 const original=globalThis.fetch;const id='11111111-1111-4111-8111-111111111111',vaultId='22222222-2222-4222-8222-222222222222';
 const asset={id,vaultId,name:'Account',assetType:'CREDENTIAL',description:'',hasPayload:true,createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z'};
 globalThis.fetch=async url=>new Response(JSON.stringify(url.endsWith('/reveal')?{id,payload:JSON.stringify({username:'owner@example.test',password:'account-secret'})}:[]),{status:200,headers:{'Content-Type':'application/json'}});
 const view=await mount(AssetDetailModal,{isOpen:true,asset,vaultId,accessToken:'test-token',t:ASSET_I18N.en,lang:'en',onClose(){}});
 try{
  const reveal=[...view.host.querySelectorAll('button')].find(button=>button.textContent.includes('View secret content'));assert.ok(reveal);await act(async()=>reveal.click());
  const input=view.host.querySelector('input[type=password]');const inputKey=Object.keys(input).find(k=>k.startsWith('__reactProps$'));await act(async()=>inputKey&&input[inputKey].onChange({target:{value:'current-password'}}));
  await act(async()=>view.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.match(view.host.textContent,/Username/);assert.match(view.host.textContent,/owner@example\.test/);assert.match(view.host.textContent,/Password/);assert.match(view.host.textContent,/account-secret/);assert.doesNotMatch(view.host.textContent,/\{"username"/);
 }finally{await view.close();globalThis.fetch=original;}
});

test('View mode lists existing attachments without exposing edit, delete, or upload controls',async()=>{
 const original=globalThis.fetch;const id='11111111-1111-4111-8111-111111111111',vaultId='22222222-2222-4222-8222-222222222222';
 const asset={id,vaultId,name:'Read-only asset',assetType:'TEXT',description:'',hasPayload:false,createdAt:'2026-10-21T00:00:00Z',updatedAt:'2026-10-21T00:00:00Z'};
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/images')?[{id:'33333333-3333-4333-8333-333333333333',fileName:'photo.png',contentType:'image/png',sizeBytes:10}]:String(url).endsWith('/documents')?[{id:'44444444-4444-4444-8444-444444444444',fileName:'record.pdf',contentType:'application/pdf',sizeBytes:20,sha256:'a'.repeat(64)}]:{}),{status:200,headers:{'Content-Type':'application/json'}});
 const view=await mount(AssetDetailModal,{isOpen:true,asset,vaultId,accessToken:'test-token',t:ASSET_I18N.en,lang:'en',onClose(){}});
 try{
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  assert.equal(view.host.querySelector('input[type=file]'),null);assert.doesNotMatch(view.host.textContent,/Delete|Upload photos/);assert.match(view.host.textContent,/photo\.png/);
  const docs=[...view.host.querySelectorAll('button')].find(button=>button.textContent.includes('PDF / Word documents'));assert.ok(docs);await act(async()=>docs.click());
  await act(async()=>new Promise(resolve=>setTimeout(resolve,0)));
  assert.match(view.host.textContent,/record\.pdf/);assert.equal(view.host.querySelector('input[type=file]'),null);assert.doesNotMatch(view.host.textContent,/Delete|Upload documents/);
 }finally{await view.close();globalThis.fetch=original;}
});
