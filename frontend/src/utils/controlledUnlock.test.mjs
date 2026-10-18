import test from 'node:test';
import assert from 'node:assert/strict';
import { describeUnlock, fetchControlledUnlock } from '../pages/legal/controlledUnlockService.js';
test('Unlock requires explicit Backend metadata; missing data is unknown', () => {
 assert.equal(describeUnlock(null).status, 'UNKNOWN');
 assert.equal(describeUnlock({vaultStatus:'UNLOCKED'}).status, 'UNKNOWN');
 assert.equal(describeUnlock({vaultStatus:'UNLOCKED',unlockConfirmation:{source:'LEGAL_APPROVAL'}}).status, 'UNLOCKED');
});
test('Preview unlock is labelled synthetic; authenticated/production cannot simulate', async () => {
 const data = await fetchControlledUnlock({isDevPreview:true,scenario:'unlocked'});
 assert.equal(data.unlockConfirmation.source,'SYNTHETIC_PREVIEW_SIMULATION');
 for (const options of [{},{isDevPreview:true,accessToken:'real'},{isDevPreview:true,production:true}]) await assert.rejects(fetchControlledUnlock(options),{code:'BACKEND_NOT_READY'});
});
