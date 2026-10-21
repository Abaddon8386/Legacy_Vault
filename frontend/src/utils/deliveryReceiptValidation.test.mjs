import test from 'node:test';
import assert from 'node:assert/strict';
import { readDeliveryReceiptBatch } from './deliveryReceiptValidation.js';
const sessionId='11111111-1111-4111-8111-111111111111';
const recipientId='22222222-2222-4222-8222-222222222222';
const assetId='33333333-3333-4333-8333-333333333333';
const other='44444444-4444-4444-8444-444444444444';
const item={itemId:other,sessionId,recipientId,assetId,status:'DELIVERED',staffId:sessionId,deliveredAt:'2026-10-20T08:00:00.1234567'};
const request={sessionId,recipientId,assetIds:[assetId]};
test('receipt accepts complete BE LocalDateTime DTO, independent of ordering',()=>{
  assert.deepEqual([...readDeliveryReceiptBatch([item],request)],[assetId]);
  assert.ok(readDeliveryReceiptBatch([{...item,assetId:other,itemId:assetId},item],{...request,assetIds:[assetId,other]}));
});
test('missing or malformed required receipt fields must reject the whole batch',()=>{
  for(const key of Object.keys(item)){
    const missing={...item};delete missing[key];
    assert.equal(readDeliveryReceiptBatch([missing],request),null,key);
    assert.equal(readDeliveryReceiptBatch([{...item,[key]:null}],request),null,key);
  }
  for(const key of ['itemId','sessionId','recipientId','assetId','staffId']) assert.equal(readDeliveryReceiptBatch([{...item,[key]:'item-1'}],request),null,key);
  assert.equal(readDeliveryReceiptBatch([{...item,deliveredAt:'yesterday'}],request),null);
});
test('empty partial mismatched duplicate and mixed receipt batches are uncertain, never success',()=>{
  for(const value of [[],{},null,[{...item,sessionId:other}],[{...item,recipientId:other}],[{...item,assetId:other}],[{...item,status:'PENDING'}],[item,item]]) assert.equal(readDeliveryReceiptBatch(value,request),null);
  assert.equal(readDeliveryReceiptBatch([item],{...request,assetIds:[assetId,other]}),null);
  assert.equal(readDeliveryReceiptBatch([item,{...item,assetId:other}],{...request,assetIds:[assetId,other]}),null,'duplicate itemId');
});
