import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCourtAllocations } from './courtAllocationModel.js';
import { deliveryReadiness } from './deliveryReadiness.js';
import { isPersonalRecipient } from './caseLinkModel.js';
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
const scope = { assets: [{ assetId: a }, { assetId: b }], recipients: [{ beneficiaryId: c }], requireCatalog: true };
test('A/C allocation uses exactly one recipient source; court metadata never creates an account or identity attestation', () => {
  const result = buildCourtAllocations([
    { assetId: a, beneficiaryId: c, description: 'Archive' },
    { assetId: b, recipientKind: 'court', beneficiaryId: c, courtRecipient: { fullName: ' C ', relationship: 'Child', accountLinked: true, verified: true, identityNumber: 'private', userId: a }, description: 'Account' },
  ], scope);
  assert.deepEqual(result.errors, []);
  assert.equal(result.allocations[0].beneficiaryId, c);
  assert.equal(result.allocations[1].beneficiaryId, undefined);
  assert.deepEqual(result.allocations[1].courtRecipient, { fullName: 'C', relationship: 'Child', phone: null, email: null, dateOfBirth: null });
});
test('a case with no existing recipient still accepts C from the court document', () => {
  const result = buildCourtAllocations([{ assetId: a, recipientKind: 'court', courtRecipient: { fullName: 'C' } }], { ...scope, recipients: [] });
  assert.deepEqual(result.errors, []);
});
test('new recipient cannot mask out-of-case assets, existing recipients or invalid contact data', () => {
  for (const row of [
    { assetId: c, recipientKind: 'court', courtRecipient: { fullName: 'C' } },
    { assetId: a, beneficiaryId: b },
    { assetId: a, recipientKind: 'court', courtRecipient: { fullName: ' ' } },
    { assetId: a, recipientKind: 'court', courtRecipient: { fullName: 'C', email: 'invalid' } },
    { assetId: a, recipientKind: 'court', courtRecipient: { fullName: 'C', dateOfBirth: '2026-02-30' } },
  ]) assert.ok(buildCourtAllocations([row], scope).errors.length);
});
test('same C can receive different assets, but repeated asset/recipient lines are blocked', () => {
  const row = { assetId: a, recipientKind: 'court', courtRecipient: { fullName: 'C', dateOfBirth: '2000-01-01' } };
  assert.deepEqual(buildCourtAllocations([row, { ...row, assetId: b }], scope).errors, []);
  assert.ok(buildCourtAllocations([row, { ...row, courtRecipient: { ...row.courtRecipient, fullName: ' c ' } }], scope).errors.some(error => error.key === 'duplicate'));
});
test('delivery respects BE-02 account and readiness facts, including partial and missing/contradictory responses', () => {
  assert.equal(deliveryReadiness({ accountLinked: false, deliverable: false, blockedReason: 'RECIPIENT_ACCOUNT_REQUIRED' }).deliverable, false);
  assert.equal(deliveryReadiness({ accountLinked: true, deliverable: true, blockedReason: null }).deliverable, true);
  for (const row of [{}, { accountLinked: false, deliverable: true }, { accountLinked: true, deliverable: false }, { accountLinked: true, deliverable: true, status: 'DELIVERED' }]) assert.equal(deliveryReadiness(row).deliverable, false);
  assert.equal(deliveryReadiness({}, { preview: true }).deliverable, true);
});
test('staff and Legal accounts cannot submit personal recipient requests even when also carrying an Owner role', () => {
  for (const role of ['STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN']) assert.equal(isPersonalRecipient(['VAULT_OWNER', role]), false);
  assert.equal(isPersonalRecipient(['VAULT_OWNER', 'BENEFICIARY']), true);
});
