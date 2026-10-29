import test from 'node:test';
import assert from 'node:assert/strict';
import { staffGuidance, legalGuidance, legalBlockedReason, beneficiaryGuidance, workflowUrl } from './workflowGuidance.js';

test('a later visited Staff screen never marks earlier steps completed', () => {
  const model = staffGuidance({ current: 'archive', caseId: 'case-a' });
  assert.ok(model.steps.every(s => s.state !== 'done'));
  assert.ok(model.steps.every(s => s.href));
});
test('Staff completes intake/legal from approved scope or unlocked vault, never session ID alone', () => {
  for (const evidence of [{legalApproved:true}, {vaultStatus:'HANDOVER_IN_PROGRESS'}, {vaultStatus:'UNLOCKED'}]) {
    const m=staffGuidance({caseId:'case-a',current:'handover',...evidence});
    assert.equal(m.steps[0].state,'done'); assert.equal(m.steps[1].state,'done');
  }
  assert.equal(staffGuidance({caseId:'case-a',sessionId:'session-a'}).steps[1].state,'waiting');
  assert.equal(staffGuidance({caseId:'case-a',legalApproved:true,error:true}).steps[1].state,'waiting');
});
test('Legal completes preceding steps from current approval capabilities and matching will', () => {
  const m=legalGuidance({context:{caseStatus:'OPEN',vaultStatus:'LEGAL_BASIS_VERIFICATION',willComparison:{latestResult:'MATCH',approvalBlocked:false},capabilities:{approval:{allowed:true}}}});
  assert.equal(m.steps[0].state,'done'); assert.equal(m.steps[1].state,'done');
});
test('Staff guides to confirmation only when delivery counts are exact and distinguishes missing data', () => {
  const opts = { caseId: 'case-a', assets: { delivered: 2, total: 2 }, beneficiaries: { confirmed: 1, total: 2 } };
  assert.equal(staffGuidance(opts).next.id, 'confirmation');
  assert.match(staffGuidance({ ...opts, beneficiaries: null }).message, /cần tải trạng thái ký nhận/);
  assert.notEqual(staffGuidance({ ...opts, assets: { delivered: 199, total: 200 } }).next?.id, 'archive');
});
test('close and receipt remain distinct; archive does not follow 100 percent alone', () => {
  const model = staffGuidance({ caseId: 'case-a', current: 'confirmation', sessionStatus: 'COMPLETED', assets: { delivered: 1, total: 1 }, beneficiaries: { confirmed: 1, total: 1 }, hasReceipts: false });
  assert.match(model.message, /Lập biên nhận Staff/); assert.equal(model.steps.find(s => s.id === 'archive').state, 'action');
});
test('closed, on-hold and failed Staff reads never advertise a mutation-ready next step', () => {
  for (const opts of [{ caseStatus: 'CLOSED' }, { error: true }, { loading: true }]) {
    const model = staffGuidance({ caseId: 'a', canArchive: true, ...opts });
    assert.equal(model.next, undefined); assert.ok(model.steps.every(s => s.state !== 'action'));
  }
  assert.match(staffGuidance({ caseId: 'a', vaultStatus: 'ON_HOLD' }).message, /tạm dừng/);
});
const context = { distributionWorkflow: { phase: 'FINAL_APPROVAL' }, willComparison: { latestResult: 'MATCH', approvalBlocked: false }, caseStatus: 'OPEN', vaultStatus: 'LEGAL_BASIS_VERIFICATION', basisDossier: { route: 'COURT', versions: [{ version: 2, forwardStatus: 'FORWARDED' }] }, snapshot: { currentVersion: 2, reviewFresh: true, courtResult: 'VALID', approvalCurrent: false }, capabilities: { approval: { allowed: true, blockedReason: null }, unlock: { allowed: false, blockedReason: 'LEGAL_APPROVAL_REQUIRED' } } };
test('Legal approval and unlock are distinct and never depend on recipient account presence', () => {
  const ready = legalGuidance({ context, current: 'dossier-review', caseId: 'a' });
  assert.equal(ready.next.id, 'approval'); assert.notEqual(ready.steps.find(s => s.id === 'unlock').state, 'done');
  const approved = { ...context, distributionWorkflow: { phase: 'APPROVED' }, snapshot: { ...context.snapshot, approvalCurrent: true }, capabilities: { ...context.capabilities, unlock: { allowed: true } } };
  assert.equal(legalGuidance({ context: approved, current: 'approval-review' }).next.id, 'unlock');
});
test('Legal explains stale scope, HOLD, court evidence and missing approval in VI/EN', () => {
  for (const code of ['LEGAL_DECISION_STALE', 'LEGAL_WORKFLOW_ON_HOLD', 'COURT_DECISION_REQUIRED', 'LEGAL_APPROVAL_REQUIRED']) {
    const blocked = { ...context, capabilities: { approval: { allowed: false, blockedReason: code } } };
    assert.notEqual(legalBlockedReason(blocked, 'approval', 'vi'), legalBlockedReason(blocked, 'approval', 'en'));
    assert.ok(!legalBlockedReason(blocked, 'approval').includes(code));
  }
  const closed = legalGuidance({ context: { ...context, caseStatus: 'CLOSED' }, current: 'approval-review' });
  assert.equal(closed.next, undefined); assert.equal(closed.steps.find(s => s.id === 'approval').state, 'blocked');
});
test('pending request cannot complete linking, while received items remain visible for other records', () => {
  const m = beneficiaryGuidance({ eligible: true, ready: true, requests: [{ status: 'PENDING' }], stage: 'PARTIAL' });
  assert.equal(m.current, 'link'); assert.match(m.message, /trước đó vẫn xem được/);
  assert.equal(m.steps.find(s => s.id === 'assets').statusLabel, 'Đã nhận một phần');
  const pendingOnly = beneficiaryGuidance({ eligible: true, ready: true, requests: [{ status: 'PENDING' }], stage: 'UNLINKED' });
  assert.equal(pendingOnly.steps.find(s => s.id === 'link').state, 'waiting');
});
test('linked but undelivered is waiting; unavailable and errored requests never appear complete', () => {
  const m = beneficiaryGuidance({ eligible: true, ready: true, requests: [{ status: 'APPROVED' }], stage: 'AWAITING_HANDOVER' });
  assert.equal(m.steps.find(s => s.id === 'assets').state, 'waiting');
  assert.match(m.message, /chờ Staff bàn giao/);
  assert.equal(beneficiaryGuidance({ eligible: true, ready: false }).steps.find(s => s.id === 'request').state, 'blocked');
  assert.equal(beneficiaryGuidance({ eligible: true, ready: true, error: true, requests: [{ status: 'APPROVED' }] }).steps.find(s => s.id === 'link').state, 'waiting');
});
test('workflow navigation preserves case/session/locale and never grants a role', () => {
  const url = new URL(workflowUrl('/staff/handover', { caseId: 'a&b', sessionId: 'session-a', lang: 'en', preview: true }), 'http://localhost');
  assert.equal(url.searchParams.get('caseId'), 'a&b'); assert.equal(url.searchParams.get('sessionId'), 'session-a');
  assert.equal(url.searchParams.get('lang'), 'en'); assert.equal(url.searchParams.get('role'), null);
});
