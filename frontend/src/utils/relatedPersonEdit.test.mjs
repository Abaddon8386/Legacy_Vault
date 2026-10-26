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
dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute('open','');};
dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute('open');};
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


const { default: People }=await loadComponentModule('src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx');
const vault='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',benId='cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const trustee={id,vaultId:vault,fullName:'Old trustee',phone:null,email:'trustee@example.test',relationship:'Friend',note:'Keep existing note',status:'APPOINTED',appointedAt:'2026-10-13T00:00:00Z',revokedAt:null};
const beneficiary={id:benId,vaultId:vault,fullName:'Old beneficiary',phone:null,email:'ben@example.test',relationship:'Child',dateOfBirth:'1995-05-20',status:'DESIGNATED',hasAccount:false,hasIdentityNumber:true,createdAt:'2026-10-13T00:00:00Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const page=content=>({content,page:0,size:20,totalElements:content.length,totalPages:content.length?1:0});
async function mount(){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(People,{vaultId:vault,accessToken:'test-token',lang:'en'})));return{host,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
function props(element){return element[Object.keys(element).find(k=>k.startsWith('__reactProps$'))];}
async function change(host,id,value){await act(async()=>props(host.querySelector('#'+id)).onChange({target:{value}}));}
function listResponse(url){if(url.includes('configuration-check'))return json({vaultId:vault,ready:true,beneficiaryCount:1,issues:[]});return json(page([url.includes('/trustees')?trustee:beneficiary]));}
for(const kind of ['trustee','beneficiary'])test(`Bugs 5–7: edit ${kind} validates fields and renders only server-confirmed changes`,async()=>{
 const oldFetch=globalThis.fetch;const writes=[];
 globalThis.fetch=async(url,options={})=>{if(options.method==='PUT'){writes.push({url,body:JSON.parse(options.body)});return json({...kind==='trustee'?trustee:beneficiary,...JSON.parse(options.body),fullName:'Server-confirmed name'});}return listResponse(url);};
 const view=await mount();try{
 const section=view.host.querySelector(`section[aria-labelledby="${kind}-heading"]`);
 await act(async()=>section.querySelector('.lv-tb-entity-header button').click());
 const form=view.host.querySelector('.lv-tb-edit-backdrop form');assert.ok(form);
 await change(view.host,'related-edit-email','invalid');await act(async()=>props(view.host.querySelector('#related-edit-email')).onBlur());
 assert.ok(form.querySelector('[role=alert]'));await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(writes.length,0);
 await change(view.host,'related-edit-email','valid@example.test');await change(view.host,'related-edit-fullName','New name');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(writes.length,1);assert.equal(writes[0].url,kind==='trustee'?'/api/v1/trustees/'+id:'/api/v1/vaults/'+vault+'/beneficiaries/'+benId);
 assert.equal(writes[0].body.fullName,'New name');assert.match(section.textContent,/Server-confirmed name/);
 if(kind==='trustee')assert.equal(writes[0].body.note,'Keep existing note');else{assert.equal(writes[0].body.dateOfBirth,'1995-05-20');assert.equal('identityNumber' in writes[0].body,false);}
 assert.equal(view.host.querySelector('.lv-tb-edit-backdrop'),null);
 }finally{await view.close();globalThis.fetch=oldFetch;}
});
test('Bugs 6–7: API failure preserves input; cancel discards draft; late response is ignored',async()=>{
 const oldFetch=globalThis.fetch;let fail=true,finish,signal,writes=0;
 globalThis.fetch=async(url,options={})=>{if(options.method==='PUT'){writes++;if(fail)return json({code:'CONFLICT'},409);signal=options.signal;return new Promise(resolve=>{finish=resolve;});}return listResponse(url);};
 const view=await mount();try{
 const section=view.host.querySelector('section[aria-labelledby="beneficiary-heading"]');await act(async()=>section.querySelector('.lv-tb-entity-header button').click());
 await change(view.host,'related-edit-fullName','Draft name');let form=view.host.querySelector('.lv-tb-edit-backdrop form');
 await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));assert.equal(view.host.querySelector('#related-edit-fullName').value,'Draft name');assert.ok(form.querySelector('[role=alert]'));
 fail=false;await act(async()=>{form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}));});assert.equal(writes,2);
 await act(async()=>view.host.querySelector('.lv-tb-edit-backdrop .lv-tb-dialog-header button').click());assert.equal(signal.aborted,true);
 await act(async()=>finish(json({...beneficiary,fullName:'Late name'})));assert.doesNotMatch(section.textContent,/Late name/);
 await act(async()=>section.querySelector('.lv-tb-entity-header button').click());assert.equal(view.host.querySelector('#related-edit-fullName').value,'Old beneficiary');
 }finally{await view.close();globalThis.fetch=oldFetch;}
});
test('Bug 5: create form validates email and phone on blur, not only after submit',async()=>{
 const oldFetch=globalThis.fetch;globalThis.fetch=async url=>url.includes('configuration-check')?json({vaultId:vault,ready:false,beneficiaryCount:0,issues:[{code:'BENEFICIARY_REQUIRED'}]}):json(page([]));
 const view=await mount();try{
 for(const prefix of ['trustee','ben']){await change(view.host,prefix+'-email','invalid');await act(async()=>props(view.host.querySelector('#'+prefix+'-email')).onBlur());assert.equal(view.host.querySelector('#'+prefix+'-email').classList.contains('has-error'),true);await change(view.host,prefix+'-phone','abc');await act(async()=>props(view.host.querySelector('#'+prefix+'-phone')).onBlur());assert.equal(view.host.querySelector('#'+prefix+'-phone').classList.contains('has-error'),true);}
 }finally{await view.close();globalThis.fetch=oldFetch;}
});

test('editing a birthdate into minority recommends guardian without blocking save',async()=>{
 const oldFetch=globalThis.fetch;let writes=0;
 globalThis.fetch=async(url,options={})=>{if(options.method==='PUT')writes++;return listResponse(url);};
 const view=await mount();try{
  const section=view.host.querySelector('section[aria-labelledby="beneficiary-heading"]');
  await act(async()=>section.querySelector('.lv-tb-entity-header button').click());
  await change(view.host,'related-edit-dateOfBirth',`${new Date().getFullYear()-10}-01-01`);
  const form=view.host.querySelector('.lv-tb-edit-backdrop form');
  assert.match(view.host.querySelector('#related-guardian-notice').textContent,/guardian is recommended/);
  assert.equal(form.querySelector('button[type="submit"]').disabled,false);
  await act(async()=>form.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true})));
  assert.equal(writes,1);
  await change(view.host,'related-edit-dateOfBirth','1995-05-20');
  assert.equal(view.host.querySelector('#related-guardian-notice'),null);
  assert.equal(form.querySelector('button[type="submit"]').disabled,false);
 }finally{await view.close();globalThis.fetch=oldFetch;}
});
