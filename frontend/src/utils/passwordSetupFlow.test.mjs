import test from 'node:test';
import assert from 'node:assert/strict';
import { registerPasswordSetup, passwordSetupError } from './passwordSetupFlow.js';
import { assetService } from '../services/assetService.js';
import { assetDocumentService } from '../services/assetDocumentService.js';
import { assetImageService } from '../services/assetImageService.js';
import { createLiveReceivedAssetActions } from '../services/receivedAssetService.js';
import { updateProfile } from '../services/profileService.js';
import { willService } from './willService.js';
import { readUser } from '../api/contracts.js';

const id='11111111-1111-4111-8111-111111111111', assetId='22222222-2222-4222-8222-222222222222';
const other='33333333-3333-4333-8333-333333333333', instant='2026-11-04T12:00:00Z';
const user={id,fullName:'Owner',email:'owner@example.com',phoneNumber:null,roles:['VAULT_OWNER'],passwordLoginEnabled:false};
const session={accessToken:'test-only',user,expiresAt:Date.now()+3600000};
const asset={id:assetId,vaultId:id,name:'Kept asset',assetType:'TEXT',hasPayload:true,createdAt:instant,updatedAt:instant};
const opts={accessToken:session.accessToken,lang:'en'};
const json=(value,status=200)=>new Response(JSON.stringify(value),{status,headers:{'Content-Type':'application/json'}});
const document={id:other,contentType:'application/pdf'}, image={id:other,contentType:'image/png'};
const received=createLiveReceivedAssetActions({userId:id});
const cases=[
  ['AssetDetailModal: reveal',()=>assetService.revealAsset(id,assetId,'old',opts),()=>json({id:assetId,payload:'secret'})],
  ['AssetEditModal / AssetManagementPage: update',()=>assetService.updateAsset(id,assetId,{name:'Kept asset',password:'old'},opts),()=>json(asset)],
  ['AssetDocuments: download',()=>assetDocumentService.download(id,assetId,document,'old',opts),()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf'}})],
  ['AssetImageGallery: open',()=>assetImageService.open(id,assetId,image,'old',opts),()=>new Response('png',{headers:{'Content-Type':'image/png'}})],
  ['ReceivedAssets: content',()=>received.content(other,{...opts,password:'old'}),()=>json({itemId:other,assetId,payload:'secret'})],
  ['ReceivedAssets: image',()=>received.image(other,assetId,{...opts,password:'old'}),()=>new Response('png',{headers:{'Content-Type':'image/png'}})],
  ['WillUploadPage: download',()=>willService.downloadWillVersion(id,other,1,'old',opts),()=>new Response('%PDF-test',{headers:{'Content-Type':'application/pdf'}})],
  ['AccountEditPage: change email',()=>updateProfile(session,{email:'new@example.com',currentPassword:'old'}),()=>json({...user,email:'new@example.com',passwordLoginEnabled:true})],
];
const originalFetch=globalThis.fetch;
test.afterEach(()=>{globalThis.fetch=originalFetch;});
for(const [name,run,response] of cases) test(`${name} resumes the exact request once after first-password setup`,async()=>{
  const calls=[];let prompts=0;
  const unregister=registerPasswordSetup(async options=>{prompts++;assert.equal(options.accessToken,'test-only');return 'First-password-123';});
  globalThis.fetch=async(url,init)=>{calls.push({url,init,body:JSON.parse(init.body)});return calls.length===1?json({code:'PASSWORD_NOT_SET'},403):response();};
  try {
    await run(); assert.equal(prompts,1); assert.equal(calls.length,2); assert.equal(calls[0].url,calls[1].url);
    const field=name.startsWith('AccountEdit')?'currentPassword':'password';
    assert.equal(calls[0].body[field],'old');assert.equal(calls[1].body[field],'First-password-123');
    assert.deepEqual({...calls[0].body,[field]:null},{...calls[1].body,[field]:null});
    assert.equal(calls[0].init.method,calls[1].init.method);
  } finally {unregister();}
});

test('wrong password, access denial and rate limiting never open setup or replay a write',async()=>{
  let prompts=0,calls=0;const unregister=registerPasswordSetup(async()=>{prompts++;return 'unused';});
  try {for(const [code,status] of [['REAUTH_FAILED',403],['ACCESS_DENIED',403],['TOO_MANY_ATTEMPTS',429]]) {
    globalThis.fetch=async()=>{calls++;return json({code},status);};
    await assert.rejects(assetService.revealAsset(id,assetId,'old',opts),{code,status});
  } assert.equal(prompts,0);assert.equal(calls,3);} finally {unregister();}
});

test('cancelled setup preserves the failed action and never retries it',async()=>{
  let calls=0;const unregister=registerPasswordSetup(async()=>{throw passwordSetupError();});
  globalThis.fetch=async()=>{calls++;return json({code:'PASSWORD_NOT_SET'},403);};
  try {await assert.rejects(assetService.updateAsset(id,assetId,{name:'Draft',password:'old'},opts),{code:'PASSWORD_SETUP_CANCELLED',status:0});assert.equal(calls,1);}
  finally {unregister();}
});

test('switching the setup owner or aborting the action discards the new password without replay',async()=>{
  for(const abort of [false,true]) {
    let finish,calls=0;const c=new AbortController();
    const unregister=registerPasswordSetup(()=>new Promise(resolve=>{finish=resolve;}));
    globalThis.fetch=async()=>{calls++;return json({code:'PASSWORD_NOT_SET'},403);};
    const promise=assetService.revealAsset(id,assetId,'old',{...opts,signal:c.signal});
    while(!finish)await new Promise(resolve=>setTimeout(resolve,0));
    if(abort)c.abort();else unregister();
    finish('secret');await assert.rejects(promise,{name:'AbortError'});assert.equal(calls,1);unregister();
  }
});

test('a repeated PASSWORD_NOT_SET is not an infinite setup loop; profile capability is validated and preserved',async()=>{
  let prompts=0,calls=0;const unregister=registerPasswordSetup(async()=>{prompts++;return 'secret';});
  globalThis.fetch=async()=>{calls++;return json({code:'PASSWORD_NOT_SET'},403);};
  try {await assert.rejects(assetService.revealAsset(id,assetId,'old',opts),{code:'PASSWORD_NOT_SET'});assert.equal(prompts,1);assert.equal(calls,2);}
  finally {unregister();}
  assert.equal(readUser(user).passwordLoginEnabled,false);
  assert.throws(()=>readUser({...user,passwordLoginEnabled:'false'}),{code:'INVALID_AUTH_RESPONSE'});
});
