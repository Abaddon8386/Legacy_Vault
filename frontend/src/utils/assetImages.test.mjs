import test from 'node:test';
import assert from 'node:assert/strict';
import { assetImageService, validateAssetImages, MAX_ASSET_IMAGE_BYTES } from '../services/assetImageService.js';
import { liveSubscriptionAdapter } from './subscriptionService.js';
test('owner subscription accepts actual backend Current DTO without fabricating usage',async()=>{
  const data=await liveSubscriptionAdapter.fetch({fetchFn:async()=>new Response(JSON.stringify({
    effectivePlan:{code:'BASIC',limits:{assetCount:5,storageBytes:104857600}},effectiveUntil:null,
    usage:{assetCount:1,storageBytes:12345},vaultCreated:true,
  }),{status:200,headers:{'Content-Type':'application/json'}})});
  assert.equal(data.assetsUsed,1);assert.equal(data.storageUsedBytes,12345);assert.equal(data.expiresAt,null);
});
test('image limits include existing photos and reject wrong types, empty and oversized files',()=>{
  const f={type:'image/png',size:MAX_ASSET_IMAGE_BYTES};
  assert.equal(validateAssetImages([f,f,f,f,f]),null);
  assert.equal(validateAssetImages([f],5),'count');
  assert.equal(validateAssetImages([{...f,size:MAX_ASSET_IMAGE_BYTES+1}]),'size');
  assert.equal(validateAssetImages([{...f,size:0}]),'size');
  assert.equal(validateAssetImages([{...f,type:'image/svg+xml'}]),'type');
});
test('create with photos uses one multipart request, preserves auth/abort and never sets multipart boundary manually',async()=>{
  const f=new File(['png'],'image.png',{type:'image/png'});const signal=new AbortController().signal;
  let count=0;
  const result=await assetImageService.create('vault',{name:'Asset',payload:'secret'},[f],{accessToken:'test',signal,
    fetchFn:async(url,opts)=>{count++;assert.ok(url.endsWith('/assets/with-images'));assert.equal(opts.headers.Authorization,'Bearer test');
      assert.equal(opts.headers['Content-Type'],undefined);assert.equal(opts.signal,signal);assert.equal(opts.body.getAll('images').length,1);
      assert.deepEqual(JSON.parse(await opts.body.get('asset').text()),{name:'Asset',payload:'secret'});
      return new Response(JSON.stringify({id:'new'}),{status:201,headers:{'Content-Type':'application/json'}});}});
  assert.equal(count,1);assert.equal(result.id,'new');
});
