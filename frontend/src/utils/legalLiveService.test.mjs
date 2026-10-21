import test from 'node:test';
import assert from 'node:assert/strict';
import * as api from '../pages/legal/legalLiveService.js';

const id = '11111111-1111-4111-8111-111111111111';
const other = '22222222-2222-4222-8222-222222222222';
const digest = 'a'.repeat(64), allocation = 'b'.repeat(64), now = '2026-10-20T06:00:00Z';
const base = '/api/v1/legal-verifications/verification-cases/' + id;
const options = { accessToken: 'test-token', roles: ['LEGAL_VERIFIER'], userId: id, dossierId: id, vaultId: id, expectedHash: digest };
const dossier = { id, caseId: id, route: 'NOTARIAL', status: 'DRAFT', disputeStatus: 'NONE', requiredVersion: 1, versions: [], classifiedBy: id };
const death = { deathDocumentPublicId: id, verificationCasePublicId: id, result: 'APPROVED', verifierPublicId: id, decidedAt: now, reason: 'Reviewed', verificationCaseStatus: 'OPEN', vaultStatus: 'DOCUMENT_VERIFICATION' };
const review = { dossierId: id, reviewStatus: 'FRESH', reviewRequired: false, currentVersionNo: 1, currentSha256Hash: digest, currentAllocationHash: allocation, currentDisputeStatus: 'NONE', checkedAt: '2026-10-20T06:00:00' };
const comparison = { id, caseId: id, originalWillIntakeId: id, willId: id, version: 1, sha256: digest, result: 'MATCH', checkedBy: id, comparedAt: now };
const court = { id, caseId: id, version: 1, sha256: digest, result: 'VALID', reviewedBy: id, reviewedAt: now };
const approval = { dossierId: id, decision: 'LEGAL_APPROVED', versionNo: 1, sha256Hash: digest, allocationHash: allocation, decidedBy: id, decidedAt: '2026-10-20T06:00:00' };
const unlock = { caseId: id, vaultId: id, status: 'UNLOCKED', unlockedBy: id, unlockedAt: now };
const cases = [
  ['death', o => api.decideDeathDocument(id, id, { decision: 'APPROVE', reason: ' Reviewed ', role: 'ADMIN' }, o), '/api/v1/legal-verifications/death-documents/' + id + '/decision', 200, death, { decision: 'APPROVE', reason: 'Reviewed' }],
  ['will', o => api.compareWill(id, { originalWillIntakeId: id, willId: id, version: 1, result: 'MATCH', checkedBy: other }, o), base + '/will-comparisons', 201, comparison, { originalWillIntakeId: id, willId: id, version: 1, result: 'MATCH', reason: '' }],
  ['classify', o => api.classifyLegalDossier(id, { route: 'NOTARIAL', routeReason: 'Reviewed' }, o), base + '/basis-dossier', 201, dossier, { route: 'NOTARIAL', routeReason: 'Reviewed' }],
  ['reclassify', o => api.classifyLegalDossier(id, { route: 'NOTARIAL', routeReason: 'Reviewed' }, { ...o, reclassification: true }), base + '/basis-dossier/reclassification', 200, dossier, { route: 'NOTARIAL', routeReason: 'Reviewed' }],
  ['hold', o => api.holdLegalDossier(id, { cause: 'NEW_DISPUTE', reason: 'Reviewed' }, o), base + '/basis-dossier/hold', 200, { ...dossier, route: 'ON_HOLD' }, { cause: 'NEW_DISPUTE', reason: 'Reviewed' }],
  ['review', o => api.reviewLegalDossier(id, { action: 'review', reason: 'Reviewed' }, o), base + '/basis-dossier/review', 200, review, { reason: 'Reviewed' }],
  ['supplement', o => api.reviewLegalDossier(id, { action: 'request-supplementation', reason: 'Reviewed' }, o), base + '/basis-dossier/request-supplementation', 200, { ...review, reviewRequired: true, reviewStatus: 'REVIEW_REQUIRED' }, { reason: 'Reviewed' }],
  ['court', o => api.decideCourt(id, { version: 1, result: 'VALID', reason: 'Reviewed' }, o), base + '/basis-dossier/court-decisions', 201, court, { version: 1, result: 'VALID', reason: 'Reviewed' }],
  ['approval', o => api.decideLegalApproval(id, { decision: 'APPROVE', versionNo: 1, sha256Hash: digest, allocationHash: allocation }, o), base + '/basis-dossier/decision', 200, approval, { decision: 'APPROVE', versionNo: 1, sha256Hash: digest, allocationHash: allocation, reason: '' }],
  ['unlock', o => api.unlockLegalVault(id, o), base + '/unlock', 200, unlock, undefined],
];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
for (const [name, run, url, status, receipt, body] of cases) {
  test(`${name}: exact Legal URL/method/status/body, authenticated actor and validated receipt`, async () => {
    const controller = new AbortController();
    const result = await run({ ...options, signal: controller.signal, fetchFn: async (actual, init) => {
      assert.equal(actual, url); assert.equal(init.method, 'POST'); assert.equal(init.headers.Authorization, 'Bearer test-token');
      assert.equal(init.signal, controller.signal); assert.deepEqual(init.body === undefined ? undefined : JSON.parse(init.body), body);
      return json(receipt, status);
    } });
    assert.deepEqual(result, receipt);
  });
  test(`${name}: no synthetic success on malformed receipt or wrong HTTP status`, async () => {
    await assert.rejects(run({ ...options, fetchFn: async () => json({}, status) }), { code: 'INVALID_RESPONSE' });
    await assert.rejects(run({ ...options, fetchFn: async () => json(receipt, status === 200 ? 201 : 200) }), { code: 'INVALID_RESPONSE' });
  });
  test(`${name}: never submits with Staff/Owner/Admin role`, async () => {
    for (const roles of [['STAFF_EXECUTOR'], ['VAULT_OWNER'], ['ADMIN'], []]) await assert.rejects(run({ ...options, roles,
      fetchFn: async () => { assert.fail('Must not send'); } }), { code: 'ACCESS_DENIED' });
  });
}
for (const status of [401, 403, 404, 409]) test(`Preserves shared API error ${status}`, async () => {
  await assert.rejects(api.unlockLegalVault(id, { ...options, fetchFn: async () => json({ code: 'SERVER_GUARD' }, status) }), { code: 'SERVER_GUARD', status });
});
test('Death receipt must match document/case, decision, actor and timestamp', async () => {
  for (const change of [{ verificationCasePublicId: other }, { deathDocumentPublicId: other }, { result: 'REJECTED' }, { verifierPublicId: other }, { decidedAt: null }]) {
    await assert.rejects(api.decideDeathDocument(id, id, { decision: 'APPROVE', reason: 'Reviewed' }, { ...options, fetchFn: async () => json({ ...death, ...change }) }), { code: 'INVALID_RESPONSE' });
  }
});
test('Will, court and final approval reject stale version/hash/allocations from response', async () => {
  await assert.rejects(cases[1][1]({ ...options, fetchFn: async () => json({ ...comparison, version: 2 }, 201) }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(cases[7][1]({ ...options, fetchFn: async () => json({ ...court, sha256: allocation }, 201) }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(cases[8][1]({ ...options, fetchFn: async () => json({ ...approval, allocationHash: digest }) }), { code: 'INVALID_RESPONSE' });
});
test('Unlock receipt must confirm exact case/vault and UNLOCKED; DMS alone cannot confirm unlock', async () => {
  for (const change of [{ caseId: other }, { vaultId: other }, { status: 'AWAITING_VERIFICATION' }, { unlockedBy: other }, { unlockedAt: null }]) {
    await assert.rejects(api.unlockLegalVault(id, { ...options, fetchFn: async () => json({ ...unlock, ...change }) }), { code: 'INVALID_RESPONSE' });
  }
});
test('DTO boundaries: reasons, enums, hashes and versions fail before network', async () => {
  const opts = { ...options, fetchFn: async () => assert.fail('Must not send') };
  await assert.rejects(api.decideDeathDocument(id, id, { decision: 'APPROVE', reason: ' ' }, opts), { code: 'VALIDATION_FAILED' });
  await assert.rejects(api.decideDeathDocument(id, id, { decision: 'APPROVE', reason: 'x'.repeat(1001) }, opts), { code: 'VALIDATION_FAILED' });
  await assert.rejects(api.compareWill(id, { originalWillIntakeId: id, willId: id, version: 1, result: 'MISMATCH' }, opts), { code: 'VALIDATION_FAILED' });
  await assert.rejects(api.classifyLegalDossier(id, { route: 'ON_HOLD', routeReason: 'Valid' }, { ...opts, reclassification: true }), { code: 'VALIDATION_FAILED' });
  await assert.rejects(api.decideLegalApproval(id, { decision: 'REJECT', versionNo: 1, sha256Hash: digest, allocationHash: allocation }, opts), { code: 'VALIDATION_FAILED' });
  await assert.rejects(api.unlockLegalVault(id, { ...opts, vaultId: null }), { code: 'VALIDATION_FAILED' });
});
test('Known reads only use Legal endpoints and reject cross-case data', async () => {
  const read = async (run, expected, value) => run({ ...options, fetchFn: async (url, init) => { assert.equal(url, expected); assert.equal(init.method, 'GET'); return json(value); } });
  await read(o => api.loadLegalDossier(id, o), base + '/basis-dossier', dossier);
  await read(o => api.loadCourtDecisions(id, o), base + '/basis-dossier/court-decisions', [court]);
  await read(o => api.loadDeathDocument(id, id, o), '/api/v1/legal-verifications/death-documents/' + id,
    { deathDocumentPublicId: id, verificationCasePublicId: id, verificationCaseStatus: 'OPEN', vaultStatus: 'AWAITING_VERIFICATION', document: {}, decisions: [] });
  await read(o => api.loadWillComparisons(id, o), base + '/will-comparisons', { caseId: id, vaultStatus: 'DOCUMENT_VERIFICATION', approvalBlocked: true, originalWillIntakes: [], wills: [], comparisons: [] });
  await assert.rejects(api.loadLegalDossier(id, { ...options, fetchFn: async () => json({ ...dossier, caseId: other }) }), { code: 'INVALID_RESPONSE' });
});
