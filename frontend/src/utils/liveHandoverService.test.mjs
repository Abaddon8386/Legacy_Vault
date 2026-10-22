import test from 'node:test';
import assert from 'node:assert/strict';
import {listLiveSessions,getLiveSession,openLiveSession,cancelLiveSession,handoverUrl,fetchStaffCaseBeneficiaries,recordCounterAttestation,requestInvitationEmail} from '../pages/staff/liveHandoverService.js';
const id='11111111-1111-4111-8111-111111111111',sid='22222222-2222-4222-8222-222222222222',bid='33333333-3333-4333-8333-333333333333';
const record={caseId:id,sessionId:sid,vaultId:id,staffId:id,status:'OPEN',openedAt:'2026-10-20T06:00:00',closedAt:null};
const json=(v,status=200)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json'}});
test('Session contract: list/get/open/cancel use scoped paths, auth, locale, signals and exact methods',async()=>{
 const calls=[];const signal=new AbortController().signal;
 const options={accessToken:'synthetic',lang:'en',signal,fetchFn:async(url,init)=>{calls.push({url,init});return json(init.method==='PATCH'?{...record,status:'CANCELLED',closedAt:'2026-10-20T07:00:00'}:init.method==='POST'?record:url.endsWith('handover-sessions')?[record]:record,init.method==='POST'?201:200);}};
 await listLiveSessions(id,options);await getLiveSession(id,sid,options);await openLiveSession(id,options);await cancelLiveSession(id,sid,options);
 assert.deepEqual(calls.map(c=>c.init.method),['GET','GET','POST','PATCH']);
 for(const c of calls){assert.ok(c.url.startsWith(`/api/v1/staff/verification-cases/${id}/handover-sessions`));assert.equal(c.init.headers.Authorization,'Bearer synthetic');assert.equal(c.init.headers['Accept-Language'],'en');assert.equal(c.init.signal,signal);}
 assert.equal(calls[2].init.body,undefined);assert.deepEqual(JSON.parse(calls[3].init.body),{status:'CANCELLED'});
});
test('Beneficiary counter and invitation contract PS-95/88/106',async()=>{
 const calls=[];
 const options={accessToken:'token-123',lang:'vi',fetchFn:async(url,init)=>{calls.push({url,init});return json(init.method==='POST'?(url.includes('identity-attestations')?{attestationId:id,caseId:id,beneficiaryId:bid}:{outboxId:'11111111-1111-4111-8111-111111111111',invitationId:'22222222-2222-4222-8222-222222222222',invitationGeneration:2,queueStatus:'QUEUED',transportStatus:'DISABLED'}):[{beneficiaryId:bid}],init.method==='POST'?(url.includes('identity-attestations')?201:202):200);}};
 const list=await fetchStaffCaseBeneficiaries(id,options);
 assert.equal(list.length,1);
 assert.equal(calls[0].url,`/api/v1/staff/verification-cases/${id}/beneficiaries`);
 assert.equal(calls[0].init.method,'GET');

 await recordCounterAttestation(id,bid,{evidenceReference:'CCCD 012345678901',confirmedEmail:'test@example.com'},options);
 assert.equal(calls[1].url,`/api/v1/staff/verification-cases/${id}/beneficiaries/${bid}/identity-attestations`);
 assert.equal(calls[1].init.method,'POST');
 assert.deepEqual(JSON.parse(calls[1].init.body),{evidenceReference:'CCCD 012345678901',confirmedEmail:'test@example.com'});

 await requestInvitationEmail(id,bid,2,options);
 assert.equal(calls[2].url,`/api/v1/staff/verification-cases/${id}/beneficiaries/${bid}/invitation-email`);
 assert.equal(calls[2].init.method,'POST');
 assert.deepEqual(JSON.parse(calls[2].init.body),{expectedGeneration:2});

 await assert.rejects(recordCounterAttestation(id,bid,{evidenceReference:''},options),{code:'VALIDATION_FAILED'});
 await assert.rejects(recordCounterAttestation('bad',bid,{evidenceReference:'ok'},options),{code:'VALIDATION_FAILED'});
});
test('Invalid IDs cannot trigger requests; completion cannot be forged through cancel endpoint',async()=>{

 let calls=0;const options={fetchFn:async()=>{calls++;return json(record);}};
 await assert.rejects(listLiveSessions('bad',options),{code:'VALIDATION_FAILED'});await assert.rejects(getLiveSession(id,'bad',options),{code:'VALIDATION_FAILED'});assert.equal(calls,0);
 await assert.rejects(cancelLiveSession(id,sid,{fetchFn:async()=>json({...record,status:'COMPLETED',closedAt:'2026-10-20T07:00:00'})}),{code:'INVALID_RESPONSE'});
});
for(const bad of [{...record,caseId:sid},{...record,status:'ACTIVE'},{...record,closedAt:'2026-10-20T07:00:00'},{...record,staffId:'internal-1'},{...record,openedAt:'bad'}])test('Reject inconsistent server receipt '+JSON.stringify(bad),async()=>{
 await assert.rejects(getLiveSession(id,sid,{fetchFn:async()=>json(bad)}),{code:'INVALID_RESPONSE'});
});
test('Duplicate open sessions and malformed list are rejected',async()=>{
 for(const value of [{},[record,record],[record,{...record,sessionId:id}]])await assert.rejects(listLiveSessions(id,{fetchFn:async()=>json(value)}),{code:'INVALID_RESPONSE'});
});
for(const status of [401,403,404,409])test('API error preserved without mock '+status,async()=>{
 await assert.rejects(openLiveSession(id,{fetchFn:async()=>json({code:'HANDOVER_SESSION_INVALID_STATE'},status)}),{code:'HANDOVER_SESSION_INVALID_STATE',status});
});
test('Navigation carries only validated case/session IDs',()=>{
 assert.equal(handoverUrl('/staff/beneficiary-accounts',id,sid),`/staff/beneficiary-accounts?caseId=${id}&sessionId=${sid}`);
 assert.equal(handoverUrl('/staff/handover','bad',sid),'/staff/handover');
});
