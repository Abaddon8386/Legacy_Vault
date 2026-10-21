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
      rollupOptions: { output: { codeSplitting: false }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return { exports: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')), code };
}


const { exports: { AssetEditModal } } = await loadComponentModule('src/components/assets/AssetEditModal.jsx');
const { ASSET_I18N } = await import('../pages/assets/assetI18n.js');
const asset = { id: '22222222-2222-4222-8222-222222222222', assetType: 'TEXT', name: 'Existing asset', description: '', hasPayload: true };
test('missing confirmation handler never bypasses password confirmation', async () => {
 let saves = 0;
 const view = await mount(AssetEditModal, {isOpen:true,asset,t:ASSET_I18N.en,onClose(){},onSubmit(){saves++;}});
 try {
  assert.ok(view.host.querySelector('#edit-confirm-password'));
  assert.equal(view.host.querySelector('button[type="submit"]').disabled, true);
  await change(view.host,'edit-asset-name','Updated name');
  await change(view.host,'edit-confirm-password','Any input');
  await submit(view.host);
  assert.equal(saves,0);
 } finally { await view.close(); }
});
async function mount(Component,props){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,props)));return {host,render:async next=>{await act(async()=>root.render(React.createElement(Component,next)));},close:async()=>{await act(async()=>root.unmount());host.remove();}};}
async function change(host,id,value){const field=host.querySelector('#'+id);assert.ok(field,id);const key=Object.keys(field).find(k=>k.startsWith('__reactProps$'));await act(async()=>{field[key].onChange({target:{value}});});}
async function submit(host){await act(async()=>host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));}
test('Bug 11: incorrect password never submits a patch; verified password permits one save',async()=>{
 let calls=0,patches=0;const view=await mount(AssetEditModal,{isOpen:true,asset:asset,t:ASSET_I18N.en,onClose(){},verifyPassword:async password=>{calls++;if(password!=='correct')throw Error('REAUTH_FAILED');return true;},onSubmit:()=>patches++});
 try{await change(view.host,'edit-asset-name','New asset');await change(view.host,'edit-confirm-password','wrong');await submit(view.host);assert.equal(patches,0);assert.equal(view.host.querySelector('#edit-confirm-password').value,'');assert.ok(view.host.querySelector('[role=alert]'));
 await change(view.host,'edit-confirm-password','correct');await submit(view.host);assert.equal(calls,2);assert.equal(patches,1);assert.equal(view.host.querySelector('#edit-confirm-password').value,'');
 }finally{await view.close();}
});

test('Bug 11: duplicate clicks and late password verification after unmount cannot save',async()=>{
 let finish,signal,calls=0,patches=0;const view=await mount(AssetEditModal,{isOpen:true,asset:asset,t:ASSET_I18N.en,onClose(){},verifyPassword:(_password,options)=>{signal=options.signal;calls++;return new Promise(resolve=>{finish=resolve;});},onSubmit:()=>patches++});
 await change(view.host,'edit-asset-name','New asset');await change(view.host,'edit-confirm-password','correct');await submit(view.host);await submit(view.host);assert.equal(calls,1);await view.close();assert.equal(signal.aborted,true);await act(async()=>finish(true));assert.equal(patches,0);
});


test('successful reauthentication followed by a save error is not reported as a password failure',async()=>{
 const view=await mount(AssetEditModal,{isOpen:true,asset,t:ASSET_I18N.en,onClose(){},verifyPassword:async()=>true,onSubmit:async()=>{throw Error('offline');}});
 try{await change(view.host,'edit-asset-name','Changed');await change(view.host,'edit-confirm-password','correct');await submit(view.host);
 assert.match(view.host.querySelector('[role=alert]').textContent,/Unable to update asset/);
 assert.doesNotMatch(view.host.querySelector('[role=alert]').textContent,/verify your password/);
 }finally{await view.close();}
});
test('replacing the verification handler aborts old approval and clears the password',async()=>{
 let finish,signal,patches=0;
 const props={isOpen:true,asset,t:ASSET_I18N.en,onClose(){},verifyPassword:(_password,opts)=>{signal=opts.signal;return new Promise(resolve=>{finish=resolve;});},onSubmit:()=>patches++};
 const view=await mount(AssetEditModal,props);
 try{await change(view.host,'edit-asset-name','Changed');await change(view.host,'edit-confirm-password','correct');await submit(view.host);
 await view.render({...props,verifyPassword:async()=>true});assert.equal(signal.aborted,true);
 await act(async()=>finish(true));assert.equal(patches,0);assert.equal(view.host.querySelector('#edit-confirm-password').value,'');
 }finally{await view.close();}
});
