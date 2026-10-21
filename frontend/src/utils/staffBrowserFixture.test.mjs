import test from 'node:test';
import assert from 'node:assert/strict';
import { startStaffReviewServer } from '../../../scripts/testing/staff-review-browser.mjs';
import { ids } from './staffReviewFixture.mjs';
import { readDeliveryReceiptBatch } from './deliveryReceiptValidation.js';

test('browser fixture enforces session, atomic allocation and stable public delivery DTOs',async()=>{
  const server=await startStaffReviewServer({port:0});
  const address=server.httpServer.address();
  const base=`http://127.0.0.1:${address.port}/api/v1/staff/verification-cases/${ids.caseId}/handover-sessions/`;
  const headers={Authorization:'Bearer explicit-local-fixture-token','Content-Type':'application/json'};
  const get=async(path)=>fetch(base+path,{headers});
  const post=async(session,recipientId,assetIds)=>fetch(base+session+'/deliveries',{method:'POST',headers,body:JSON.stringify({recipientId,assetIds})});
  try{
    assert.equal((await get(ids.otherSessionId+'/eligible-assets')).status,404);
    assert.equal((await post(ids.otherSessionId,ids.recipient,[ids.assetId])).status,404);
    const eligible=await (await get(ids.sessionId+'/eligible-assets')).json();
    assert.equal(new Set(eligible.map(x=>x.recipientId)).size,2);
    assert.equal(new Set(eligible.map(x=>x.assetId)).size,3);
    assert.deepEqual(Object.keys(eligible[0]).sort(),['assetId','recipientId','description','deliveryStatus'].sort());
    assert.equal((await post(ids.sessionId,ids.recipient,[ids.assetId,ids.assetId])).status,400);
    assert.equal((await post(ids.sessionId,ids.recipient,[ids.assetId,eligible[2].assetId])).status,409);
    assert.equal((await post(ids.sessionId,ids.otherCaseId,[ids.assetId])).status,409);
    assert.deepEqual(await (await get(ids.sessionId+'/deliveries')).json(),[],'invalid batch must not write partially');
    const response=await post(ids.sessionId,ids.recipient,[ids.assetId]);
    assert.equal(response.status,201);
    const receipt=await response.json();
    assert.ok(readDeliveryReceiptBatch(receipt,{sessionId:ids.sessionId,recipientId:ids.recipient,assetIds:[ids.assetId]}));
    assert.deepEqual(await (await get(ids.sessionId+'/deliveries')).json(),receipt,'POST and reload share same itemId/time');
    assert.equal((await post(ids.sessionId,ids.recipient,[ids.assetId])).status,409);
    const after=await (await get(ids.sessionId+'/eligible-assets')).json();
    assert.equal(after[0].deliveryStatus,'DELIVERED');
    assert.equal(after[1].deliveryStatus,'ELIGIBLE');
    assert.equal(after[2].deliveryStatus,'ELIGIBLE');
  }finally{await server.close();}
});
