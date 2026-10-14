import test from 'node:test';
import assert from 'node:assert/strict';
import {assetService,readAsset} from '../services/assetService.js';
const id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const item={id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',vaultId:id,name:'Demo',assetType:'TEXT',hasPayload:true,createdAt:'2026-10-13T00:00:00Z',updatedAt:'2026-10-13T00:00:00Z'};
test('Asset rejects missing/foreign Vault metadata and strips secrets',()=>{
 for(const raw of [{}, {...item,id:'not-uuid'}, {...item,vaultId:'cccccccc-cccc-4ccc-8ccc-cccccccccccc'}, {...item,hasPayload:null}]) assert.throws(()=>readAsset(raw,id),error=>error.code==='INVALID_RESPONSE');
 const safe=readAsset({...item,payload:'SYNTHETIC_SECRET'},id); assert.equal(safe.payload,undefined);
});
test('Asset create forwards token/signal, preserves payload whitespace and rejects false receipts',async()=>{
 const original=globalThis.fetch; const controller=new AbortController();
 try {
 globalThis.fetch=async(url,options)=>{assert.equal(url,`/api/v1/vaults/${id}/assets`);assert.equal(options.headers.Authorization,'Bearer TEST');assert.equal(options.signal,controller.signal);assert.equal(JSON.parse(options.body).payload,'  synthetic  ');return new Response(JSON.stringify(item),{status:201,headers:{'Content-Type':'application/json'}});};
 await assetService.createAsset(id,{name:'Demo',assetType:'TEXT',payload:'  synthetic  '},{accessToken:'TEST',signal:controller.signal});
 globalThis.fetch=async()=>new Response('{}',{status:201,headers:{'Content-Type':'application/json'}});
 await assert.rejects(assetService.createAsset(id,{name:'Demo',assetType:'TEXT',payload:'synthetic'}),error=>error.code==='INVALID_RESPONSE');
 } finally {globalThis.fetch=original;}
});
