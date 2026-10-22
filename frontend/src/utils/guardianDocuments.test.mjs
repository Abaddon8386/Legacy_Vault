import test from 'node:test';
import assert from 'node:assert/strict';
import React,{act} from 'react';
import {createRoot} from 'react-dom/client';
import {JSDOM} from 'jsdom';
import {build} from 'vite';
import react from '@vitejs/plugin-react';
import {guardianService} from '../services/guardianService.js';
import {assetDocumentService,validateDocuments} from '../services/assetDocumentService.js';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'content-type':'application/json'}});
const ctx={beneficiaryId:id,revision:0,ageStatus:'MINOR',guardianRecommended:true,guardian:null};
const doc={id:other,fileName:'synthetic.pdf',sizeBytes:12,contentType:'application/pdf',sha256:'a'.repeat(64),createdAt:'2026-10-22T00:00:00Z'};
const dom=new JSDOM('<body></body>',{url:'http://localhost/assets',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.HTMLElement=dom.window.HTMLElement;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
dom.window.HTMLElement.prototype.attachEvent=()=>{};dom.window.HTMLElement.prototype.detachEvent=()=>{};
async function compile(entry){const result=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry,formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});let code=(Array.isArray(result)?result[0]:result).output.find(x=>x.type==='chunk'&&x.isEntry).code;for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime'])code=code.replaceAll('from "'+name+'"','from "'+import.meta.resolve(name)+'"');return(await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64')));}
const Guardian=(await compile('src/pages/trusteeBeneficiary/GuardianPanel.jsx')).default;
const Assets=(await compile('src/pages/assets/AssetManagementPage.jsx')).AssetManagementPage;
const props=element=>element[Object.keys(element).find(k=>k.startsWith('__reactProps$'))];
const button=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent.trim()===text);
async function mount(Component,options){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,options)));return{host,root,close:async()=>{await act(async()=>root.unmount());host.remove();}};}

test('guardian service binds beneficiary/revision, rejects missing contact and mismatched receipt',async()=>{
 const calls=[];const fetchFn=async(url,init)=>{calls.push({url,init});return json({...ctx,revision:1,guardian:{id:other,fullName:'Synthetic'}});};
 const result=await guardianService.save(id,id,{expectedRevision:0,fullName:' Synthetic ',relationship:' Parent ',email:'test@example.test'}, {fetchFn});
 assert.equal(result.revision,1);assert.equal(JSON.parse(calls[0].init.body).expectedRevision,0);
 await assert.rejects(guardianService.save(id,id,{expectedRevision:0,fullName:'A',relationship:'B'}, {fetchFn}),{code:'VALIDATION_FAILED'});
 await assert.rejects(guardianService.get(id,id,{fetchFn:async()=>json({...ctx,beneficiaryId:other})}),{code:'INVALID_RESPONSE'});
});
test('document transport separates multipart from password download and rejects invalid receipts',async()=>{
 const file=new File(['%PDF-test'],'test.pdf',{type:'application/pdf'});validateDocuments([file]);
 assert.throws(()=>validateDocuments([new File(['bad'],'evil.exe')]),{code:'VALIDATION_FAILED'});
 let calls=0;
 const options={accessToken:'synthetic',fetchFn:async(url,init)=>{calls++;assert.ok(init.body instanceof FormData);assert.equal(init.body.getAll('documents').length,1);assert.equal(init.headers['Content-Type'],undefined);return json([doc],201);}};
 assert.equal((await assetDocumentService.upload(id,id,[file],options))[0].id,other);assert.equal(calls,1);
 await assert.rejects(assetDocumentService.list(id,id,{fetchFn:async()=>json([{}])}),{code:'INVALID_RESPONSE'});
 await assert.rejects(assetDocumentService.download(id,id,doc,'pwd',{fetchFn:async()=>json({code:'ACCESS_DENIED'},403)}),{code:'ACCESS_DENIED',status:403});
});
test('guardian panel loads on demand and aborts pending writes when principal changes',async()=>{
 const old=globalThis.fetch;let release,signal,writes=0;
 globalThis.fetch=async(url,init)=>{if(init.method==='PUT'){writes++;signal=init.signal;return new Promise(resolve=>{release=resolve;});}return json(ctx);};
 const options={vaultId:id,beneficiaryId:id,accessToken:'one',lang:'vi'};const v=await mount(Guardian,options);
 try{
  await act(async()=>button(v.host,'Người giám hộ').click());
  await act(async()=>button(v.host,'Thêm / thay thế người giám hộ').click());
  const inputs=v.host.querySelectorAll('input');for(const [index,value] of [[0,'Synthetic'],[1,'Parent'],[2,'test@example.test']])await act(async()=>props(inputs[index]).onChange({target:{value}}));
  await act(async()=>{v.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));v.host.querySelector('form').dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(writes,1);
  await act(async()=>v.root.render(React.createElement(Guardian,{...options,accessToken:'two'})));assert.equal(signal.aborted,true);
  await act(async()=>release(json({...ctx,guardian:{id:other,fullName:'OLD PRIVATE'}})));assert.doesNotMatch(v.host.textContent,/OLD PRIVATE|Synthetic/);
 }finally{await v.close();globalThis.fetch=old;}
});
test('asset create then failed document upload retries files without creating a duplicate asset',async()=>{
 const old=globalThis.fetch;let creates=0,uploads=0;
 const asset={id:other,vaultId:id,name:'Synthetic',assetType:'TEXT',hasPayload:true,description:null,createdAt:'2026-10-22T00:00:00Z',updatedAt:'2026-10-22T00:00:00Z'};
 globalThis.fetch=async(url,init={})=>{
  if(init.method==='POST'&&url.endsWith('/documents'))return ++uploads===1?json({code:'DOCUMENT_REQUEST_FAILED'},503):json([doc],201);
  if(init.method==='POST'){creates++;return json(asset,201);}
  return json({content:[],page:0,size:10,totalElements:0,totalPages:0});
 };
 const v=await mount(Assets,{vaultId:id,accessToken:'synthetic',lang:'vi'});
 try{
  await act(async()=>button(v.host,'Thêm tài sản mới').click());
  const form=v.host.querySelector('form');
  for(const [selector,value]of [['#asset-name','Synthetic'],['select','TEXT'],['textarea[name="payload"]','Synthetic secret']]){
   const element=form.querySelector(selector);if(element)await act(async()=>props(element).onChange({target:{value}}));
  }
  // Use the component submission boundary to isolate file retry behavior from field markup.
  const picker=form.querySelector('input[accept=".pdf,.doc,.docx"]');
  await act(async()=>props(picker).onChange({target:{files:[new File(['%PDF-test'],'test.pdf',{type:'application/pdf'})],value:''}}));
  const textarea=form.querySelector('textarea');if(textarea)await act(async()=>props(textarea).onChange({target:{value:'Synthetic secret'}}));
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(creates,1);assert.equal(uploads,1);assert.match(v.host.textContent,/Tài sản đã lưu/);
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(creates,1);assert.equal(uploads,2);assert.equal(v.host.querySelector('form'),null);
 }finally{await v.close();globalThis.fetch=old;}
});
