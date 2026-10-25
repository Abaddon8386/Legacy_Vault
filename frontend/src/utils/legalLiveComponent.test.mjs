import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/death-verification' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/pages/legal/LegalLiveWorkflow.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Screen = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const digest = 'a'.repeat(64), now = '2026-10-20T06:00:00Z';
const session = { accessToken: 'synthetic-test-only', expiresAt: Date.now() + 3600000, user: { id: a, fullName: 'Legal Test', roles: ['LEGAL_VERIFIER'] } };
const queue = [{ caseId: a, label: 'Case A', deathDocumentIds: [a] }, { caseId: b, label: 'Case B', deathDocumentIds: [b] }];
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps'))];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const base = { session, lang: 'en', caseId: a, discovery: async () => queue, contextLoader: async caseId => ({ caseId, deathDocuments: [{ id: caseId }], capabilities: { approval: { allowed: false }, unlock: { allowed: false } } }) };
async function mount(options = base) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = async value => { await act(async () => root.render(React.createElement(Screen, value))); };
  await render(options);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const change = async (element, value) => act(async () => props(element).onChange({ target: { value } }));
const getSelect = (host, name) => [...host.querySelectorAll('label')].find(item => item.textContent.startsWith(name))?.querySelector('select');
const click = async (host, name) => act(async () => [...host.querySelectorAll('button')].find(item => item.textContent === name).click());
const submit = async host => act(async () => { props(host.querySelector('form')).onSubmit({ preventDefault() {} }); });
const detail = (id = a, changes = {}) => ({ deathDocumentPublicId: id, verificationCasePublicId: id, verificationCaseStatus: 'OPEN', vaultStatus: 'AWAITING_VERIFICATION', document: { issuingAuthority: 'Authority A', documentNumber: 'Doc A' }, decisions: [], ...changes });
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

test('Explicitly disabled discovery remains unavailable without requests or fabricated success', async () => {
  globalThis.fetch = async () => assert.fail('No discovery endpoint may be invented');
  const view = await mount({ ...base, discovery: null });
  try { assert.match(view.host.textContent, /case list is not available/); assert.equal(view.host.querySelector('select').disabled, true); assert.equal(view.host.querySelector('input'), null); assert.equal(view.host.querySelector('form'), null); }
  finally { await view.close(); }
});
test('Role guard does not discover or mutate for Staff/Owner/Admin or expired session', async () => {
  for (const next of [ ...['STAFF_EXECUTOR', 'VAULT_OWNER', 'ADMIN'].map(role => ({ ...session, user: { ...session.user, roles: [role] } })), { ...session, expiresAt: 0 } ]) {
    const view = await mount({ ...base, session: next, discovery: async () => assert.fail('No discovery') });
    try { assert.match(view.host.textContent, /do not have permission/); assert.equal(view.host.querySelector('form'), null); } finally { await view.close(); }
  }
});
test('Queue empty/error and invalid/cross-case discovery are not silently treated as ready', async () => {
  for (const discovery of [async () => [], async () => { throw { status: 403 }; }, async () => [{ caseId: 'bad' }]]) {
    const view = await mount({ ...base, discovery });
    try { assert.equal(view.host.querySelector('form'), null); assert.equal(view.host.querySelector('select').disabled, true); } finally { await view.close(); }
  }
});
test('Death decision requires selected server document; duplicate clicks locked, VI/EN draft kept and actual receipt shown', async () => {
  let writes = 0, finish, saved = false;
  globalThis.fetch = async (url, init) => init.method === 'POST' ? (writes++, new Promise(resolve => { finish = resolve; }))
    : url.endsWith('/attachments') ? json([]) : json(detail(a, saved ? { vaultStatus: 'DOCUMENT_VERIFICATION', decisions: [{ result: 'APPROVED', decidedAt: now }] } : {}));
  const view = await mount();
  try {
    assert.doesNotMatch(view.host.textContent, /Reload cases|Reload record|View latest status/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await change(getSelect(view.host, 'Death document'), a);
    await change(getSelect(view.host, 'Decision'), 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await view.render({ ...base, lang: 'vi' }); assert.equal(view.host.querySelector('textarea').value, 'Reviewed');
    await submit(view.host); await submit(view.host); assert.equal(writes, 1);
    await act(async () => { saved = true; finish(json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN', vaultStatus: 'DOCUMENT_VERIFICATION', result: 'APPROVED', verifierPublicId: a, decidedAt: now, reason: 'Reviewed' })); });
    assert.match(view.host.textContent, /Đã lưu quyết định/); assert.match(view.host.textContent, /Legal Test/); assert.match(view.host.textContent, /20\/10\/2026, 13:00/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    assert.doesNotMatch(view.host.textContent, /Xem trạng thái mới/);
  } finally { await view.close(); }
});
test('Already decided death document cannot be decided again', async () => {
  globalThis.fetch = async () => json(detail(a, { decisions: [{ result: 'REJECTED', decidedAt: now, reason: 'Old', verifierPublicId: a }] }));
  const view = await mount();
  try { await change(getSelect(view.host, 'Death document'), a); assert.equal(view.host.querySelector('button[type=submit]').disabled, true); assert.match(view.host.textContent, /Rejected|Reject/); }
  finally { await view.close(); }
});
test('Changing case aborts delayed document response and removes old draft/receipt', async () => {
  let finish, signal;
  globalThis.fetch = async (_url, init) => new Promise(resolve => { finish = resolve; signal = init.signal; });
  const view = await mount();
  try {
    await change(getSelect(view.host, 'Death document'), a);
    await view.render({ ...base, caseId: b }); assert.equal(signal.aborted, true);
    await act(async () => finish(json(detail())));
    assert.doesNotMatch(view.host.textContent, /Authority A/); assert.equal(getSelect(view.host, 'Death document').value, ''); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); }
});
test('409 and malformed response preserve draft but require reload before retry; unmount aborts mutation', async () => {
  let writes = 0, finish, signal;
  globalThis.fetch = async (_url, init) => init.method === 'POST' ? (++writes === 1 ? json({ code: 'LEGAL_VERIFICATION_ALREADY_DECIDED' }, 409) : new Promise(resolve => { finish = resolve; signal = init.signal; })) : json(detail());
  const view = await mount(); let closed = false;
  try {
    await change(getSelect(view.host, 'Death document'), a); await change(getSelect(view.host, 'Decision'), 'REJECT'); await change(view.host.querySelector('textarea'), 'Keep this reason');
    await submit(view.host); assert.equal(view.host.querySelector('textarea').value, 'Keep this reason'); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await click(view.host, 'Try again'); await submit(view.host); assert.equal(writes, 2);
    await view.close(); closed = true; assert.equal(signal.aborted, true); await act(async () => finish(json({})));
  } finally { if (!closed) await view.close(); }
});
test('Will picks original/version/hash from authorized overview, sends only contract fields', async () => {
  let body;
  globalThis.fetch = async (_url, init) => {
    if (init.method === 'POST') { body = JSON.parse(init.body); return json({ id: a, caseId: a, originalWillIntakeId: a, willId: a, version: 2, sha256: digest, result: 'MATCH', checkedBy: a, comparedAt: now }, 201); }
    return json({ caseId: a, vaultStatus: 'DOCUMENT_VERIFICATION', approvalBlocked: true, originalWillIntakes: [{ id: a, evidenceReference: 'Original paper' }], wills: [{ id: a, versions: [{ version: 2, sha256: digest }] }], comparisons: [] });
  };
  const view = await mount({ ...base, step: 'will-document-verification' });
  try {
    await change(getSelect(view.host, 'Original intake'), a); await change(getSelect(view.host, 'Digitized version'), `${a}:2`); await change(getSelect(view.host, 'Comparison result'), 'MATCH');
    await submit(view.host); assert.deepEqual(body, { originalWillIntakeId: a, willId: a, version: 2, result: 'MATCH', reason: '' }); assert.match(view.host.textContent, /Decision saved/);
  } finally { await view.close(); }
});
test('Blocked capability fixtures cannot approve or unlock after removing duplicate content navigation', async () => {
  globalThis.fetch = async () => assert.fail('Injected context should not trigger additional reads before a decision');
  for (const step of ['approval-review', 'controlled-unlock']) {
    const view = await mount({ ...base, step });
    try {
      assert.match(view.host.textContent, /does not currently meet/);
      assert.equal([...view.host.querySelectorAll('button')].find(item => item.disabled && /Record decision|Unlock vault/.test(item.textContent)).disabled, true);
      assert.equal(view.host.querySelector('h1').textContent, step === 'approval-review' ? 'Final approval' : 'Controlled unlock');
      assert.equal(view.host.querySelector('.lv-legal-process, .lv-legal-stages'), null);
      assert.ok(view.host.querySelector('.lv-legal-documents'));
      assert.ok(view.host.querySelector('.lv-legal-action-panel form'));
    } finally { await view.close(); }
  }
});

test('Saving automatically refreshes parent context and document while preserving the selected document and draft', async () => {
  let saved = false, contextReads = 0, documentReads = 0, finishContext;
  const context = () => ({ caseId: a, caseNumber: 'Case A', caseStatus: 'OPEN',
    vaultStatus: saved ? 'DOCUMENT_VERIFICATION' : 'AWAITING_VERIFICATION', deathDocuments: [{ id: a }], capabilities: {} });
  const decision = { result: 'APPROVED', decidedAt: now, reason: 'Reviewed', verifierPublicId: a };
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      saved = true;
      return json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN',
        vaultStatus: 'DOCUMENT_VERIFICATION', ...decision });
    }
    if (url.endsWith('/attachments')) return json([]);
    documentReads++;
    return json(detail(a, saved ? { vaultStatus: 'DOCUMENT_VERIFICATION', decisions: [decision] } : {}));
  };
  const contextLoader = async () => ++contextReads === 1 ? context() : new Promise(resolve => { finishContext = resolve; });
  const view = await mount({ ...base, contextLoader });
  try {
    await change(getSelect(view.host, 'Death document'), a);
    await change(getSelect(view.host, 'Decision'), 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await submit(view.host);
    const previousReads = documentReads;
    assert.equal(contextReads, 2, 'The refresh must read the parent case context, not only the document');
    assert.equal(view.host.querySelector('.lv-legal-case-banner'), null, 'Old status must disappear while revalidating');
    assert.equal(view.host.querySelector('form'), null, 'No decision may be submitted during context revalidation');
    await act(async () => finishContext(context()));
    assert.match(view.host.querySelector('.lv-legal-case-status').textContent, /Document verification/);
    assert.equal(getSelect(view.host, 'Death document').value, a);
    assert.equal(view.host.querySelector('textarea').value, 'Reviewed');
    assert.equal(documentReads, previousReads + 1);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    assert.match(view.host.textContent, /Decision saved/);
    assert.doesNotMatch(view.host.textContent, /Checking the latest case/);
  } finally { await view.close(); }
});

for (const status of [403, 500]) test(`Retry revalidates parent context and hides old status/actions on HTTP ${status}`, async () => {
  let contextReads = 0;
  const contextLoader = async () => {
    if (++contextReads > 1) throw Object.assign(new Error('Context refresh failed'), { status });
    return { caseId: a, caseNumber: 'Case A', caseStatus: 'OPEN', vaultStatus: 'AWAITING_VERIFICATION', deathDocuments: [{ id: a }], capabilities: {} };
  };
  globalThis.fetch = async () => json({ code: 'READ_FAILED' }, 500);
  const view = await mount({ ...base, contextLoader });
  try {
    await change(getSelect(view.host, 'Death document'), a);
    await click(view.host, 'Try again');
    assert.equal(contextReads, 2);
    assert.equal(view.host.querySelector('.lv-legal-case-banner'), null);
    assert.equal(view.host.querySelector('form'), null);
    assert.ok(view.host.querySelector('[role=alert]'));
  } finally { await view.close(); }
});

test('Missing original will shows the next step instead of an empty intake selector; archived cases remain read-only', async () => {
  globalThis.fetch = async (_url, init) => {
    assert.equal(init.method, 'GET');
    return json({ caseId: a, vaultStatus: 'DOCUMENT_VERIFICATION', approvalBlocked: true, originalWillIntakes: [], wills: [], comparisons: [] });
  };
  const view = await mount({ ...base, step: 'will-document-verification' });
  try {
    assert.match(view.host.textContent, /No original paper will has been received/);
    assert.match(view.host.textContent, /Staff must record the original paper will/);
    assert.equal(getSelect(view.host, 'Original intake'), undefined);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await view.render({ ...base, step: 'will-document-verification', lang: 'vi', contextLoader: async caseId => ({
      caseId, caseStatus: 'CLOSED', vaultStatus: 'ARCHIVED', deathDocuments: [], capabilities: {},
    }) });
    assert.match(view.host.textContent, /chưa có di chúc bản cứng được tiếp nhận/);
    assert.doesNotMatch(view.host.textContent, /Nhân viên cần ghi nhận tiếp nhận/);
    assert.equal(getSelect(view.host, 'Bản gốc đã tiếp nhận'), undefined);
    assert.equal(view.host.querySelector('form'), null);
  } finally { await view.close(); }
});

const makeDossier = (route = 'COURT') => ({ id: a, caseId: a, route, status: 'LEGAL_BASIS_FORWARDED', disputeStatus: 'NONE', requiredVersion: 1,
  versions: [{ version: 1, sha256: digest, forwardStatus: 'FORWARDED', documentNumber: 'Basis 1' }], classifiedBy: a });
for (const route of ['COURT', 'ON_HOLD']) test(`Classification ${route} sends only route/reason and uses a real receipt`, async () => {
  let body;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { body = JSON.parse(init.body); return json({ ...makeDossier(route), status: 'DRAFT' }, 201); }
    return url.endsWith('will-comparisons') ? json({ caseId: a, vaultStatus: 'WILL_VERIFICATION', approvalBlocked: false, originalWillIntakes: [], wills: [], comparisons: [] }) : json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };
  const view = await mount({ ...base, step: 'basis-route-selection' });
  try { await change(getSelect(view.host, 'Legal basis'), route); await change(view.host.querySelector('textarea'), 'Reason'); await submit(view.host);
    assert.deepEqual(body, { route, routeReason: 'Reason' }); assert.match(view.host.textContent, /Decision saved/); }
  finally { await view.close(); }
});
for (const action of ['review', 'request-supplementation', 'court', 'hold']) test(`Dossier ${action} uses its separate mutation; no implicit final approval`, async () => {
  let destination, body;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      destination = url; body = JSON.parse(init.body);
      if (action === 'hold') return json({ ...makeDossier('ON_HOLD'), status: 'DRAFT', requiredVersion: 2 });
      if (action === 'court') return json({ id: a, caseId: a, version: 1, sha256: digest, result: 'VALID', reviewedBy: a, reviewedAt: now }, 201);
      return json({ dossierId: a, reviewStatus: action === 'review' ? 'FRESH' : 'REVIEW_REQUIRED', reviewRequired: action !== 'review', checkedAt: now,
        currentVersionNo: 1, currentSha256Hash: digest, currentAllocationHash: digest, currentDisputeStatus: 'NONE' });
    }
    if (url.endsWith('/context')) return json({ caseId: a, basisDossier: makeDossier('COURT'), snapshot: { dossierId: a, currentVersion: 1, sha256Hash: digest, allocationHash: digest, disputeStatus: 'NONE' } });
    if (url.endsWith('court-decisions')) return json([]);
    if (url.endsWith('will-comparisons')) return json({ caseId: a, vaultStatus: 'LEGAL_BASIS_VERIFICATION', approvalBlocked: false, originalWillIntakes: [], wills: [], comparisons: [] });
    return json(makeDossier('COURT'));
  };
  const view = await mount({ ...base, step: 'dossier-review' });
  try {
    await change(getSelect(view.host, 'Action'), action);
    if (action === 'hold') await change(getSelect(view.host, 'Cause'), 'NEW_DISPUTE');
    if (action === 'court') await change(getSelect(view.host, 'Court decision result'), 'VALID');
    await change(view.host.querySelector('textarea'), 'Reviewed'); await submit(view.host);
    assert.ok(destination.endsWith(action === 'court' ? '/court-decisions' : `/${action}`)); assert.equal(body.reason, 'Reviewed');
    assert.doesNotMatch(destination, /\/decision$|\/unlock$/); assert.match(view.host.textContent, /Decision saved/);
  } finally { await view.close(); }
});
test('BE-02 account linking during review does not invalidate the Legal allocation scope', async () => {
  let writes = 0;
  const dossier = linked => ({ ...makeDossier(), versions: [{ ...makeDossier().versions[0], allocations: [{ assetId: a, beneficiaryId: b, description: 'Court allocation', recipientSource: 'COURT_DOCUMENT', sourceVersionNo: 1, accountLinked: linked }] }] });
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') {
      writes++; assert.ok(url.endsWith('/review'));
      return json({ dossierId: a, reviewStatus: 'FRESH', reviewRequired: false, checkedAt: now, currentVersionNo: 1, currentSha256Hash: digest, currentAllocationHash: digest, currentDisputeStatus: 'NONE' });
    }
    if (url.endsWith('/context')) return json({ caseId: a, basisDossier: dossier(false), snapshot: { dossierId: a, currentVersion: 1, sha256Hash: digest, allocationHash: digest, disputeStatus: 'NONE' } });
    if (url.endsWith('/court-decisions')) return json([]);
    if (url.endsWith('/will-comparisons')) return json({ caseId: a, vaultStatus: 'LEGAL_BASIS_VERIFICATION', approvalBlocked: false, originalWillIntakes: [], wills: [], comparisons: [] });
    return json(dossier(true));
  };
  const view = await mount({ ...base, step: 'dossier-review' });
  try {
    await change(getSelect(view.host, 'Action'), 'review'); await change(view.host.querySelector('textarea'), 'Reviewed allocation');
    await submit(view.host); assert.equal(writes, 1); assert.match(view.host.textContent, /Decision saved/);
  } finally { await view.close(); }
});

test('Dossier changed since display blocks POST and retains reason; ON_HOLD/not-forwarded cannot review', async () => {
  let loads = 0;
  globalThis.fetch = async (url, init) => {
    assert.notEqual(init.method, 'POST');
    if (url.endsWith('will-comparisons')) return json({ caseId: a, vaultStatus: 'LEGAL_BASIS_VERIFICATION', approvalBlocked: false, originalWillIntakes: [], wills: [], comparisons: [] });
    if (url.endsWith('court-decisions')) return json([]);
    if (url.endsWith('/context')) { const basisDossier = ++loads === 1 ? makeDossier() : { ...makeDossier(), route: 'ON_HOLD', status: 'DRAFT' }; return json({ caseId: a, basisDossier, snapshot: { dossierId: a, currentVersion: 1, sha256Hash: digest, allocationHash: digest, disputeStatus: 'NONE' } }); }
    return json(++loads === 1 ? makeDossier() : { ...makeDossier(), route: 'ON_HOLD', status: 'DRAFT' });
  };
  const view = await mount({ ...base, step: 'dossier-review' });
  try {
    await change(getSelect(view.host, 'Action'), 'review'); await change(view.host.querySelector('textarea'), 'Keep'); await submit(view.host);
    assert.match(view.host.textContent, /record changed/); assert.equal(view.host.querySelector('textarea').value, 'Keep');
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await click(view.host, 'Try again'); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); }
});

for (const failure of [403, 404, 500, 'network', 'invalid']) test(`Discovery revalidation ${failure}: removes old case before completion and stays locked on failure`, async () => {
  let writes = 0, finish, reads = 0;
  globalThis.fetch = async (_url, init) => { if (init.method === 'POST') writes++; return json(detail()); };
  const view = await mount();
  try {
    await change(getSelect(view.host, 'Death document'), a);
    await change(getSelect(view.host, 'Decision'), 'APPROVE'); await change(view.host.querySelector('textarea'), 'Old case draft');
    assert.equal(view.host.querySelector('button[type=submit]').disabled, false);
    const discovery = () => { reads++; return new Promise((resolve, reject) => { finish = { resolve, reject }; }); };
    await view.render({ ...base, discovery });
    assert.match(view.host.textContent, /Loading cases/);
    assert.equal(view.host.querySelector('form'), null, 'Pending permission verification must unmount the old form');
    assert.equal(view.host.querySelector('select').disabled, true); assert.doesNotMatch(view.host.textContent, /Authority A/);
    await act(async () => {
      if (failure === 'invalid') finish.resolve([{ caseId: 'invalid' }]);
      else finish.reject(failure === 'network' ? new Error('network') : Object.assign(new Error('failed'), { status: failure }));
    });
    assert.ok(view.host.querySelector('[role=alert]')); assert.equal(view.host.querySelector('form'), null);
    assert.equal(view.host.querySelector('select').disabled, true); assert.equal(writes, 0);
    await click(view.host, 'Retry');
    assert.equal(view.host.querySelector('form'), null, 'Retry must stay locked until successful authorization');
    assert.equal(view.host.querySelector('select').disabled, true);
    await act(async () => finish.resolve(queue));
    assert.equal(reads, 2); assert.ok(view.host.querySelector('form'));
    assert.equal(view.host.querySelector('textarea').value, '', 'Old draft must not survive revoked/unknown authorization');
    assert.equal(getSelect(view.host, 'Death document').value, ''); assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); }
});
test('Session revalidation aborts pending decision and late success cannot restore private case after 403', async () => {
  let finishWrite, signal, finishQueue;
  globalThis.fetch = async (_url, init) => init.method === 'POST' ? new Promise(resolve => { finishWrite = resolve; signal = init.signal; }) : json(detail());
  const discovery = async ({ accessToken }) => accessToken === session.accessToken ? queue : new Promise((_resolve, reject) => { finishQueue = reject; });
  const view = await mount({ ...base, discovery });
  try {
    await change(getSelect(view.host, 'Death document'), a); await change(getSelect(view.host, 'Decision'), 'APPROVE'); await change(view.host.querySelector('textarea'), 'Reviewed');
    await submit(view.host); assert.ok(signal); assert.equal(signal.aborted, false);
    await view.render({ ...base, discovery, session: { ...session, accessToken: 'new-token' } });
    assert.equal(signal.aborted, true); assert.equal(view.host.querySelector('form'), null);
    await act(async () => finishQueue(Object.assign(new Error('denied'), { status: 403 })));
    await act(async () => finishWrite(json({ deathDocumentPublicId: a, verificationCasePublicId: a, verificationCaseStatus: 'OPEN', vaultStatus: 'DOCUMENT_VERIFICATION', result: 'APPROVED', verifierPublicId: a, decidedAt: now, reason: 'Reviewed' })));
    assert.ok(view.host.querySelector('[role=alert]')); assert.equal(view.host.querySelector('form'), null); assert.doesNotMatch(view.host.textContent, /Decision saved|Authority A/);
  } finally { await view.close(); }
});
test('Removing discovery while case is open clears the old case and disables selection immediately', async () => {
  globalThis.fetch = async () => json(detail());
  const view = await mount();
  try { await change(getSelect(view.host, 'Death document'), a); await view.render({ ...base, discovery: null });
    assert.equal(view.host.querySelector('form'), null); assert.equal(view.host.querySelector('select').disabled, true); assert.doesNotMatch(view.host.textContent, /Authority A/); }
  finally { await view.close(); }
});
