import test from 'node:test';
import assert from 'node:assert/strict';
import { loadStaffCase, claimStaffCase, staffDocuments } from '../pages/staff/staffLiveService.js';
const id='12345678-1234-4234-8234-123456789012';
const record={id,caseId:id,receivedBy:id,receivedAt:'2026-10-20T05:00:00Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('Staff detail and claim use scoped endpoints, bearer, locale and abort',async()=>{
 const calls=[]; const signal=new AbortController().signal;
 const options={accessToken:'synthetic',lang:'en',signal,fetchFn:async(url,init)=>{calls.push({url,init});return json({caseId:id,status:'OPEN'});}};
 await loadStaffCase(id,options);await claimStaffCase(id,options);
 assert.equal(calls[0].url,'/api/v1/staff/verification-cases/'+id);
 assert.equal(calls[1].url,calls[0].url+'/claim');assert.equal(calls[1].init.method,'POST');
 assert.equal(calls[0].init.headers.Authorization,'Bearer synthetic');assert.equal(calls[0].init.headers['Accept-Language'],'en');assert.equal(calls[0].init.signal,signal);
});
for(const kind of ['death-documents','original-will-intakes'])test('Document receipt and field whitelist: '+kind,async()=>{
 let sent; const values={documentType:'DEATH_CERTIFICATE',issuingAuthority:' Test ',documentNumber:'123',issuedDate:'2026-10-19',deliveredByName:'Synthetic',receivedBy:'spoof',receivedAt:'spoof',caseId:'spoof'};
 const options={fetchFn:async(url,init)=>{sent={url,init};return json(record,201);}};
 assert.equal((await staffDocuments(id,kind,values,options)).id,id);
 const body=JSON.parse(sent.init.body);assert.equal('receivedBy' in body,false);assert.equal('receivedAt' in body,false);assert.equal('caseId' in body,false);
 assert.equal(sent.url,`/api/v1/staff/verification-cases/${id}/${kind}`);
 const list=await staffDocuments(id,kind,undefined,{fetchFn:async()=>json([record])});assert.equal(list.length,1);
});
test('Invalid case/receipt never becomes success or mock',async()=>{
 let count=0;const options={fetchFn:async()=>{count++;return json({caseId:id,status:'OPEN'});}};
 await assert.rejects(loadStaffCase('bad',options),{code:'VALIDATION_FAILED'});assert.equal(count,0);
 await assert.rejects(staffDocuments(id,'other',{},options),{code:'VALIDATION_FAILED'});
 await assert.rejects(staffDocuments(id,'death-documents',{}, {fetchFn:async()=>json({...record,caseId:'other'},201)}),{code:'INVALID_RESPONSE'});
 await assert.rejects(loadStaffCase(id,{fetchFn:async()=>json({caseId:'other',status:'OPEN'})}),{code:'INVALID_RESPONSE'});
});
for(const status of [401,403,404,409])test('Live staff propagates API error '+status,async()=>{
 await assert.rejects(claimStaffCase(id,{fetchFn:async()=>json({code:'SERVER_REJECTED'},status)}),{code:'SERVER_REJECTED',status});
});
