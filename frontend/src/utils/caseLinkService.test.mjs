import test from 'node:test';
import assert from 'node:assert/strict';
import { liveCaseLinkActions as bene, liveCounterLinkActions as staff } from './caseLinkService.js';
import { readUser } from '../api/contracts.js';
import { isPersonalRecipient } from './caseLinkModel.js';
import { resolvePostLoginRoute } from './staffLegalDocumentsValidation.js';
const caseId='11111111-1111-4111-8111-111111111111', requestId='22222222-2222-4222-8222-222222222222', recipientId='33333333-3333-4333-8333-333333333333', accountId='44444444-4444-4444-8444-444444444444';
const own={requestId,status:'PENDING',createdAt:'2026-10-25T10:00:00Z',expiresAt:'2026-11-01T10:00:00Z'};
const response=(raw,status=200)=>new Response(JSON.stringify(raw),{status,headers:{'Content-Type':'application/json'}});
const options={accessToken:'fixture',lang:'vi'};
test('roleless created account can sign in and request without granting beneficiary access',()=>{
 const user=readUser({id:accountId,fullName:'C',email:'c@example.test',roles:[]});
 assert.deepEqual(user.roles,[]);assert.equal(isPersonalRecipient(user.roles),true);assert.equal(resolvePostLoginRoute(user),'/shared-with-me');
 assert.equal(isPersonalRecipient(['ROLE_LEGAL_VERIFIER']),false);
 assert.throws(()=>readUser({...user,roles:['UNKNOWN']}));
});
test('own requests use BE caseCode without inventing case/account metadata',async()=>{
 const calls=[];const opts={...options,fetchFn:async(url,init)=>{calls.push({url,...init});return response(init.method==='POST'?own:[own],init.method==='POST'?201:200);}};
 const result=await bene.submit({caseNumber:'HS-2026-000123'},opts);assert.equal(result.caseNumber,null);assert.equal(result.id,requestId);
 assert.deepEqual(JSON.parse(calls[0].body),{caseCode:'HS-2026-000123'});assert.equal(calls[0].headers.Authorization,'Bearer fixture');assert.equal((await bene.listOwn(opts))[0].status,'PENDING');
});
test('create account uses case endpoint and requires explicit UNLINKED receipt',async()=>{
 let sent;const result=await staff.createAccount({caseId,fullName:'C',email:'c@example.test',password:'fixture-password',recipientId}, {...options,fetchFn:async(url,init)=>{sent={url,body:JSON.parse(init.body)};return response({accountId,linkStatus:'UNLINKED'},201);}});
 assert.equal(result.linked,false);assert.equal(sent.url,`/api/v1/staff/verification-cases/${caseId}/accounts`);assert.deepEqual(Object.keys(sent.body).sort(),['email','fullName','password']);
 await assert.rejects(staff.createAccount({caseId}, {...options,fetchFn:async()=>response({accountId,linkStatus:'LINKED'},201)}),e=>e.code==='INVALID_RESPONSE');
});
test('Staff approves stored requester only after successful attestation; reject sends no unsaved reason',async()=>{
 const calls=[];const opts={...options,fetchFn:async(url,init)=>{calls.push({url,body:init.body&&JSON.parse(init.body)});return response(url.endsWith('/identity-attestations')?{}:url.endsWith('/approve')?{requestId,status:'APPROVED',beneficiaryId:recipientId,accountId}:{requestId,status:'REJECTED',beneficiaryId:null,accountId:null},url.endsWith('/identity-attestations')?201:200);}};
 await staff.approve({caseId,requestId,recipientId,evidenceReference:'BB-01',accountId:'forged'},opts);
 assert.equal(calls[0].url.endsWith('/identity-attestations'),true);assert.deepEqual(calls[0].body,{evidenceReference:'BB-01'});assert.deepEqual(calls[1].body,{beneficiaryId:recipientId});
 await staff.reject({caseId,requestId,reason:'not persisted'},opts);assert.equal(calls[2].body,undefined);
});
test('failed attestation must not call approve; malformed decisions never become success',async()=>{
 let calls=0;await assert.rejects(staff.approve({caseId,requestId,recipientId,evidenceReference:'BB-01'}, {...options,fetchFn:async()=>{calls++;return response({code:'ACCESS_DENIED'},403);}}),e=>e.status===403);assert.equal(calls,1);
 await assert.rejects(staff.approve({caseId,requestId,recipientId,evidenceReference:'BB-01'}, {...options,fetchFn:async url=>response(url.endsWith('/identity-attestations')?{}:{requestId,status:'APPROVED',beneficiaryId:caseId,accountId},url.endsWith('/identity-attestations')?201:200)}),e=>e.code==='INVALID_RESPONSE');
});
test('pending list contains identity but no invented account UUID; expired/unknown states rejected',async()=>{
 const result=await staff.listPending({caseId},{...options,fetchFn:async()=>response([{...own,requesterName:'C',requesterEmail:'c@example.test'}])});assert.equal(result[0].accountId,null);assert.equal(result[0].accountName,'C');
 await assert.rejects(staff.listPending({caseId},{...options,fetchFn:async()=>response([{...own,status:'EXPIRED',requesterName:'C',requesterEmail:'c@example.test'}])}),e=>e.code==='INVALID_RESPONSE');
});
