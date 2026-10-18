import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHandoverCase, linkExistingBeneficiaryAccount, createAndLinkBeneficiaryAccount } from '../pages/staff/beneficiaryAccountService.js';
test('Account link/create preserve beneficiary identity; require valid active session', async () => {
 const data=(await fetchHandoverCase('case-standard',{isTest:true})).caseData;
 const options={isTest:true,caseData:data};
 const linked=await linkExistingBeneficiaryAccount('ben-002','user@example.test',options); assert.equal(linked.beneficiaryId,'ben-002'); assert.equal(linked.linkedEmail,'user@example.test');
 const created=await createAndLinkBeneficiaryAccount('ben-002',{fullName:'Test User',email:'new@example.test',phone:'0901234567'},options); assert.equal(created.activatedAtCounter,true); assert.equal(created.beneficiaryId,'ben-002');
 await assert.rejects(linkExistingBeneficiaryAccount('ben-002','invalid',options),{code:'VALIDATION_FAILED'});
 await assert.rejects(linkExistingBeneficiaryAccount('ben-002','user@example.test',{...options,caseData:{...data,session:null}}),{code:'SESSION_NOT_ACTIVE'});
});
test('Live/production cannot create synthetic accounts', async () => {
 for (const options of [{},{isTest:true,accessToken:'real'},{isTest:true,testEnv:{PROD:true}}]) await assert.rejects(linkExistingBeneficiaryAccount('ben-002','user@example.test',options),{code:'BACKEND_NOT_READY'});
});
