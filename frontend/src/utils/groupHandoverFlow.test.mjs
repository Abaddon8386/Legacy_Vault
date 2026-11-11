import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

// FE integration only: both real components/adapters share a simulated HTTP contract.
// This does not prove BE authorization, persistence, notification delivery or SQL atomicity.
const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/handover' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(entry) {
  const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
    lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const [Staff, Legal] = await Promise.all([
  component('src/components/staff/StaffGroupHandover.jsx'), component('src/pages/legal/LegalHandoverReopen.jsx'),
]);
const caseId = '11111111-1111-4111-8111-111111111111', sessionId = '22222222-2222-4222-8222-222222222222';
const recipients = ['33333333-3333-4333-8333-333333333333', '44444444-4444-4444-8444-444444444444'];
const people = recipients.map((beneficiaryId, index) => ({ beneficiaryId, fullName: ['Nguyễn An', 'Trần Bình'][index] }));
const actor = { userId: '55555555-5555-4555-8555-555555555555', fullName: 'Nhân viên kiểm thử' };
const legalActor = { userId: '66666666-6666-4666-8666-666666666666', fullName: 'Pháp lý kiểm thử' };
const now = '2026-11-03T12:00:00Z', snapshot = 'current-scope', hash = 'a'.repeat(64);
const staffRoot = `/api/v1/staff/verification-cases/${caseId}/handover-sessions/${sessionId}/group-handover`;
const legalRoot = `/api/v1/legal-verifications/verification-cases/${caseId}/handover-sessions/${sessionId}/group-handover`;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const page = (content, size = 20) => ({ content, page: 0, size, totalElements: content.length, totalPages: content.length ? 1 : 0 });
const workflow = { caseId, revision: 1, phase: 'UNLOCKED', prerequisites: { deathApproved: true, willMatched: true },
  request: { id: caseId, reason: 'Giấy tờ hợp lệ' }, document: { version: 1, sha256: hash, status: 'APPROVED' },
  allocation: { version: 1, documentVersion: 1, sha256: hash, status: 'APPROVED',
    items: people.map(person => ({ assetId: person.beneficiaryId, assetName: 'Tài sản kiểm thử', description: '', beneficiaryId: person.beneficiaryId, recipientName: person.fullName })) },
  capabilities: Object.fromEntries(['requestDocuments', 'uploadDocuments', 'forwardDocuments', 'approveDocuments', 'requestDocumentSupplementation',
    'submitAllocations', 'approveAllocations', 'requestAllocationChanges'].map(action => [action, { allowed: false, blockedReason: 'NOT_CURRENT_STEP' }])) };

function contract({ lang, notificationRecorded = false, deliveryAfterApproval = true }) {
  let revision = 0, status = 'UNCONFIRMED', attendance = null, request = null, lastDecision = null;
  const events = [], posts = [];
  const allPresent = () => attendance?.presentRecipientIds.length === recipients.length;
  const state = () => ({ status, revision, allPresent: !!allPresent(), requestId: request?.requestId ?? null,
    attendanceId: attendance?.attendanceId ?? null, snapshot: attendance ? snapshot : null });
  const detail = legal => ({ caseId, caseNumber: 'HS-2026-000126', sessionId, sessionStatus: 'OPEN', snapshot,
    state: state(), requiredRecipientIds: recipients, deliveryAllowed: status === 'READY' && deliveryAfterApproval,
    attendance, request, lastDecision, progress: { totalAssets: 2, deliveredAssets: 0, requiredRecipients: 2, presentRecipients: attendance?.presentRecipientIds.length ?? 0 },
    capabilities: { canDecide: legal && status === 'AWAITING_LEGAL', canRecordAttendance: !legal,
      canRequestReopen: !legal && status === 'SUSPENDED' && !!allPresent(), deliveryBlockedReason: status === 'READY' && deliveryAfterApproval ? null : 'LEGAL_REOPEN_REQUIRED' } });
  globalThis.fetch = async (url, init = {}) => {
    const parsed = new URL(url, 'http://localhost'), path = parsed.pathname, legal = path.includes('/legal-verifications/');
    const headers = new Headers(init.headers);
    assert.equal(headers.get('Authorization'), legal ? 'Bearer legal-fixture' : 'Bearer staff-fixture');
    assert.equal(headers.get('Accept-Language'), lang);
    if (init.method === 'POST') {
      const body = JSON.parse(init.body), key = headers.get('Idempotency-Key');
      assert.match(key, /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i);
      assert.equal(body.expectedRevision, revision);
      assert.ok(body.reason.trim());
      assert.deepEqual(Object.keys(body).sort(), (legal ? ['decision', 'expectedRevision', 'reason']
        : path.endsWith('/attendance') ? ['expectedRevision', 'presentRecipientIds', 'reason'] : ['expectedRevision', 'reason']).sort());
      posts.push({ path, body, key });
      const eventId = `aaaaaaaa-aaaa-4aaa-8aaa-${String(++revision).padStart(12, '0')}`;
      let operation;
      if (path === staffRoot + '/attendance') {
        operation = 'ATTENDANCE';
        attendance = { attendanceId: eventId, recordedAt: now, recordedBy: actor, presentRecipientIds: body.presentRecipientIds, reason: body.reason };
        status = allPresent() && status === 'UNCONFIRMED' ? 'READY' : 'SUSPENDED'; request = null;
      } else if (path === staffRoot + '/reopen-requests') {
        assert.equal(status, 'SUSPENDED'); assert.equal(allPresent(), true); operation = 'REQUEST'; status = 'AWAITING_LEGAL';
        request = { requestId: eventId, requestedAt: now, requestedBy: actor, reason: body.reason };
      } else {
        assert.equal(path, legalRoot + `/reopen-requests/${request?.requestId}/decision`);
        assert.ok(['APPROVE', 'REJECT'].includes(body.decision)); operation = body.decision;
        status = body.decision === 'APPROVE' ? 'READY' : 'SUSPENDED'; request = null;
        lastDecision = { eventId, result: body.decision, decidedAt: now, decidedBy: legalActor, reason: body.reason };
      }
      events.unshift({ eventId, sessionId, operation, revision, resultingStatus: status, allPresent: !!allPresent(),
        presentRecipients: attendance.presentRecipientIds.length, reason: body.reason, at: now, by: legal ? legalActor : actor });
      return json({ caseId, sessionId, eventId, state: state(), notification: notificationRecorded
        ? { id: eventId, recipientWorkspace: legal ? 'STAFF' : 'LEGAL', status: 'RECORDED' } : null });
    }
    if (path.endsWith('/group-handover') || legal) assert.equal(init.cache, 'no-store');
    if (path === staffRoot || path === legalRoot) return json(detail(legal));
    if (path === `/api/v1/staff/verification-cases/${caseId}/beneficiaries`) return json(people);
    if (path === `/api/v1/legal-verifications/verification-cases/${caseId}/distribution-workflow`) return json(workflow);
    if (path === legalRoot + '/events') return json(page(events, Number(parsed.searchParams.get('size'))));
    assert.equal(path, '/api/v1/legal-verifications/group-handover/reopen-requests');
    const content = status === 'AWAITING_LEGAL' ? [{ ...request, caseId, caseNumber: 'HS-2026-000126', sessionId,
      vaultName: 'Kho kiểm thử', revision, allPresent: true, requiredRecipients: 2, presentRecipients: 2,
      totalAssets: 2, deliveredAssets: 0, decidable: true }] : [];
    return json(page(content, Number(parsed.searchParams.get('size'))));
  };
  return { posts };
}

const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });
const reactProps = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
const flush = () => act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
const fill = (host, value) => act(async () => reactProps(host.querySelector('textarea')).onChange({ target: { value } }));
async function click(host, label) {
  const button = [...host.querySelectorAll('button')].find(item => item.textContent.trim() === label);
  assert.ok(button, `Missing button: ${label}`); assert.equal(button.disabled, false);
  await act(async () => button.click()); await flush();
}
async function mount(lang) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement('div', null,
    React.createElement('div', { 'data-staff': true }, React.createElement(Staff, { caseId, sessionId, accessToken: 'staff-fixture', lang },
      React.createElement('div', { 'data-delivery-controls': true }, 'Existing delivery controls'))),
    React.createElement('div', { 'data-legal': true }, React.createElement(Legal, { session: { accessToken: 'legal-fixture' }, caseId, lang })))));
  await flush();
  return { staff: host.querySelector('[data-staff]'), legal: host.querySelector('[data-legal]'),
    close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const deliveryVisible = view => !!view.staff.querySelector('[data-delivery-controls]');
async function requestReopening(view, lang) {
  const en = lang === 'en';
  assert.equal(deliveryVisible(view), false); assert.equal(view.legal.querySelector('textarea'), null);
  await act(async () => view.staff.querySelector('input').click());
  await fill(view.staff, 'Thiếu người nhận Bình');
  await click(view.staff, en ? 'Record absence and suspend all delivery' : 'Ghi nhận thiếu người và tạm khóa toàn bộ');
  assert.equal(deliveryVisible(view), false);
  assert.equal(view.staff.querySelectorAll('input:checked').length, 1);
  assert.equal(view.legal.querySelector('textarea'), null, 'Legal has no decision before Staff requests reopening');
  await act(async () => view.staff.querySelectorAll('input')[1].click());
  await fill(view.staff, 'Hai người đã có mặt');
  await click(view.staff, en ? 'Record everyone present' : 'Ghi nhận đã có đủ người');
  assert.equal(deliveryVisible(view), false, 'all present does not self-reopen');
  assert.equal(view.staff.querySelectorAll('input:checked').length, 2);
  await fill(view.staff, 'Đề nghị xét mở lại');
  await click(view.staff, en ? 'Request Legal reopening' : 'Gửi Ban Pháp lý yêu cầu mở lại');
  assert.equal(deliveryVisible(view), false); assert.ok(view.staff.querySelector('fieldset').disabled);
  assert.match(view.legal.textContent, /Nguyễn An/); assert.match(view.legal.textContent, /Trần Bình/);
  assert.match(view.legal.textContent, /Thiếu người nhận Bình/); assert.match(view.legal.textContent, /Đề nghị xét mở lại/);
  assert.match(view.legal.textContent, /Nhân viên kiểm thử/);
  assert.doesNotMatch(view.legal.textContent, /[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}/i);
  for (const button of view.legal.querySelectorAll('.lv-legal-reopen__actions button')) assert.equal(button.disabled, true);
}

for (const lang of ['vi', 'en']) for (const decision of ['APPROVE', 'REJECT']) {
  test(`Staff and Legal share one contract flow through ${decision} (${lang}); only server permission exposes delivery`, async () => {
    const log = contract({ lang, notificationRecorded: decision === 'APPROVE' });
    const view = await mount(lang), en = lang === 'en';
    try {
      await requestReopening(view, lang);
      await fill(view.legal, 'Đã kiểm tra điều kiện mở lại');
      await click(view.legal, decision === 'APPROVE' ? (en ? 'Allow reopening' : 'Cho phép mở lại') : (en ? 'Refuse reopening' : 'Từ chối mở lại'));
      assert.equal(view.legal.querySelector('textarea'), null);
      assert.match(view.legal.textContent, /Đã kiểm tra điều kiện mở lại/);
      assert.match(view.legal.textContent, en ? /Delivered 0\/2 assets/ : /Đã giao 0\/2 tài sản/);
      // A recorded notification needs no message; only a missing one is reported.
      if (decision === 'APPROVE') assert.doesNotMatch(view.legal.textContent, en ? /notification for Staff has been recorded/ : /Đã ghi nhận thông báo cho Nhân viên/);
      else assert.match(view.legal.textContent, en ? /not confirmed/ : /Chưa xác nhận thông báo/);
      await click(view.staff, en ? 'Reload attendance' : 'Tải lại danh sách có mặt');
      assert.equal(deliveryVisible(view), decision === 'APPROVE');
      assert.deepEqual(log.posts.map(call => call.body.expectedRevision), [0, 1, 2, 3]);
      assert.equal(new Set(log.posts.map(call => call.key)).size, 4);
      assert.equal(log.posts[3].body.decision, decision);
      assert.equal(log.posts.filter(call => call.path.startsWith(legalRoot)).length, 1);
      assert.ok(log.posts.every(call => call.path.includes('/group-handover/')), 'no automatic delivery, unlock or receipt write');
    } finally { await view.close(); }
  });
}

test('Legal approval cannot reveal Staff delivery when another server gate still blocks it', async () => {
  contract({ lang: 'en', deliveryAfterApproval: false }); const view = await mount('en');
  try {
    await requestReopening(view, 'en'); await fill(view.legal, 'Attendance accepted'); await click(view.legal, 'Allow reopening');
    await click(view.staff, 'Reload attendance');
    assert.equal(deliveryVisible(view), false);
  } finally { await view.close(); }
});

test('a refused request can be followed by a new Staff request and Legal approval without reusing the old request', async () => {
  const log = contract({ lang: 'en' }); const view = await mount('en');
  try {
    await requestReopening(view, 'en'); await fill(view.legal, 'Need confirmation'); await click(view.legal, 'Refuse reopening');
    await click(view.staff, 'Reload attendance'); assert.equal(deliveryVisible(view), false);
    await fill(view.staff, 'Conditions confirmed again'); await click(view.staff, 'Request Legal reopening');
    assert.ok(view.legal.querySelector('textarea'), 'the new request has its own decision form');
    await fill(view.legal, 'New request accepted'); await click(view.legal, 'Allow reopening');
    await click(view.staff, 'Reload attendance'); assert.equal(deliveryVisible(view), true);
    assert.deepEqual(log.posts.map(call => call.body.expectedRevision), [0, 1, 2, 3, 4, 5]);
    assert.notEqual(log.posts[3].path, log.posts[5].path, 'the second decision targets the new request id');
    assert.deepEqual(log.posts.filter(call => call.body.decision).map(call => call.body.decision), ['REJECT', 'APPROVE']);
    assert.match(view.legal.textContent, /New request accepted/); assert.match(view.legal.textContent, /Need confirmation/);
  } finally { await view.close(); }
});

test('unavailable group APIs leave both workspaces blocked without replacing server data with a demo', async () => {
  const calls = [];
  globalThis.fetch = async (url, init) => { calls.push({ url, method: init.method }); return json({ code: 'RESOURCE_NOT_FOUND' }, 404); };
  const view = await mount('en');
  try {
    assert.equal(deliveryVisible(view), false); assert.ok(view.staff.querySelector('[role=alert]'));
    assert.ok(view.legal.querySelector('[role=alert]')); assert.equal(view.legal.querySelector('textarea'), null);
    assert.ok(calls.every(call => call.method === 'GET'));
  } finally { await view.close(); }
});
