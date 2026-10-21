import {staffFixture, deliveredItem} from './staffReviewFixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/close-and-archive' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(name) {
  const result = await build({configFile:false,logLevel:'silent',build:{write:false,minify:false,lib:{entry:`src/pages/staff/${name}.jsx`,formats:['es']},rollupOptions:{external:['react','react/jsx-runtime']}}});
  let code=(Array.isArray(result)?result[0]:result).output.find(item=>item.type==='chunk'&&item.isEntry).code;
  for(const name of ['react','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'))).default;
}
const Close=await component('CloseAndArchivePage'),Confirm=await component('BeneficiaryConfirmationPage');
const caseId='11111111-1111-4111-8111-111111111111',sessionId='22222222-2222-4222-8222-222222222222',recipient='33333333-3333-4333-8333-333333333333';
const props={caseId,sessionId,accessToken:'synthetic-review-token',lang:'en'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const find=(host,text)=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
async function mount(Component,extra={}){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);await act(async()=>root.render(React.createElement(Component,{...props,...extra})));return{host,close:async()=>{await act(async()=>root.unmount());host.remove();}};}
test('Review: OPEN session with server-complete gates can close before a Staff receipt exists',async()=>{
  globalThis.fetch=staffFixture();
  const v=await mount(Close,{sessionStatus:'OPEN',assetData:{total:1,delivered:1},beneficiaryData:{total:1,confirmed:1}});
  try{const close=v.host.querySelector('.lv-ca-btn-primary');assert.ok(close);assert.equal(close.disabled,false,'BE requires close proof BEFORE receipt creation');}finally{await v.close();}
});
test('Review: missing server gate data must not mark completion or enable receipt creation',async()=>{
  const urls=[];globalThis.fetch=async(url)=>{urls.push(url);return url.endsWith('/completion-progress') ? json([]) : staffFixture()(url);};const v=await mount(Close);
  try{const receipt=find(v.host,'Generate Staff Receipt');assert.ok(receipt);assert.equal(receipt.disabled,true);assert.ok(urls.some(url=>url.endsWith('/completion-progress')),'App does not supply gates, so the page must load current progress from BE');}finally{await v.close();}
});
test('Review: live receipt request must never contain synthetic recipient or asset IDs',async()=>{
  let body;globalThis.fetch=async(url,init)=>init?.method==='POST'?(body=JSON.parse(init.body),json({message:'Invalid UUID'},400)):staffFixture({status:'COMPLETED',deliveries:[{...deliveredItem,assetId:recipient}]})(url);
  const vNoData=await mount(Close,{sessionStatus:'COMPLETED',assetData:{total:1,delivered:1},beneficiaryData:{total:1,confirmed:1}});
  try{await act(async()=>find(vNoData.host,'Generate Staff Receipt')?.click());assert.equal(body,undefined,'Must not substitute sessionId/caseId as recipientId/assetId');}finally{await vNoData.close();}
  const vWithData=await mount(Close,{sessionStatus:'COMPLETED',assetData:{total:1,delivered:1},beneficiaryData:{total:1,confirmed:1},recipientId:recipient,assetIds:[recipient]});
  try{await act(async()=>find(vWithData.host,'Generate Staff Receipt')?.click());assert.ok(body);assert.equal(body.recipientId,recipient);assert.deepEqual(body.assetIds,[recipient]);assert.notEqual(body.recipientId,sessionId);assert.notEqual(body.assetIds[0],caseId);}finally{await vWithData.close();}
});
test('Review: BE-confirmed beneficiary must be displayed as confirmed',async()=>{
  globalThis.fetch=async()=>json([{confirmationId:caseId,sessionId,beneficiaryId:recipient,status:'CONFIRMED',confirmedBy:caseId,confirmedAt:'2026-10-20T08:00:00Z',receiptReference:'REVIEW'}]);
  const v=await mount(Confirm,{initialBeneficiaries:[]});
  try{const option=[...v.host.querySelectorAll('option')].find(o=>o.value===recipient);assert.ok(option);assert.match(option.textContent,/confirmed/i);}finally{await v.close();}
});
test('Review: live confirmation page must not continuously reload its unchanged context',async()=>{
  let reads=0;globalThis.fetch=async()=>{if(++reads>3)return new Promise(()=>{});return json([{confirmationId:null,sessionId,beneficiaryId:recipient,status:'PENDING',confirmedBy:null,confirmedAt:null,receiptReference:null}]);};
  const v=await mount(Confirm);
  try{assert.equal(reads,1,'An unchanged case/session must not repeatedly request beneficiary-confirmations');}finally{await v.close();}
});
