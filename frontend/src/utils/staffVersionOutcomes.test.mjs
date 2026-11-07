import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { fetchBasisDossier } from '../pages/staff/staffLegalDocumentsService.js';
import { validBasisLegalHistory } from './staffDecisionContracts.js';
import { distributionFixture } from './staffDistributionFixture.mjs';

const dom=new JSDOM('<body></body>',{url:'http://localhost/staff/legal-documents',pretendToBeVisual:true});
globalThis.window=dom.window;globalThis.document=dom.window.document;globalThis.IS_REACT_ACT_ENVIRONMENT=true;
async function component(entry){
 const bundle=await build({configFile:false,plugins:[react()],logLevel:'silent',build:{write:false,minify:false,lib:{entry,formats:['es']},rollupOptions:{external:['react','react-dom','react-dom/client','react/jsx-runtime']}}});
 let code=(Array.isArray(bundle)?bundle[0]:bundle).output.find(x=>x.type==='chunk'&&x.isEntry).code;
 for(const name of ['react','react-dom','react-dom/client','react/jsx-runtime'])code=code.replaceAll(`from "${name}"`,`from "${import.meta.resolve(name)}"`);
 return import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
}
const {WillComparisonOutcome,BasisVersionOutcome}=await component('src/components/staff/StaffDocumentOutcome.jsx');
const {default:StaffPage}=await component('src/pages/staff/StaffLegalDocumentsPage.jsx');
const id='11111111-1111-4111-8111-111111111111',eventId='22222222-2222-4222-8222-222222222222';
const entry={id:eventId,result:'LEGAL_REJECTED',reason:'Bản một thiếu dấu',decidedAt:'2026-11-02T03:22:00Z',currentScope:false};
test('a resumed dossier waiting for version two lets Staff edit a replacement despite version one being forwarded',async()=>{
 const previous=globalThis.fetch;
 let writes=0;
 globalThis.fetch=async (url,init={})=>{if(init.method==='POST')writes++;return new Response(JSON.stringify(String(url).includes('/basis-dossier')
  ?{id:eventId,caseId:id,route:'NOTARIAL',status:'DRAFT',disputeStatus:'NONE',requiredVersion:2,currentDecision:null,
    versions:[{version:1,documentNumber:'OLD',forwardStatus:'FORWARDED',allocations:[],legalHistory:[]}]}
  :String(url).includes('/distribution-workflow')?distributionFixture(id,{phase:'AWAITING_DOCUMENTS',allowed:['uploadDocuments']}):[]),{status:200,headers:{'Content-Type':'application/json'}});};
 try{await withRoot(async(host,root)=>{
  await act(async()=>root.render(React.createElement(StaffPage,{caseId:id,accessToken:'test',caseItem:{caseId:id,status:'OPEN',vaultStatus:'AWAITING_LEGAL_BASIS'},lang:'vi'})));
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  assert.match(host.textContent,/phiên bản hồ sơ số 2/);
  assert.doesNotMatch(host.textContent,/CHANGES_REQUESTED/);
  const intake=[...host.querySelectorAll('[role=tab]')].find(x=>/Tiếp nhận văn bản/.test(x.textContent));await act(async()=>intake.click());
  const inputs=[...host.querySelectorAll('form input:not([type=file]),form select')];
  assert.ok(inputs.length>0);assert.ok(inputs.every(x=>!x.disabled));
  const type=host.querySelector('form select');assert.equal(type.querySelector('option[value="COURT_JUDGMENT"]').disabled,true);
  const props=node=>node[Object.keys(node).find(key=>key.startsWith('__reactProps$'))];
  await act(async()=>props(type).onChange({target:{value:'COURT_JUDGMENT'}}));
  await act(async()=>props(host.querySelector('form')).onSubmit({preventDefault(){}}));
  assert.equal(writes,0);assert.match(host.textContent,/Hồ sơ hiện tiếp nhận văn bản công chứng/);
 });}finally{globalThis.fetch=previous;}
});
async function withRoot(fn){const host=document.createElement('div');document.body.append(host);const root=createRoot(host);try{await fn(host,root);}finally{await act(async()=>root.unmount());host.remove();}}

test('will outcomes distinguish match, mismatch, inconclusive, pending and unavailable without inheriting previous props',async()=>{
 await withRoot(async(host,root)=>{
  for(const [value,text] of [[{result:'MISMATCH',reason:'Thiếu trang',comparedAt:entry.decidedAt,digitalVersion:2},'Đối chiếu không khớp'],[null,'Chờ Ban Pháp lý đối chiếu'],[{result:'MATCH',reason:null,comparedAt:entry.decidedAt,digitalVersion:1},'Đối chiếu khớp'],[{result:'INCONCLUSIVE',reason:'Chưa rõ',comparedAt:entry.decidedAt,digitalVersion:1},'Chưa đủ cơ sở kết luận'],[undefined,'Chưa có dữ liệu kết quả đối chiếu']]){
   await act(async()=>root.render(React.createElement(WillComparisonOutcome,{comparison:value})));
   assert.ok(host.textContent.includes(text));
   if(value?.digitalVersion)assert.ok(host.textContent.includes('phiên bản '+value.digitalVersion));
   if(value===null)assert.doesNotMatch(host.textContent,/Thiếu trang/);
  }
 });
});

test('previous version and changed allocation decisions are historical, never pending/current approval',async()=>{
 await withRoot(async(host,root)=>{
  await act(async()=>root.render(React.createElement(BasisVersionOutcome,{version:{version:1,current:false,legalHistory:[entry]}})));
  assert.match(host.textContent,/Đã từ chối phê duyệt/);assert.match(host.textContent,/Phiên bản giấy tờ cũ/);
  await act(async()=>root.render(React.createElement(BasisVersionOutcome,{version:{version:2,current:true,legalHistory:[entry]}})));
  assert.match(host.textContent,/Phân bổ hoặc tình trạng hồ sơ đã thay đổi/);
  await act(async()=>root.render(React.createElement(BasisVersionOutcome,{version:{version:2,current:true,forwardStatus:'NOT_FORWARDED',legalHistory:[]}})));
  assert.match(host.textContent,/Chưa chuyển Ban Pháp lý/);assert.doesNotMatch(host.textContent,/Bản một thiếu dấu/);
 });
});

test('live dossier read rejects cross-case and malformed history instead of rendering misleading results',async()=>{
 const previous=globalThis.fetch;
 try{
  for(const body of [{caseId:eventId,versions:[]},{caseId:id,versions:[{legalHistory:[{...entry,result:'UNKNOWN'}]}]},{caseId:id,versions:[{legalHistory:[{...entry,currentScope:'yes'}]}]}]){
   globalThis.fetch=async()=>new Response(JSON.stringify(body),{status:200});
   await assert.rejects(fetchBasisDossier(id,{accessToken:'test'}),{code:'INVALID_RESPONSE'});
  }
  assert.equal(validBasisLegalHistory([entry]),true);
 }finally{globalThis.fetch=previous;}
});

test('history keeps rejection visible while folding older processing events',async()=>{
 await withRoot(async(host,root)=>{
  const latest={...entry,id:'33333333-3333-4333-8333-333333333333',result:'REQUEST_DOCUMENT_SUPPLEMENTATION',reason:'Bổ sung bản này'};
  const earlier={...entry,id:'44444444-4444-4444-8444-444444444444',result:'FRESH',reason:'Đã thẩm định trước đó'};
  await act(async()=>root.render(React.createElement(BasisVersionOutcome,{version:{version:1,current:false,legalHistory:[latest,entry,earlier]}})));
  const visible=[...host.querySelectorAll('.lv-staff-version-outcomes > .lv-staff-outcome')];
  assert.equal(visible.length,2);assert.match(visible[0].textContent,/Bổ sung bản này/);assert.match(visible[1].textContent,/Bản một thiếu dấu/);
  const details=host.querySelector('details');assert.equal(details.open,false);assert.match(details.textContent,/Đã thẩm định trước đó/);
  await act(async()=>details.querySelector('summary').click());assert.equal(details.open,true);
 });
});

test('actual Staff history table shows rejection only beside version one, leaving new version undecided',async()=>{
 const previous=globalThis.fetch;
 globalThis.fetch=async url=>{
  const value=String(url).includes('/basis-dossier')?{id:eventId,caseId:id,route:'COURT',status:'PROVIDED',disputeStatus:'DISPUTED',requiredVersion:2,currentDecision:null,
   versions:[{version:2,documentNumber:'V2-NEW',issuingAuthority:'TEST',forwardStatus:'NOT_FORWARDED',current:true,allocations:[],legalHistory:[]},{version:1,documentNumber:'V1-OLD',issuingAuthority:'TEST',forwardStatus:'FORWARDED',current:false,allocations:[],legalHistory:[entry]}]}
   :String(url).includes('/distribution-workflow')?distributionFixture(id,{phase:'AWAITING_DOCUMENTS',allowed:['uploadDocuments']}):[];
  return new Response(JSON.stringify(value),{status:200,headers:{'Content-Type':'application/json'}});
 };
 try{await withRoot(async(host,root)=>{
  await act(async()=>root.render(React.createElement(StaffPage,{caseId:id,accessToken:'staff-test',caseItem:{caseId:id,status:'OPEN',caseNumber:'HS-TEST',vaultStatus:'AWAITING_LEGAL_BASIS'},lang:'vi'})));
  await act(async()=>{await new Promise(r=>setTimeout(r,40));});
  const history=[...host.querySelectorAll('[role=tab]')].find(x=>/Lịch sử/.test(x.textContent));assert.ok(history);
  await act(async()=>history.click());
  const rows=[...host.querySelectorAll('.lv-history-table tbody tr')];assert.equal(rows.length,2);
  assert.match(rows[0].textContent,/V2-NEW/);assert.doesNotMatch(rows[0].textContent,/Bản một thiếu dấu/);
  assert.match(rows[1].textContent,/V1-OLD/);assert.match(rows[1].textContent,/Bản một thiếu dấu/);
 });}finally{globalThis.fetch=previous;}
});
