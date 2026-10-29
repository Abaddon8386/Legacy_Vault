import test from 'node:test';
import assert from 'node:assert/strict';
import {receiveAndForwardBasisVersion} from '../pages/staff/staffLegalDocumentsService.js';
const id='11111111-1111-4111-8111-111111111111';
const received={caseId:id,status:'LEGAL_BASIS_PROVIDED',versions:[{version:1,forwardStatus:'FORWARDED'},{version:2,forwardStatus:'NOT_FORWARDED'}]};
const forwarded={...received,status:'LEGAL_BASIS_FORWARDED',versions:[{version:2,forwardStatus:'FORWARDED'}]};
test('one upload operation forwards the exact newest received version with the same authorization and signal',async()=>{
 const calls=[],options={accessToken:'test-only',signal:new AbortController().signal};
 const result=await receiveAndForwardBasisVersion(id,{metadata:{},file:{}},options,{upload:async(caseId,payload,opts)=>{calls.push('upload');assert.equal(caseId,id);assert.equal(opts,options);return received;},forward:async(caseId,version,opts)=>{calls.push('forward');assert.equal(caseId,id);assert.equal(version,2);assert.equal(opts,options);return forwarded;}});
 assert.deepEqual(calls,['upload','forward']);assert.equal(result.error,null);assert.equal(result.dossier,forwarded);
});
test('forward failure preserves the saved receipt for retry and never uploads a duplicate',async()=>{
 let uploads=0;const error=Object.assign(new Error('Unavailable'),{status:503});
 const result=await receiveAndForwardBasisVersion(id,{}, {},{upload:async()=>{uploads++;return received;},forward:async()=>{throw error;}});
 assert.equal(uploads,1);assert.equal(result.dossier,received);assert.equal(result.error,error);
});
test('wrong-case upload receipt cannot forward a document into the selected case',async()=>{
 let calls=0;await assert.rejects(receiveAndForwardBasisVersion(id,{}, {},{upload:async()=>({...received,caseId:'another-case'}),forward:async()=>{calls++;}}),{code:'INVALID_RESPONSE'});assert.equal(calls,0);
});
test('changing case or token cancels the sequence before forwarding',async()=>{
 const controller=new AbortController();let calls=0;
 await assert.rejects(receiveAndForwardBasisVersion(id,{}, {signal:controller.signal},{upload:async()=>{controller.abort();return received;},forward:async()=>{calls++;}}),{name:'AbortError'});assert.equal(calls,0);
});
