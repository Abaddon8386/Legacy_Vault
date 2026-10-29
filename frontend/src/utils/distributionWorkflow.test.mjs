import test from 'node:test';
import assert from 'node:assert/strict';
import { canUseDistributionAction, distributionActions, distributionFinalReady, loadDistributionWorkflow,
  saveDistributionAction, validateDistributionWorkflow, preflightDistributionFinal } from '../workflows/distributionWorkflowService.js';
const id = '11111111-1111-4111-8111-111111111111', recipient = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(64), allocationSha = 'b'.repeat(64);
function model(phase = 'DOCUMENT_REQUEST_NEEDED', changes = {}) {
  return { caseId: id, revision: 4, phase, prerequisites: { deathApproved: true, willMatched: true }, request: { id, reason: 'Nộp giấy tờ phân chia hợp lệ' },
    document: { version: 2, sha256: sha, status: 'APPROVED' }, allocation: { version: 1, documentVersion: 2, sha256: allocationSha, status: 'SUBMITTED',
      items: [{ assetId: id, beneficiaryId: recipient, assetName: 'Tài khoản lưu trữ', recipientName: 'Nguyễn An', description: 'Toàn bộ' }] },
    capabilities: Object.fromEntries(Object.keys(distributionActions).map(action => [action, { allowed: true, blockedReason: null }])), ...changes };
}
const opts = { accessToken: 'test-token', fetchFn: async () => { throw Error('Unexpected request'); } };
const json = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });

test('first document request needs death approval and a matched will; it does not choose a court route', async () => {
  const value = model('DOCUMENT_REQUEST_NEEDED', { request: null, document: null, allocation: null });
  assert.equal(canUseDistributionAction(value, 'requestDocuments', 'LEGAL'), true);
  assert.equal(canUseDistributionAction({ ...value, prerequisites: { deathApproved: false, willMatched: true } }, 'requestDocuments', 'LEGAL'), false);
  assert.equal(canUseDistributionAction({ ...value, prerequisites: { deathApproved: true, willMatched: false } }, 'requestDocuments', 'LEGAL'), false);
  const calls = [];
  await saveDistributionAction(id, 'LEGAL', 'requestDocuments', { reason: '  Nộp giấy phân chia  ' }, value, { ...opts, fetchFn: async (url, init) => {
    calls.push({ url, init }); return init.method === 'GET' ? json(value) : json({ caseId: id, action: 'requestDocuments', revision: 5 });
  } });
  assert.equal(calls.length, 2); assert.match(calls[1].url, /request-documents$/);
  assert.deepEqual(JSON.parse(calls[1].init.body), { revision: 4, reason: 'Nộp giấy phân chia' });
});
test('Staff upload needs an explicit request; allocations stay locked until document approval', () => {
  const value = model('AWAITING_DOCUMENTS', { document: null, allocation: null });
  assert.equal(canUseDistributionAction(value, 'uploadDocuments', 'STAFF'), true);
  assert.equal(canUseDistributionAction({ ...value, request: null }, 'uploadDocuments', 'STAFF'), false);
  assert.equal(canUseDistributionAction(value, 'submitAllocations', 'STAFF'), false);
  assert.equal(canUseDistributionAction(model('AWAITING_ALLOCATIONS'), 'submitAllocations', 'STAFF'), true);
  assert.equal(canUseDistributionAction(model('AWAITING_ALLOCATIONS', { document: { version: 2, sha256: sha, status: 'PENDING' } }), 'submitAllocations', 'STAFF'), false);
});
test('roles and phases cannot be bypassed by an allowed capability', () => {
  for (const [action, [role, , phases]] of Object.entries(distributionActions)) {
    const value = model(phases[0]);
    assert.equal(canUseDistributionAction(value, action, role === 'STAFF' ? 'LEGAL' : 'STAFF'), false);
    assert.equal(canUseDistributionAction({ ...value, phase: 'CLOSED' }, action, role), false);
    assert.equal(canUseDistributionAction({ ...value, phase: 'UNLOCKED' }, action, role), false);
  }
});
test('Legal reviews each submitted allocation against the approved current document', () => {
  const value = model('ALLOCATIONS_UNDER_REVIEW');
  assert.equal(canUseDistributionAction(value, 'approveAllocations', 'LEGAL'), true);
  assert.equal(canUseDistributionAction({ ...value, allocation: { ...value.allocation, documentVersion: 1 } }, 'approveAllocations', 'LEGAL'), false);
  assert.equal(canUseDistributionAction({ ...value, allocation: { ...value.allocation, items: [] } }, 'approveAllocations', 'LEGAL'), false);
});
test('final approval and unlock are separate and require matching approved document and allocation snapshots', () => {
  const value = model('FINAL_APPROVAL'); value.allocation.status = 'APPROVED';
  const context = { basisDossier: { versions: [{ version: 2, sha256: sha }] }, snapshot: { allocationHash: allocationSha } };
  assert.equal(distributionFinalReady(value, context, 'approval-review'), true);
  assert.equal(distributionFinalReady(value, context, 'controlled-unlock'), false);
  assert.equal(distributionFinalReady({ ...value, phase: 'APPROVED' }, context, 'controlled-unlock'), true);
  assert.equal(distributionFinalReady(value, { ...context, snapshot: { allocationHash: 'c'.repeat(64) } }, 'approval-review'), false);
  assert.equal(distributionFinalReady({ ...value, allocation: { ...value.allocation, status: 'SUBMITTED' } }, context, 'approval-review'), false);
});
test('allocation submission has its own JSON API and never uploads the document again', async () => {
  const value = model('AWAITING_ALLOCATIONS'), calls = [];
  await saveDistributionAction(id, 'STAFF', 'submitAllocations', { allocations: [{ assetId: id, beneficiaryId: recipient, description: 'Toàn bộ' }] }, value,
    { ...opts, fetchFn: async (url, init) => { calls.push({ url, init }); return init.method === 'GET' ? json(value) : json({ caseId: id, action: 'submitAllocations', revision: 5 }); } });
  assert.match(calls[1].url, /submit-allocations$/);
  const body = JSON.parse(calls[1].init.body); assert.equal(body.documentVersion, 2); assert.equal(body.documentSha256, sha);
  assert.equal(body.allocations.length, 1); assert.equal(Object.hasOwn(body, 'file'), false);
});
test('stale revision stops before POST and preserves the server state', async () => {
  const value = model('DOCUMENTS_UNDER_REVIEW'); let calls = 0;
  await assert.rejects(saveDistributionAction(id, 'LEGAL', 'approveDocuments', { reason: 'Hợp lệ' }, value,
    { ...opts, fetchFn: async (_url, init) => { calls++; assert.equal(init.method, 'GET'); return json({ ...value, revision: 5 }); } }), error => error.code === 'CONFLICT');
  assert.equal(calls, 1);
});
test('supplementation and allocation correction need a nonblank reason', async () => {
  for (const [action, phase] of [['requestDocumentSupplementation', 'DOCUMENTS_UNDER_REVIEW'], ['requestAllocationChanges', 'ALLOCATIONS_UNDER_REVIEW']]) {
    const value = model(phase);
    await assert.rejects(saveDistributionAction(id, 'LEGAL', action, { reason: '  ' }, value, { ...opts, fetchFn: async () => json(value) }), error => error.code === 'VALIDATION_FAILED');
  }
});
test('missing API, cross-case payload and malformed capabilities never create a local success', async () => {
  assert.throws(() => validateDistributionWorkflow(model(), recipient), error => error.code === 'INVALID_RESPONSE');
  assert.throws(() => validateDistributionWorkflow(model('AWAITING_DOCUMENTS', { capabilities: {} }), id), error => error.code === 'INVALID_RESPONSE');
  await assert.rejects(loadDistributionWorkflow(id, 'STAFF', { ...opts, fetchFn: async () => new Response('{}', { status: 404, headers: { 'Content-Type': 'application/json' } }) }), error => error.status === 404);
});

test('a changed document snapshot is rejected even when an invalid server reuses the same revision', async () => {
  const value = model('DOCUMENTS_UNDER_REVIEW'); let calls = 0;
  await assert.rejects(saveDistributionAction(id, 'LEGAL', 'approveDocuments', { reason: 'Hợp lệ' }, value,
    { ...opts, fetchFn: async (_url, init) => { calls++; assert.equal(init.method, 'GET'); return json({ ...value, document: { ...value.document, sha256: 'c'.repeat(64) } }); } }), error => error.code === 'CONFLICT');
  assert.equal(calls, 1);
});

test('a new supplementation decision blocks final confirmation even if the earlier case snapshot is still cached', async () => {
  const expected = model('FINAL_APPROVAL'); expected.allocation.status = 'APPROVED';
  const context = { basisDossier: { versions: [{ version: 2, sha256: sha }] }, snapshot: { allocationHash: allocationSha } };
  await assert.rejects(preflightDistributionFinal(id, expected, context, 'approval-review', { ...opts,
    fetchFn: async () => json({ ...expected, revision: 5, phase: 'AWAITING_DOCUMENTS' }) }), error => error.code === 'CONFLICT');
});
