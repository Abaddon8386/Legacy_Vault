import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchHandoverCase, openHandoverSession } from '../pages/staff/handoverSessionService.js';
test('Session open blocks locked, stale, duplicate and archived cases', async () => {
 const data=(await fetchHandoverCase('case-standard',{isTest:true})).caseData;
 await assert.rejects(openHandoverSession(data,{isTest:true}),{code:'DUPLICATE_SESSION_ACTIVE'});
 for (const [patch,code] of [[{vaultStatus:'LOCKED'},'VAULT_NOT_UNLOCKED'],[{legalApproval:{isFresh:false}},'STALE_APPROVAL'],[{isReadOnly:true},'SESSION_ALREADY_ARCHIVED']]) await assert.rejects(openHandoverSession({...data,...patch},{isTest:true}),{code});
 const receipt=await openHandoverSession({...data,session:null},{isTest:true}); assert.equal(receipt.status,'ACTIVE'); assert.ok(receipt.sessionId);
});
test('Live and production never fabricate a session', async () => {
 for (const options of [{},{isTest:true,accessToken:'real'},{isTest:true,testEnv:{PROD:true}}]) await assert.rejects(fetchHandoverCase('case-standard',options),{code:'BACKEND_NOT_READY'});
});
