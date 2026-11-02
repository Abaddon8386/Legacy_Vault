import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { decideReopenRequest, loadLegalGroupHandover, loadReopenRequests } from '../services/legalGroupHandoverService.js';

const caseA = '11111111-1111-4111-8111-111111111111', sessionA = '22222222-2222-4222-8222-222222222222';
const caseB = '99999999-9999-4999-8999-999999999999', sessionB = '88888888-8888-4888-8888-888888888888';
const req = '33333333-3333-4333-8333-333333333333', req2 = '77777777-7777-4777-8777-777777777777';
const rA = '44444444-4444-4444-8444-444444444444', rB = '55555555-5555-4555-8555-555555555555';
const staff = '66666666-6666-4666-8666-666666666666', event = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', key = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const now = '2026-11-02T06:00:00Z', digest = 'a'.repeat(64);
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const pending = (changes = {}) => ({ requestId: req, caseId: caseA, caseNumber: 'HS-2026-000018', sessionId: sessionA, vaultName: 'Kho Gia đình An', requestedAt: now,
  requestedBy: { userId: staff, fullName: 'Staff Mai' }, reason: 'Đã đủ người, xin mở lại', revision: 3, allPresent: true, requiredRecipients: 2,
  presentRecipients: 2, totalAssets: 3, deliveredAssets: 1, decidable: true, ...changes });
const page = (...content) => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: 1 });
const view = (changes = {}, caseId = caseA, sessionId = sessionA) => ({ state: { status: 'AWAITING_LEGAL', revision: 3, allPresent: true, requestId: req, attendanceId: event, snapshot: 'current' },
  snapshot: 'current', requiredRecipientIds: [rA, rB], deliveryAllowed: false, caseId, caseNumber: 'HS-2026-000018', sessionId, sessionStatus: 'OPEN',
  progress: { totalAssets: 3, deliveredAssets: 1, requiredRecipients: 2, presentRecipients: 2 },
  attendance: { attendanceId: event, recordedAt: now, recordedBy: { userId: staff, fullName: 'Staff Mai' }, presentRecipientIds: [rA, rB], reason: 'Đủ người' },
  request: { requestId: req, requestedAt: now, requestedBy: { userId: staff, fullName: 'Staff Mai' }, reason: 'Đã đủ người, xin mở lại' }, lastDecision: null,
  capabilities: { canRecordAttendance: false, canRequestReopen: false, canDecide: true, deliveryBlockedReason: 'AWAITING_LEGAL_DECISION' }, ...changes });
const workflow = (caseId = caseA, items = [{ beneficiaryId: rA, recipientName: 'Nguyễn An' }, { beneficiaryId: rB, recipientName: 'Trần Bình' }]) => ({ caseId, revision: 1, phase: 'UNLOCKED',
  prerequisites: { deathApproved: true, willMatched: true }, request: { id: caseId, reason: 'Nộp giấy tờ' }, document: { version: 1, sha256: digest, status: 'APPROVED' },
  allocation: { version: 1, documentVersion: 1, sha256: digest, status: 'APPROVED', items: items.map(item => ({ assetId: caseId, assetName: 'Nhà', description: '', ...item })) },
  capabilities: Object.fromEntries(['requestDocuments', 'uploadDocuments', 'forwardDocuments', 'approveDocuments', 'requestDocumentSupplementation', 'submitAllocations', 'approveAllocations', 'requestAllocationChanges']
    .map(action => [action, { allowed: false, blockedReason: 'NOT_CURRENT_STEP' }])) });

test('decision carries only the declared body and key; foreign or contradictory receipts are refused', async () => {
  const args = { caseId: caseA, sessionId: sessionA, requestId: req, decision: 'APPROVE', expectedRevision: 3, reason: '  Đủ điều kiện  ' };
  const receipt = (changes = {}) => json({ caseId: caseA, sessionId: sessionA, eventId: event, state: { ...view().state, status: 'READY', revision: 4 }, notification: null, ...changes });
  let call;
  const result = await decideReopenRequest(args, key, { accessToken: 'test', fetchFn: async (url, init) => { call = { url, init }; return receipt(); } });
  assert.equal(result.state.status, 'READY');
  assert.match(call.url, /\/legal-verifications\/verification-cases\/[^/]+\/handover-sessions\/[^/]+\/group-handover\/reopen-requests\/[^/]+\/decision$/);
  assert.equal(call.init.headers['Idempotency-Key'], key);
  assert.deepEqual(JSON.parse(call.init.body), { expectedRevision: 3, decision: 'APPROVE', reason: 'Đủ điều kiện' });
  const rejects = (changes, code) => assert.rejects(decideReopenRequest({ ...args, ...changes.args }, key, { fetchFn: async () => receipt(changes.receipt) }), { code });
  await rejects({ receipt: { sessionId: caseA } }, 'INVALID_RESPONSE');
  await rejects({ receipt: { state: { ...view().state, status: 'SUSPENDED', revision: 4 } } }, 'INVALID_RESPONSE');
  await rejects({ receipt: { state: { ...view().state, status: 'READY', revision: 9 } } }, 'INVALID_RESPONSE');
  await rejects({ args: { reason: '   ' } }, 'VALIDATION_FAILED');
  await rejects({ args: { decision: 'DELETE' } }, 'VALIDATION_FAILED');
  await assert.rejects(decideReopenRequest(args, key, { fetchFn: async () => json({ code: 'GROUP_HANDOVER_STALE' }, 409) }), { code: 'GROUP_HANDOVER_STALE', status: 409 });
  await assert.rejects(decideReopenRequest(args, key, { fetchFn: async () => { throw new TypeError('offline'); } }), { code: 'NETWORK_ERROR' });
});

test('list and detail readers reject contradictory or unsafe payloads', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => json(page(pending({ decidable: false })));
    await assert.rejects(loadReopenRequests({}, { accessToken: 'test' }), { code: 'INVALID_RESPONSE' });
    globalThis.fetch = async () => json(page(pending({ presentRecipients: 5 })));
    await assert.rejects(loadReopenRequests({}, { accessToken: 'test' }), { code: 'INVALID_RESPONSE' });
    globalThis.fetch = async () => json(page(pending()));
    assert.equal((await loadReopenRequests({}, { accessToken: 'test' })).content.length, 1);
    globalThis.fetch = async () => json(view({}, caseB, sessionB));
    await assert.rejects(loadLegalGroupHandover(caseA, sessionA, { accessToken: 'test' }), { code: 'INVALID_RESPONSE' });
    globalThis.fetch = async () => json(view({ capabilities: { canDecide: 'yes' } }));
    await assert.rejects(loadLegalGroupHandover(caseA, sessionA, { accessToken: 'test' }), { code: 'INVALID_RESPONSE' });
    await assert.rejects(loadLegalGroupHandover('bad', sessionA, { accessToken: 'test' }), { code: 'VALIDATION_FAILED' });
  } finally { globalThis.fetch = original; }
});

const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/controlled-unlock' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/pages/legal/LegalHandoverReopen.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Panel = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const session = { accessToken: 'synthetic-test-only', expiresAt: Date.now() + 3600000, user: { id: staff, fullName: 'Legal Test', roles: ['LEGAL_VERIFIER'] } };
const original = globalThis.fetch, realTimeout = globalThis.setTimeout;
test.afterEach(() => { globalThis.fetch = original; globalThis.setTimeout = realTimeout; });
const reactProps = element => element[Object.keys(element).find(item => item.startsWith('__reactProps$'))];
async function mount(extra = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const props = { session, lang: 'en', caseId: caseA, onNavigate() {}, onUnauthorized() {}, ...extra };
  await act(async () => root.render(React.createElement(Panel, props)));
  return { host, render: async value => act(async () => root.render(React.createElement(Panel, { ...props, ...value }))), close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const settle = () => act(async () => { await new Promise(resolve => realTimeout(resolve, 0)); });
const click = async (host, text) => { await act(async () => [...host.querySelectorAll('button')].find(item => item.textContent.trim() === text).click()); await settle(); };
const fill = async (host, text) => act(async () => reactProps(host.querySelector('textarea')).onChange({ target: { value: text } }));
const labels = host => [...host.querySelectorAll('button')].map(item => item.textContent.trim());
// One fake backend: the state changes only when a decision is accepted.
function backend(options = {}) {
  const log = { gets: 0, posts: [], lists: 0 }; let state = options.view || view(); let listed = options.listed ?? [pending()];
  globalThis.fetch = async (url, init = {}) => {
    if (init.method === 'POST') {
      log.posts.push({ url, key: init.headers['Idempotency-Key'], body: JSON.parse(init.body) });
      if (options.post) return options.post(log, init);
      const decision = JSON.parse(init.body).decision;
      state = view({ state: { ...state.state, status: decision === 'APPROVE' ? 'READY' : 'SUSPENDED', revision: state.state.revision + 1, requestId: null }, request: null, capabilities: { ...state.capabilities, canDecide: false },
        lastDecision: { eventId: event, result: decision, decidedAt: now, decidedBy: { userId: staff, fullName: 'Legal Tran' }, reason: JSON.parse(init.body).reason } });
      listed = [];
      return json({ caseId: caseA, sessionId: sessionA, eventId: event, state: state.state, notification: { id: event, recipientWorkspace: 'STAFF', status: 'RECORDED' } });
    }
    if (url.includes('/reopen-requests?')) { log.lists++; return json(page(...listed)); }
    if (url.endsWith('/group-handover')) { log.gets++; return options.get ? options.get(url, init) : json(state); }
    if (url.endsWith('/distribution-workflow')) return options.workflow ? options.workflow(url) : json(workflow());
    return json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };
  return log;
}

test('Legal sees pending requests with business names only, opens one, and the decision form needs a reason', async () => {
  backend(); const navigation = [];
  const view_ = await mount({ caseId: '', onNavigate: path => navigation.push(path) });
  try {
    assert.match(view_.host.textContent, /HS-2026-000018/); assert.match(view_.host.textContent, /Kho Gia đình An/); assert.match(view_.host.textContent, /Present 2\/2 recipients/);
    assert.match(view_.host.textContent, /Staff Mai/); assert.equal(view_.host.querySelector('textarea'), null);
    assert.doesNotMatch(view_.host.textContent, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
    assert.ok(!labels(view_.host).some(text => /request reopening|create/i.test(text)), 'Legal must not be able to create a request');
    await click(view_.host, 'Review request');
    assert.equal(navigation.length, 1); assert.match(navigation[0], /^\/legal\/controlled-unlock\?/); assert.match(navigation[0], new RegExp(`caseId=${caseA}`));
  } finally { await view_.close(); }
});

test('selected case shows recipients, attendance and Staff reason; allow posts the exact decision, then the server state is re-read', async () => {
  const log = backend(); const v = await mount();
  try {
    await settle();
    assert.match(v.host.textContent, /Nguyễn An/); assert.match(v.host.textContent, /Trần Bình/); assert.match(v.host.textContent, /Đã đủ người, xin mở lại/);
    assert.doesNotMatch(v.host.textContent, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
    const allow = [...v.host.querySelectorAll('button')].find(item => item.textContent === 'Allow reopening');
    assert.equal(allow.disabled, true, 'a reason is mandatory');
    await fill(v.host, 'Đủ người, giấy tờ còn hiệu lực'); const gets = log.gets;
    await click(v.host, 'Allow reopening');
    assert.equal(log.posts.length, 1);
    assert.deepEqual(log.posts[0].body, { expectedRevision: 3, decision: 'APPROVE', reason: 'Đủ người, giấy tờ còn hiệu lực' });
    assert.match(log.posts[0].url, new RegExp(`${req}/decision$`));
    assert.ok(log.gets > gets, 'status is read again after the receipt');
    assert.match(v.host.textContent, /Reopening allowed/); assert.match(v.host.textContent, /notification for Staff has been recorded/);
    assert.match(v.host.textContent, /Latest Legal decision/); assert.equal(v.host.querySelector('textarea'), null, 'no second decision on the same request');
    assert.ok(!v.host.textContent.includes('delivered 3/3'));
  } finally { await v.close(); }
});

test('refusal sends REJECT and keeps the whole case suspended in the re-read state', async () => {
  const log = backend(); const v = await mount();
  try {
    await settle(); await fill(v.host, 'Thiếu giấy ủy quyền'); await click(v.host, 'Refuse reopening');
    assert.equal(log.posts[0].body.decision, 'REJECT'); assert.match(v.host.textContent, /Reopening refused/); assert.match(v.host.textContent, /The whole handover is suspended/);
  } finally { await v.close(); }
});

test('a double click sends one decision', async () => {
  let release; const log = backend({ post: () => new Promise(resolve => { release = () => resolve(json({ code: 'GROUP_HANDOVER_STALE' }, 409)); }) }); const v = await mount();
  try {
    await settle(); await fill(v.host, 'Một quyết định');
    const allow = [...v.host.querySelectorAll('button')].find(item => item.textContent === 'Allow reopening');
    await act(async () => { allow.click(); allow.click(); }); await settle();
    assert.equal(log.posts.length, 1); assert.equal(allow.disabled, true);
    await act(async () => release()); await settle();
  } finally { await v.close(); }
});

test('a stale request reports nothing saved, reloads, and never reuses the old key', async () => {
  const log = backend({ post: () => json({ code: 'GROUP_HANDOVER_BLOCKED' }, 409) }); const v = await mount();
  try {
    await settle(); await fill(v.host, 'Quyết định'); const gets = log.gets; await click(v.host, 'Allow reopening');
    assert.match(v.host.textContent, /Nothing was saved from this action/); assert.ok(log.gets > gets);
    await fill(v.host, 'Quyết định'); await click(v.host, 'Allow reopening');
    assert.equal(log.posts.length, 2); assert.notEqual(log.posts[0].key, log.posts[1].key);
  } finally { await v.close(); }
});

test('a lost connection keeps the draft, re-reads, and a retry reuses the same key', async () => {
  let attempts = 0; const log = backend({ post: () => { attempts++; throw new TypeError('offline'); } }); const v = await mount();
  try {
    await settle(); await fill(v.host, 'Giữ lại nội dung'); await click(v.host, 'Allow reopening');
    assert.match(v.host.textContent, /not known whether the decision was saved/); assert.equal(v.host.querySelector('textarea').value, 'Giữ lại nội dung');
    await click(v.host, 'Allow reopening');
    assert.equal(attempts, 2); assert.equal(log.posts[0].key, log.posts[1].key);
  } finally { await v.close(); }
});

test('a decision that never answers times out as an unknown outcome and is re-read', async () => {
  const log = backend({ post: (_log, init) => new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))) });
  const v = await mount();
  try {
    await settle(); await fill(v.host, 'Chờ phản hồi');
    globalThis.setTimeout = (fn, ms, ...args) => realTimeout(fn, ms === 20000 ? 0 : ms, ...args);
    const gets = log.gets; await click(v.host, 'Allow reopening'); await settle();
    assert.match(v.host.textContent, /not known whether the decision was saved/); assert.ok(log.gets > gets);
    assert.equal(v.host.querySelector('textarea').value, 'Chờ phản hồi');
  } finally { await v.close(); }
});

test('a request that is no longer decidable, or recipients without names, offer no decision', async () => {
  backend({ view: view({ capabilities: { ...view().capabilities, canDecide: false } }) });
  let v = await mount();
  try { await settle(); assert.equal(v.host.querySelector('textarea'), null); assert.match(v.host.textContent, /can no longer be decided/); } finally { await v.close(); }
  backend({ workflow: () => json(workflow(caseA, [{ beneficiaryId: rA, recipientName: 'Nguyễn An' }])) });
  v = await mount();
  try { await settle(); assert.equal(v.host.querySelector('textarea'), null); assert.match(v.host.textContent, /recipient list could not be confirmed/); assert.doesNotMatch(v.host.textContent, new RegExp(rB)); } finally { await v.close(); }
});

test('switching case aborts the previous read and its late answer is never shown', async () => {
  let finish, signal;
  backend({ listed: [pending(), pending({ requestId: req2, caseId: caseB, sessionId: sessionB, caseNumber: 'HS-2026-000019' })], get: (url, init) => {
    if (url.includes(caseA)) { signal = init.signal; return new Promise(resolve => { finish = resolve; }); }
    return json(view({ caseNumber: 'HS-2026-000019' }, caseB, sessionB));
  } });
  const v = await mount();
  try {
    await settle(); await v.render({ caseId: caseB }); await settle();
    assert.equal(signal.aborted, true); await act(async () => finish(json(view({ request: { ...view().request, reason: 'LATE ANSWER' } }))));
    assert.doesNotMatch(v.host.textContent, /LATE ANSWER/); assert.match(v.host.textContent, /HS-2026-000019/);
  } finally { await v.close(); }
});

test('401 asks to sign in again and an unavailable list is an error with retry, not an empty queue', async () => {
  let signIns = 0; backend({ listed: [] });
  globalThis.fetch = async () => json({ code: 'UNAUTHENTICATED' }, 401);
  let v = await mount({ onUnauthorized: () => { signIns++; } });
  try { await settle(); assert.ok(signIns >= 1); assert.ok(v.host.querySelector('[role=alert]')); assert.match(v.host.textContent, /Try again/); assert.doesNotMatch(v.host.textContent, /No reopening request/); } finally { await v.close(); }
  backend({ listed: [] });
  v = await mount({ caseId: '' });
  try { await settle(); assert.match(v.host.textContent, /No reopening request is waiting for Legal/); } finally { await v.close(); }
});
