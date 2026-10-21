import test from 'node:test';
import assert from 'node:assert/strict';
import { readReceivedPage, readReceivedDetail, readReceivedContent, receivedPreviewAllowed, receivedActions } from '../pages/beneficiary/receivedAssetsModel.js';
const id='11111111-1111-4111-8111-111111111111',subject='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item={itemId:id,title:'Synthetic',sourceLabel:'Synthetic source',deliveryStatus:'DELIVERED',deliveredAt:'2026-10-20T08:00:00Z',sessionStatus:'COMPLETED',vaultStatus:'ARCHIVED',caseStatus:'CLOSED'};
const page={subjectId:subject,page:0,size:5,total:1,accountState:'RECEIVED',items:[item]};
test('Read-only delivered items remain visible after completion/archive/close; list strips secret fields',()=>{
 const result=readReceivedPage({...page,items:[{...item,payload:'must not surface'}]},subject,0,5);
 assert.equal(result.items[0].vaultStatus,'ARCHIVED');assert.equal('payload' in result.items[0],false);
 assert.equal(readReceivedDetail({...item,subjectId:subject,images:[]},subject,id).caseStatus,'CLOSED');
});
test('Recipient/item mismatch, unhanded item and malformed totals are rejected',()=>{
 for(const value of [{...page,subjectId:id},{...page,total:0},{...page,items:[{...item,deliveryStatus:'ELIGIBLE'}]},{...page,accountState:'AWAITING_HANDOVER'}])assert.throws(()=>readReceivedPage(value,subject,0,5),{code:'INVALID_RESPONSE'});
 assert.throws(()=>readReceivedDetail({...item,subjectId:subject,images:[]},subject,subject),{code:'INVALID_RESPONSE'});
 assert.throws(()=>readReceivedContent({subjectId:id,itemId:id,text:'wrong user'},subject,id),{code:'INVALID_RESPONSE'});
 assert.throws(()=>readReceivedContent({subjectId:subject,itemId:subject,text:'wrong item'},subject,id),{code:'INVALID_RESPONSE'});
});
test('Waiting and unlinked states do not imply received assets; duplicate image ids rejected',()=>{
 for(const accountState of ['UNLINKED','AWAITING_HANDOVER'])assert.equal(readReceivedPage({...page,items:[],total:0,accountState},subject,0,5).total,0);
 assert.throws(()=>readReceivedDetail({...item,subjectId:subject,images:[{imageId:id,label:'one'},{imageId:id,label:'two'}]},subject,id),{code:'INVALID_RESPONSE'});
});
test('Preview needs explicit DEV and no login; production/token cannot be overridden',()=>{
 assert.equal(receivedPreviewAllowed({isDevPreview:true,testEnv:{DEV:true}}),true);
 for(const extra of [{accessToken:'signed-in',testEnv:{DEV:true}},{testEnv:{DEV:true,PROD:true}},{testEnv:{DEV:false}}])assert.equal(receivedPreviewAllowed({isDevPreview:true,...extra}),false);
 const mock={};assert.equal(receivedActions(null,{isDevPreview:true,accessToken:'signed-in',previewActions:mock,testEnv:{DEV:true}}),null);
 assert.equal(receivedActions(null,{isDevPreview:true,previewActions:mock,testEnv:{PROD:true}}),null);
});
