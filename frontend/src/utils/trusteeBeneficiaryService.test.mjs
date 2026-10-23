import test from 'node:test';
import assert from 'node:assert/strict';
import {getTrustees,createTrustee,getBeneficiaries,createBeneficiary,checkConfigurationReadiness,readBeneficiary,readTrustee,updateBeneficiary,updateTrustee} from './trusteeBeneficiaryService.js';
import {validateBeneficiary} from './beneficiaryValidation.js';
const vault='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const trustee={id,vaultId:vault,fullName:'A',phone:null,email:'a@example.test',relationship:null,status:'APPOINTED',appointedAt:'2026-10-13T00:00:00Z',revokedAt:null};
const beneficiary={id,vaultId:vault,fullName:'B',phone:null,email:null,relationship:null,dateOfBirth:null,status:'DESIGNATED',hasAccount:false,hasIdentityNumber:false,createdAt:'2026-10-13T00:00:00Z'};
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json'}});
const page=content=>({content,page:0,size:20,totalElements:content.length,totalPages:content.length?1:0});
test('PS-8 reads strict page/Vault metadata with Bearer/locale/abort, never assumes default Vault',async()=>{
 const controller=new AbortController();const options={accessToken:'synthetic',lang:'en',signal:controller.signal,fetchFn:async(url,init)=>{assert.equal(init.headers.Authorization,'Bearer synthetic');assert.equal(init.headers['Accept-Language'],'en');assert.equal(init.signal,controller.signal);assert.ok(url.includes('/trustees?vaultId='+vault));return json(page([trustee]));}};
 assert.equal((await getTrustees(vault,options))[0].id,id);
 await assert.rejects(getTrustees(undefined),{code:'VAULT_REQUIRED'});
 await assert.rejects(getBeneficiaries(vault,{fetchFn:async()=>json([])}),{code:'INVALID_RESPONSE'});
 await assert.rejects(getTrustees(vault,{fetchFn:async()=>json(page([{...trustee,vaultId:id}]))}),{code:'INVALID_RESPONSE'});
});
test('PS-8 creates contact-only Trustee, whitelists body and requires exact 201/appointed receipt',async()=>{
 await createTrustee(vault,{fullName:' A ',email:'A@EXAMPLE.TEST',note:'removed',userId:id,unlock:true},{fetchFn:async(url,init)=>{assert.equal(url,'/api/v1/trustees');assert.deepEqual(JSON.parse(init.body),{vaultId:vault,fullName:'A',phone:null,email:'a@example.test',relationship:null});return json(trustee,201);}});
 await assert.rejects(createTrustee(vault,{fullName:'A',email:'a@example.test'},{fetchFn:async()=>json(trustee,200)}),{code:'INVALID_RESPONSE'});
 await assert.rejects(createTrustee(vault,{fullName:'A'}),{code:'VALIDATION_FAILED'});
 assert.equal(readTrustee({...trustee,note:'preserved',userId:id},vault).note,'preserved');
});
test('PS-8 beneficiary does not require account/contact or allocate shares, hides identity and checks pagination',async()=>{
 await createBeneficiary(vault,{fullName:'B',userId:id,share:100},{fetchFn:async(url,init)=>{assert.deepEqual(JSON.parse(init.body),{fullName:'B',phone:null,email:null,relationship:null,dateOfBirth:null});return json({...beneficiary,identityNumber:'NEVER-RETURN'},201);}});
 const got=await getBeneficiaries(vault,{page:2,fetchFn:async(url)=>{assert.ok(url.endsWith('?page=2&size=20'));return json({...page([beneficiary]),page:2,totalPages:3});}});assert.equal(got.content[0].hasAccount,false);
 assert.equal(readBeneficiary({...beneficiary,identityNumber:'secret',token:'secret'},vault).identityNumber,undefined);
 assert.equal(readBeneficiary({...beneficiary,hasAccount:true},vault).hasAccount,true);
 assert.throws(()=>readBeneficiary({...beneficiary,hasAccount:'true'},vault),{code:'INVALID_RESPONSE'});
 assert.ok(validateBeneficiary({fullName:'B',dateOfBirth:'2026-02-30'}).dateOfBirth);
});
test('PS-8 readiness comes only from backend; failed check/list never fabricate ready or empty state',async()=>{
 for(const status of [401,403,404,503]) await assert.rejects(checkConfigurationReadiness(vault,{fetchFn:async()=>json({code:'DENIED',message:'SQL SECRET'},status)}),error=>error.status===status&&!error.message.includes('SQL SECRET'));
 for(const data of [{vaultId:vault,ready:true,beneficiaryCount:0,issues:[]},{vaultId:id,ready:true,beneficiaryCount:1,issues:[]}]) await assert.rejects(checkConfigurationReadiness(vault,{fetchFn:async()=>json(data)}),{code:'INVALID_RESPONSE'});
 assert.equal((await checkConfigurationReadiness(vault,{fetchFn:async()=>json({vaultId:vault,ready:false,beneficiaryCount:0,issues:[{code:'BENEFICIARY_REQUIRED',message:'raw'}]})})).isReady,false);
 await assert.rejects(getBeneficiaries(vault,{fetchFn:async()=>json({code:'RESOURCE_NOT_FOUND'},404)}),{status:404});
});
test('PS-8 abort/conflict preserved and malformed records rejected',async()=>{
 await assert.rejects(getTrustees(vault,{fetchFn:async()=>{throw new DOMException('cancel','AbortError')}}),{name:'AbortError'});
 await assert.rejects(createTrustee(vault,{fullName:'A',email:'a@example.test'},{fetchFn:async()=>json({code:'TRUSTEE_ALREADY_EXISTS'},409)}),{status:409,code:'TRUSTEE_ALREADY_EXISTS'});
 assert.throws(()=>readTrustee({...trustee,status:'ACTIVE'},vault),{code:'INVALID_RESPONSE'});
 assert.throws(()=>readBeneficiary({...beneficiary,hasIdentityNumber:'yes'},vault),{code:'INVALID_RESPONSE'});
});

test('Bugs 6–7 updates reject invalid input, foreign receipts and unauthorized responses',async()=>{
 await assert.rejects(updateBeneficiary(vault,id,{fullName:'B',email:'bad'},{fetchFn:()=>assert.fail('Invalid input must not reach network')}),{code:'VALIDATION_FAILED'});
 await assert.rejects(updateTrustee(vault,id,{fullName:'A',email:'a@example.test'},{fetchFn:async()=>json({...trustee,id:vault})}),{code:'INVALID_RESPONSE'});
 for(const status of [401,403,404,409])await assert.rejects(updateBeneficiary(vault,id,{fullName:'B'},{fetchFn:async()=>json({code:'ACCESS_DENIED'},status)}),error=>error.status===status);
});
