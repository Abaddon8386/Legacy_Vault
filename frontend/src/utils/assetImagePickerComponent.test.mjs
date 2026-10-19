import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom=new JSDOM('<html><body></body></html>',{url:'http://localhost/assets'});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const {createRoot}=await import('react-dom/client');
const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,
  lib:{entry:'src/components/assets/AssetImagePicker.jsx',formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
let code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(i=>i.type==='chunk'&&i.isEntry).code;
for(const name of ['react','react/jsx-runtime'])code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');
const {AssetImagePicker}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
for(const lang of ['vi','en'])test('photo picker '+lang+' validates count, previews, removes and revokes URLs',async()=>{
  const originalCreate=URL.createObjectURL, originalRevoke=URL.revokeObjectURL;
  let created=0, revoked=0;
  URL.createObjectURL=()=>{created++;return 'blob:test-photo';};URL.revokeObjectURL=()=>{revoked++;};
  const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
  function Wrapper(){const[files,setFiles]=useState([]);return React.createElement(AssetImagePicker,{files,onChange:setFiles,lang});}
  try{
    await act(async()=>root.render(React.createElement(Wrapper)));
    const input=host.querySelector('input[type=file]');assert.ok(input.multiple);assert.match(input.accept,/image\/png/);
    const file=new File(['a'],'a.png',{type:'image/png'});
    const change=async(files)=>{Object.defineProperty(input,'files',{configurable:true,value:files});await act(async()=>input.dispatchEvent(new dom.window.Event('change',{bubbles:true})));};
    await change(Array(6).fill(file));assert.ok(host.querySelector('[role=alert]'));assert.equal(created,0);
    await change([file]);assert.equal(host.querySelectorAll('img').length,1);assert.equal(created,1);
    assert.equal(host.querySelector('[role=alert]'),null);
    await act(async()=>host.querySelector('button[type=button]').click());
    assert.equal(host.querySelectorAll('img').length,0);assert.equal(revoked,1);
  }finally{await act(async()=>root.unmount());host.remove();URL.createObjectURL=originalCreate;URL.revokeObjectURL=originalRevoke;}
});
