import test from 'node:test';
import assert from 'node:assert/strict';
import {assetService} from '../services/assetService.js';
const vault='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const item={id,vaultId:vault,name:'A',assetType:'TEXT',description:null,hasPayload:true,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:01Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
test('PS-6 GET checks asset identity and strips plaintext from receipt',async()=>{
 const got=await assetService.getAssetById(vault,id,{fetchFn:async url=>{assert.ok(url.endsWith('/assets/'+id));return json({...item,payload:'NEVER-RENDER'});}});
 assert.equal(got.payload,undefined);
 await assert.rejects(assetService.getAssetById(vault,id,{fetchFn:async()=>json({...item,id:vault})}),{code:'INVALID_RESPONSE'});
});
test('PS-6 PATCH whitelists fields, keeps secret whitespace and passes Bearer/locale/abort',async()=>{
 const controller=new AbortController();
 const got=await assetService.updateAsset(vault,id,{name:' B ',payload:'  secret  ',id:vault,assetType:'FILE'},{accessToken:'synthetic',lang:'en',signal:controller.signal,fetchFn:async(url,init)=>{
  assert.equal(init.method,'PATCH');assert.deepEqual(JSON.parse(init.body),{name:'B',payload:'  secret  '});assert.equal(init.headers.Authorization,'Bearer synthetic');assert.equal(init.headers['Accept-Language'],'en');assert.equal(init.signal,controller.signal);return json({...item,name:'B',payload:'secret'});
 }}); assert.equal(got.name,'B');assert.equal(got.payload,undefined);
});
test('PS-6 omitted payload is preserved; description can be cleared',async()=>{
 await assetService.updateAsset(vault,id,{description:''},{fetchFn:async(url,init)=>{assert.deepEqual(JSON.parse(init.body),{description:null});return json(item);}});
 for(const patch of [{},{assetType:'FILE'},{name:''},{payload:'   '},{description:'x'.repeat(1001)}]) await assert.rejects(assetService.updateAsset(vault,id,patch),{code:'VALIDATION_FAILED'});
});
test('PS-6 propagates 401/403/404/409 and abort without returning stale detail',async()=>{
 for(const status of [401,403,404,409]) await assert.rejects(assetService.getAssetById(vault,id,{fetchFn:async()=>json({code:'DENIED'},status)}),error=>error.status===status);
 await assert.rejects(assetService.getAssetById(vault,id,{fetchFn:async()=>{throw new DOMException('Cancelled','AbortError');}}),{name:'AbortError'});
});
