import test from 'node:test';
import assert from 'node:assert/strict';
import { signedReceiptFileError } from './signedReceiptFile.js';
import { loadStaffCase } from '../pages/staff/staffLiveService.js';
import { fetchStaffCases } from '../pages/staff/staffCaseService.js';
test('receipt accepts BE MIME aliases, missing MIME and generic declarations', () => {
  for (const type of ['application/pdf','image/png','image/jpeg','image/jpg','IMAGE/JPEG','image/jpeg; charset=binary','',undefined,'application/octet-stream']) assert.equal(signedReceiptFileError({type,size:100}),null,type);
});
test('receipt rejects unsupported images and excessive size with separate reasons', () => {
  for (const type of ['image/heic','image/heif','image/webp','text/html','image/svg+xml']) assert.equal(signedReceiptFileError({type,size:100}),'type');
  assert.equal(signedReceiptFileError({type:'image/jpeg',size:0}),'empty');
  assert.equal(signedReceiptFileError({type:'image/jpeg',size:10*1024*1024}),null);
  assert.equal(signedReceiptFileError({type:'image/jpeg',size:10*1024*1024+1}),'size');
});
test('case reads bypass browser cache and use server status after closure', async () => {
  const id='11111111-1111-4111-8111-111111111111',calls=[];
  const fetchFn=async(url,options)=>{calls.push(options);return new Response(JSON.stringify(url.includes('?')?{content:[],page:0,size:5,totalElements:0,totalPages:0}:{caseId:id,status:'CLOSED'}),{headers:{'Content-Type':'application/json'}});};
  assert.equal((await loadStaffCase(id,{fetchFn,accessToken:'synthetic'})).status,'CLOSED');
  await fetchStaffCases({fetchFn,accessToken:'synthetic'});
  assert.equal(calls.length,2);assert.ok(calls.every(call=>call.cache==='no-store'));
});
