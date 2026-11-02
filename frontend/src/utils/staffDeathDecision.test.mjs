import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url:'http://localhost/staff/cases', pretendToBeVisual:true });
globalThis.window=dom.window;
globalThis.document=dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry:'src/pages/staff/StaffLiveCase.jsx',formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
let code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(x=>x.type==='chunk'&&x.isEntry).code;
for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime']) code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
const {default:StaffLiveCase,DeathDocumentDecision}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
const caseId='11111111-1111-4111-8111-111111111111';
const decision=(result,reason)=>({result,reason,decidedAt:'2026-11-02T03:22:00Z'});

test('actual Staff intake list renders each paper’s own decision and refreshes when returning from Legal',async()=>{
 let second=null,reads=0;
 const original=globalThis.fetch;
 globalThis.fetch=async url=>new Response(JSON.stringify(String(url).endsWith('/death-documents')?(reads++,[
  {id:'22222222-2222-4222-8222-222222222222',caseId,receivedBy:caseId,receivedAt:'2026-11-02T02:00:00Z',documentNumber:'PAPER-1',legalDecision:decision('REJECTED','Thiếu trang bản cũ')},
  {id:'33333333-3333-4333-8333-333333333333',caseId,receivedBy:caseId,receivedAt:'2026-11-02T02:01:00Z',documentNumber:'PAPER-2',legalDecision:second},
 ]):{caseId,status:'OPEN',assignmentStatus:'OWNED_BY_ME',caseNumber:'HS-TEST',vaultName:'Test'}),{status:200,headers:{'Content-Type':'application/json'}});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  await act(async()=>{root.render(React.createElement(StaffLiveCase,{caseId,accessToken:'test-token',lang:'vi'}));});
  await act(async()=>{await new Promise(r=>setTimeout(r,30));});
  let rows=host.querySelectorAll('.lv-staff-record-item');
  assert.equal(rows.length,2);
  assert.match(rows[0].textContent,/Đã từ chối/);
  assert.match(rows[0].textContent,/Thiếu trang bản cũ/);
  assert.match(rows[1].textContent,/Chờ Legal kiểm tra/);
  assert.doesNotMatch(rows[1].textContent,/Thiếu trang bản cũ/);
  second=decision('REJECTED','Bản mới thiếu thông tin');
  await act(async()=>{window.dispatchEvent(new window.Event('focus'));await new Promise(r=>setTimeout(r,30));});
  rows=host.querySelectorAll('.lv-staff-record-item');
  assert.match(rows[1].textContent,/Đã từ chối/);
  assert.match(rows[1].textContent,/Bản mới thiếu thông tin/);
  assert.match(rows[0].textContent,/Thiếu trang bản cũ/);
  assert.ok(reads>=2);
 }finally{await act(async()=>root.unmount());host.remove();globalThis.fetch=original;}
});

test('accepted, supplementation and unavailable data have distinct readable labels in VI/EN',async()=>{
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try{
  for(const [value,en,text] of [[decision('APPROVED','Đủ thông tin'),false,'Đã chấp thuận'],[decision('NEEDS_CORRECTION','Thiếu bản scan'),false,'Cần bổ sung giấy tờ'],[undefined,false,'Chưa có dữ liệu kết quả Legal'],[null,true,'Awaiting Legal review']]){
   await act(async()=>root.render(React.createElement(DeathDocumentDecision,{decision:value,en})));
   assert.ok(host.textContent.includes(text));
  }
 }finally{await act(async()=>root.unmount());host.remove();}
});
