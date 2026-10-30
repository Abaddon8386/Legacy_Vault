import { distributionFixture } from './testFixtures/distribution.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import * as api from '../pages/legal/legalLiveService.js';
import { createSession, storeSession } from './session.js';
import { LEGAL_NAVIGATION_REGISTRY, legalStepTitle } from './legalNavigation.js';

// Isolated HTTP fixtures only: never imported by the application or used as real legal evidence.
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const sha = 'a'.repeat(64), allocation = 'b'.repeat(64), now = '2026-10-21T10:00:00Z';
const user = { id: a, fullName: 'Legal fixture', email: 'legal@example.test', roles: ['LEGAL_VERIFIER'] };
const session = { accessToken: 'fixture-token', expiresAt: Date.now() + 3600000, user };
function contextFixture(caseId = a, approved = false) {
  return { caseId, caseNumber: 'CASE-' + (caseId === a ? 'A' : 'B'), vaultId: b, caseStatus: 'OPEN', vaultStatus: 'LEGAL_BASIS_VERIFICATION',
    deathDocuments: [{ id: caseId, documentType: 'DEATH_CERTIFICATE', receivedAt: now }],
    willComparison: { caseId, vaultStatus: 'LEGAL_BASIS_VERIFICATION', approvalBlocked: false, latestResult:'MATCH', originalWillIntakes: [], wills: [], comparisons: [] },
    basisDossier: { id: a, caseId, route: 'COURT', status: 'LEGAL_BASIS_FORWARDED', disputeStatus: 'NONE', requiredVersion: 1,
      versions: [{ version: 1, sha256: sha, forwardStatus: 'FORWARDED' }] },
    snapshot: { dossierId: a, currentVersion: 1, requiredVersion: 1, sha256Hash: sha, allocationHash: allocation, disputeStatus: 'NONE',
      reviewStatus: 'FRESH', reviewFresh: true, approvalCurrent: approved, latestDecision: null, courtResult: 'VALID' },
    capabilities: { approval: { allowed: true, blockedReason: null }, unlock: { allowed: approved, blockedReason: approved ? null : 'LEGAL_APPROVAL_REQUIRED' } }, evaluatedAt: now };
}
function pageFixture(page = 0) {
  const caseId = page ? b : a;
  return { content: [{ caseId, caseNumber: page ? 'CASE-B' : 'CASE-A', vaultId: b, caseStatus: 'OPEN', vaultStatus: 'LEGAL_BASIS_VERIFICATION',
    route: 'COURT', dossierStatus: 'LEGAL_BASIS_FORWARDED', reviewStatus: 'FRESH', openedAt: now }], page, size: 20, totalElements: 21, totalPages: 2 };
}
const options = { accessToken: session.accessToken, roles: user.roles, lang: 'en' };
const c = '33333333-3333-4333-8333-333333333333';
function courtContext(caseId = a, approved = false) {
  const value = contextFixture(caseId, approved);
  value.basisDossier.requiredVersion = value.snapshot.requiredVersion = value.snapshot.currentVersion = 2;
  value.basisDossier.versions = [
    { version: 1, sha256: sha, forwardStatus: 'FORWARDED', documentNumber: 'Old decision', allocations: [{ assetId: a, beneficiaryId: b, description: 'Old B allocation', assetName: 'Old asset', recipientName: 'Recipient B', recipientSource: 'OWNER_DESIGNATED', sourceVersionNo: null, accountLinked: true }] },
    { version: 2, sha256: sha, forwardStatus: 'FORWARDED', documentNumber: 'Court decision 25/2026', allocations: [
      { assetId: a, beneficiaryId: a, description: 'A receives the archive', assetName: 'Family archive', assetType: 'TEXT', recipientName: 'Recipient A', recipientSource: 'OWNER_DESIGNATED', sourceVersionNo: null, accountLinked: true },
      { assetId: b, beneficiaryId: c, description: 'C receives the account', assetName: 'Cloud account', assetType: 'CREDENTIAL', recipientName: 'Recipient C', recipientSource: 'COURT_DOCUMENT', sourceVersionNo: 2, accountLinked: false },
    ] },
  ];
  return value;
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/approval-review' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; storeSession(null); });
async function component(entry) {
  const built = await build({ configFile: false, logLevel: 'silent', define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Screen = await component('src/pages/legal/LegalLiveWorkflow.jsx');
const base = { session, lang: 'en', caseId: a, step: 'approval-review' };
async function mount(props = base, Component = Screen) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = async next => act(async () => root.render(React.createElement(Component, next)));
  await render(props);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const change = (element, value) => act(async () => {
  element[Object.keys(element).find(key => key.startsWith('__reactProps'))].onChange({ target: { value, checked: value } });
  const reason=element.closest('form')?.querySelector('textarea');
  if(value==='APPROVE'&&reason&&!reason.value)reason[Object.keys(reason).find(key=>key.startsWith('__reactProps'))].onChange({target:{value:'Reviewed scope'}});
});
const submit = async host => {
  await act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
  const confirm = host.querySelector('[data-legal-confirm]');
  if (confirm) await act(async () => confirm.click());
};
const click = (host, text) => act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === text).click());
function transport(readContext = () => contextFixture(), write = () => assert.fail('Unexpected mutation')) {
  let latestContext;
  return async (url, init) => {
    if (url.endsWith('/auth/me')) return json(user);
    if (init.method === 'POST') return write(url, init);
    if (url.endsWith('/context')) { const response = await readContext(url, init); if (response.ok) latestContext = await response.clone().json(); return response; }
    if (url.endsWith('/distribution-workflow')) return json(distributionFixture(latestContext));
    if (url.includes('verification-cases?')) return json(pageFixture(Number(new URL(url, 'http://local').searchParams.get('page'))));
    assert.fail('Unexpected endpoint: ' + url);
  };
}

test('PS-102 queue uses Legal endpoint, paging and headers; invalid envelopes fail closed', async () => {
  let url;
  const result = await api.loadLegalQueue({ ...options, page: 1, route: 'COURT', fetchFn: async (target, init) => {
    url = target; assert.equal(init.headers.Authorization, 'Bearer fixture-token'); assert.equal(init.headers['Accept-Language'], 'en'); return json(pageFixture(1));
  } });
  assert.match(url, /page=1&size=20&route=COURT/); assert.equal(result.items[0].caseId, b);
  for (const value of [{}, [], { ...pageFixture(), content: [{ caseId: a }] }, { ...pageFixture(), totalPages: 9 }])
    await assert.rejects(api.loadLegalQueue({ ...options, fetchFn: async () => json(value) }), { code: 'INVALID_RESPONSE' });
});

test('PS-102 context validates case, document references, snapshot hashes and capabilities', async () => {
  assert.equal((await api.loadLegalContext(a, { ...options, fetchFn: async () => json(contextFixture()) })).snapshot.allocationHash, allocation);
  for (const alter of [value => { value.caseId = b; }, value => { value.snapshot.sha256Hash = allocation; },
    value => { value.capabilities.approval.allowed = 'true'; }, value => { value.basisDossier.route = 'UNAPPROVED'; },
    value => { value.deathDocuments = [{ id: 'internal-id' }]; }, value => { value.snapshot = null; }]) {
    const value = contextFixture(); alter(value);
    await assert.rejects(api.loadLegalContext(a, { ...options, fetchFn: async () => json(value) }), { code: 'INVALID_RESPONSE' });
  }
});

test('BE-02 metadata is validated without requiring an account link or breaking legacy allocations', async () => {
  const value = courtContext();
  const actual = await api.loadLegalContext(a, { ...options, fetchFn: async () => json(value) });
  assert.equal(actual.basisDossier.versions[1].allocations[1].accountLinked, false);
  assert.equal(actual.capabilities.approval.allowed, true);
  for (const [field, wrong] of [['assetName', {}], ['recipientName', []], ['accountLinked', 'false'], ['recipientSource', 'INTERNAL_ONLY'], ['sourceVersionNo', 0]]) {
    const bad = courtContext(); bad.basisDossier.versions[1].allocations[1][field] = wrong;
    await assert.rejects(api.loadLegalContext(a, { ...options, fetchFn: async () => json(bad) }), { code: 'INVALID_RESPONSE' });
  }
  const legacy = contextFixture(); legacy.basisDossier.versions[0].allocations = [{ assetId: a, beneficiaryId: b, description: null }];
  assert.equal((await api.loadLegalContext(a, { ...options, fetchFn: async () => json(legacy) })).basisDossier.versions[0].allocations.length, 1);
});

for (const lang of ['vi', 'en']) test(`BE-02 displays current A/C allocations and approves C without an account (${lang})`, async () => {
  let writes = 0, body;
  globalThis.fetch = transport(() => json(courtContext(a, writes > 0)), (url, init) => {
    assert.ok(url.endsWith('/basis-dossier/decision')); writes++; body = JSON.parse(init.body);
    return json({ dossierId: a, decision: 'LEGAL_APPROVED', versionNo: 2, sha256Hash: sha, allocationHash: allocation, decidedBy: a, decidedAt: now, notification: { id: a, recipientWorkspace: 'STAFF', status: 'RECORDED' } });
  });
  const view = await mount({ ...base, lang });
  try {
    const table = view.host.querySelector('table');
    assert.match(table.textContent, /Family archive/); assert.match(table.textContent, /Cloud account/);
    assert.match(table.textContent, /Recipient A/); assert.match(table.textContent, /Recipient C/);
    assert.equal(table.querySelector('code, details'), null);
    for (const internal of [a, b, c, sha, allocation]) assert.equal(view.host.textContent.includes(internal), false);
    assert.doesNotMatch(view.host.textContent, /Technical details|Chi tiết kỹ thuật|Checksum|Mã kiểm tra|SHA-256/);
    assert.doesNotMatch(view.host.textContent, /Old B allocation|Recipient B|Old decision/);
    assert.match(table.textContent, lang === 'en' ? /Court document/ : /Từ văn bản Tòa án/);
    assert.match(table.textContent, lang === 'en' ? /Named in version 2/ : /Ghi nhận từ phiên bản 2/);
    assert.match(table.textContent, lang === 'en' ? /Account not linked/ : /Chưa liên kết tài khoản/);
    await change(view.host.querySelector('form select'), 'APPROVE');
    assert.equal(view.host.querySelector('[type=submit]').disabled, false);
    await submit(view.host);
    assert.equal(writes, 1);
    assert.deepEqual(body, { decision: 'APPROVE', reason: 'Reviewed scope', versionNo: 2, sha256Hash: sha, allocationHash: allocation });
    assert.ok(view.host.querySelector('a[href*="controlled-unlock"]'), 'Next action is navigation; approval must never submit unlock');
    assert.match(view.host.textContent, lang === 'en' ? /notification has been sent to Staff/ : /Đã gửi thông báo cho Nhân viên/);
  } finally { await view.close(); }
});

for (const status of [401, 403, 404, 500]) test(`post-save context HTTP ${status} hides old actions and handles the saved receipt correctly`, async () => {
  let reads = 0, writes = 0;
  globalThis.fetch = transport(() => ++reads === 3 ? json({ code: 'READ_FAILED' }, status) : json(courtContext(a, writes > 0)), (_url, init) => {
    writes++; const body = JSON.parse(init.body);
    return json({ dossierId: a, decision: 'LEGAL_APPROVED', versionNo: body.versionNo, sha256Hash: sha, allocationHash: allocation, decidedBy: a, decidedAt: now });
  });
  const view = await mount();
  try {
    await change(view.host.querySelector('form select'), 'APPROVE'); await submit(view.host);
    assert.equal(writes, 1); assert.ok(view.host.querySelector('[role=alert]'));
    assert.equal(view.host.querySelector('form'), null); assert.equal(view.host.querySelector('table'), null);
    if (status !== 500) assert.doesNotMatch(view.host.textContent, /Decision saved|Recipient C/);
    else {
      assert.match(view.host.textContent, /Saved successfully/);
      await click(view.host, 'Retry');
      assert.ok(view.host.querySelector('table')); assert.equal(writes, 1);
      assert.equal(view.host.querySelector('[type=submit]').disabled, true);
    }
  } finally { await view.close(); }
});

test('a final-decision draft survives reloading a conflict but is discarded when the case changes', async () => {
  globalThis.fetch = transport(url => json(courtContext(url.includes(b) ? b : a)), () => json({ code: 'LEGAL_DECISION_STALE' }, 409));
  const view = await mount();
  try {
    await change(view.host.querySelector('form select'), 'REJECT'); await change(view.host.querySelector('textarea'), 'Keep this reason');
    await submit(view.host); await click(view.host, 'Try again');
    assert.equal(view.host.querySelector('textarea').value, 'Keep this reason'); assert.equal(view.host.querySelector('form select').value, 'REJECT');
    await view.render({ ...base, caseId: b });
    assert.equal(view.host.querySelector('textarea').value, ''); assert.equal(view.host.querySelector('form select').value, '');
  } finally { await view.close(); }
});

for (const decision of ['APPROVE', 'REJECT']) test(`final ${decision} reads context again and submits the displayed snapshot only`, async () => {
  let reads = 0, writes = 0, body;
  globalThis.fetch = transport(() => { reads++; return json(contextFixture()); }, (url, init) => {
    writes++; assert.ok(url.endsWith('/basis-dossier/decision')); body = JSON.parse(init.body);
    return json({ dossierId: a, decision: decision === 'APPROVE' ? 'LEGAL_APPROVED' : 'LEGAL_REJECTED', versionNo: 1,
      sha256Hash: sha, allocationHash: allocation, decidedBy: a, decidedAt: now });
  });
  const view = await mount();
  try {
    await change(view.host.querySelector('form select'), decision);
    if (decision === 'REJECT') assert.equal(view.host.querySelector('[type=submit]').disabled, true);
    await change(view.host.querySelector('textarea'), 'Reviewed scope');
    await submit(view.host); await submit(view.host);
    assert.equal(reads, 3); assert.equal(writes, 1);
    assert.deepEqual(body, { decision, versionNo: 1, sha256Hash: sha, allocationHash: allocation, reason: 'Reviewed scope' });
    assert.match(view.host.textContent, /Decision saved|Case approved|Case approval rejected|Vault unlocked/); assert.equal(view.host.querySelector('[type=submit]').disabled, true);
    assert.equal(view.host.querySelector('form select').value, '', 'A saved decision must require a new explicit selection');
  } finally { await view.close(); }
});

for (const field of ['allocationHash', 'sha256Hash', 'disputeStatus', 'courtResult']) test(`changed ${field} prevents POST and requires reload`, async () => {
  let reads = 0, writes = 0;
  globalThis.fetch = transport(() => {
    const value = contextFixture();
    if (++reads > 1) {
      value.snapshot[field] = field.includes('Hash') ? 'c'.repeat(64) : field === 'courtResult' ? 'INVALID' : 'DISPUTED';
      if (field === 'sha256Hash') value.basisDossier.versions[0].sha256 = value.snapshot[field];
      if (field === 'disputeStatus') value.basisDossier.disputeStatus = 'DISPUTED';
      if (field === 'courtResult') value.capabilities.approval = { allowed: false, blockedReason: 'COURT_DECISION_REQUIRED' };
    }
    return json(value);
  }, () => { writes++; return json({}); });
  const view = await mount();
  try { await change(view.host.querySelector('form select'), 'APPROVE'); await submit(view.host);
    assert.equal(writes, 0); assert.match(view.host.textContent, /record changed/); assert.equal(view.host.querySelector('[type=submit]').disabled, true);
  } finally { await view.close(); }
});

test('controlled unlock is a separate confirmed request, never implicit after approval', async () => {
  let writes = 0;
  globalThis.fetch = transport(() => json(contextFixture(a, true)), (url, init) => {
    writes++; assert.ok(url.endsWith('/unlock')); assert.equal(init.body, undefined);
    return json({ caseId: a, vaultId: b, status: 'UNLOCKED', unlockedBy: a, unlockedAt: now });
  });
  const view = await mount({ ...base, step: 'controlled-unlock' });
  try { assert.equal(view.host.querySelector('[type=submit]').disabled, true);
    await change(view.host.querySelector('[type=checkbox]'), true); await submit(view.host); await submit(view.host);
    assert.equal(writes, 1); assert.match(view.host.textContent, /Decision saved|Case approved|Case approval rejected|Vault unlocked/);
  } finally { await view.close(); }
});

test('final decision opens a consequence summary and cancelling sends no request', async () => {
  let writes = 0;
  globalThis.fetch = transport(() => json(contextFixture()), () => { writes++; return json({}); });
  const view = await mount();
  try {
    await change(view.host.querySelector('form select'), 'REJECT');
    await change(view.host.querySelector('textarea'), 'Documents incomplete');
    await act(async () => view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(writes, 0);
    assert.match(view.host.querySelector('[role=dialog]').textContent, /Rejecting blocks this version/);
    assert.match(view.host.querySelector('[role=dialog]').textContent, /Documents incomplete/);
    await click(view.host, 'Go back');
    assert.equal(Boolean(view.host.querySelector('[role=dialog]')), false);
    assert.equal(view.host.querySelector('textarea').value, 'Documents incomplete');
    assert.equal(writes, 0);
  } finally { await view.close(); }
});

for (const caseStatus of ['CLOSED', 'CANCELLED']) test(`${caseStatus} Legal context hides editing while preserving readable case information`, async () => {
  const value = contextFixture(); value.caseStatus = caseStatus;
  value.capabilities = { approval: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' }, unlock: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' } };
  globalThis.fetch = transport(() => json(value));
  const view = await mount();
  try {
    assert.equal(Boolean(view.host.querySelector('form')), false);
    assert.match(view.host.textContent, /reference only/);
    assert.match(view.host.textContent, /CASE-A/);
    assert.equal(view.host.querySelector('.lv-legal-technical'), null);
    assert.equal(view.host.querySelector('.lv-legal-facts').textContent.includes('LEGAL_BASIS_VERIFICATION'), false);
    const badge = view.host.querySelector('.lv-legal-case-status');
    assert.equal(badge.textContent, caseStatus === 'CANCELLED' ? 'Verification cancelled' : 'Closed');
    assert.ok(badge.classList.contains('is-neutral'));
  } finally { await view.close(); }
});

for (const status of [403, 409, 500]) test(`mutation HTTP ${status} cannot show success or permit blind retry`, async () => {
  globalThis.fetch = transport(() => json(contextFixture()), () => json({ code: 'CONFLICT' }, status));
  const view = await mount();
  try { await change(view.host.querySelector('form select'), 'APPROVE'); await submit(view.host);
    assert.ok(view.host.querySelector('[role=alert]')); assert.doesNotMatch(view.host.textContent, /Decision saved|Case approved|Case approval rejected|Vault unlocked/);
    if (status === 403) assert.equal(view.host.querySelector('form'), null);
    else assert.equal(view.host.querySelector('[type=submit]').disabled, true);
  } finally { await view.close(); }
});

test('a pending context for a previous case is aborted and cannot populate the new case', async () => {
  let resolveOld, signal;
  globalThis.fetch = transport((url, init) => url.includes('/' + a + '/') ? new Promise(resolve => { resolveOld = resolve; signal = init.signal; }) : json(contextFixture(b)));
  const view = await mount();
  try { await view.render({ ...base, caseId: b }); assert.equal(signal.aborted, true);
    await act(async () => resolveOld(json(contextFixture())));
    assert.match(view.host.textContent, /CASE-B/); assert.doesNotMatch(view.host.querySelector('form').textContent, /CASE-A/);
  } finally { await view.close(); }
});

test('queue revalidation after a token change removes active forms and pending receipts on 403', async () => {
  let deny = false, finish, signal;
  const fetch = transport(() => json(contextFixture()), (_url, init) => new Promise(resolve => { finish = resolve; signal = init.signal; }));
  globalThis.fetch = (url, init) => deny && url.includes('verification-cases?') ? json({ code: 'ACCESS_DENIED' }, 403) : fetch(url, init);
  const view = await mount();
  try { await change(view.host.querySelector('form select'), 'APPROVE'); await submit(view.host);
    deny = true; await view.render({ ...base, session: { ...session, accessToken: 'rotated-fixture-token' } }); assert.equal(signal.aborted, true);
    await act(async () => finish(json({}))); assert.equal(view.host.querySelector('form'), null);
    assert.ok(view.host.querySelector('[role=alert]')); assert.doesNotMatch(view.host.textContent, /Decision saved|Case approved|Case approval rejected|Vault unlocked/);
  } finally { await view.close(); }
});

test('legacy NOTARIAL and missing dossier remain read-only with no fabricated eligibility', async () => {
  for (const legacy of [true, false]) {
    const value = contextFixture(); value.capabilities = { approval: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' }, unlock: { allowed: false, blockedReason: 'BASIS_DOSSIER_INVALID_STATE' } };
    if (legacy) value.basisDossier.route = 'NOTARIAL'; else { value.basisDossier = null; value.snapshot = null; }
    globalThis.fetch = transport(() => json(value));
    const view = await mount();
    try { assert.equal(view.host.querySelector('[type=submit]')?.disabled ?? true, true); } finally { await view.close(); }
  }
});

test('actual App Legal route uses default queue/context adapters without injected callbacks', async () => {
  const App = await component('src/App.jsx');
  storeSession(createSession({ accessToken: session.accessToken, tokenType: 'Bearer', expiresInSeconds: 3600, user }));
  window.history.replaceState({}, '', '/legal/approval-review?caseId=' + a + '&lang=en');
  globalThis.fetch = transport(() => json(contextFixture()));
  const view = await mount({}, App);
  try { assert.match(view.host.textContent, /Final approval/); assert.ok(view.host.querySelector('form select'));
    await change(view.host.querySelector('form select'), 'APPROVE'); assert.equal(view.host.querySelector('[type=submit]').disabled, false);
  } finally { await view.close(); }
});

test('actual App Legal navigation is sidebar-only, covers five steps and retains case/language on desktop and mobile', async () => {
  const App = await component('src/App.jsx');
  let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') { writes++; assert.fail('Navigation must not submit a legal decision'); }
    if (url.endsWith('/auth/me')) return json(user);
    if (url.endsWith('/context')) return json(contextFixture());
    if (url.includes('verification-cases?')) return json({ ...pageFixture(), totalElements: 1, totalPages: 1 });
    return json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  };
  for (const lang of ['vi', 'en']) {
    storeSession(createSession({ accessToken: session.accessToken, tokenType: 'Bearer', expiresInSeconds: 3600, user }));
    window.history.replaceState({}, '', `/legal/approval-review?caseId=${a}&lang=${lang}`);
    const view = await mount({}, App);
    try {
      const items = () => [...view.host.querySelectorAll('.lv-sidebar-nav .lv-nav-item')];
      assert.equal(items().length, 5);
      assert.equal(new Set(items().map(item => item.textContent)).size, 5);
      assert.equal(view.host.querySelector('.lv-legal-live nav'), null);
      assert.equal(view.host.querySelector('.lv-legal-process, .lv-legal-stages'), null);
      assert.equal(view.host.querySelector('.lv-header-right .lv-header-action-btn'), null, 'Legal has no global reload button');
      assert.equal(items().filter(item => item.getAttribute('aria-current') === 'page').length, 1);
      assert.equal(items().find(item => item.getAttribute('aria-current') === 'page').textContent.trim(), lang === 'en' ? 'Final approval' : 'Phê duyệt hồ sơ');
      for (const item of LEGAL_NAVIGATION_REGISTRY) {
        const label = item[lang === 'en' ? 'labelEn' : 'labelVi'];
        await act(async () => view.host.querySelector('.lv-mobile-menu-trigger').click());
        assert.ok(view.host.querySelector('.lv-shell-sidebar').classList.contains('is-open'));
        await act(async () => items().find(button => button.textContent.trim() === label).click());
        assert.equal(window.location.pathname, item.path);
        const params = new URLSearchParams(window.location.search);
        assert.equal(params.get('caseId'), a); assert.equal(params.get('lang'), lang);
        assert.equal(view.host.querySelector('.lv-legal-live h1').textContent, legalStepTitle(item.id, lang));
        assert.ok(view.host.querySelector('.lv-header-breadcrumbs').textContent.includes(label));
        assert.equal(items().filter(button => button.getAttribute('aria-current') === 'page').length, 1);
        assert.equal(items().find(button => button.getAttribute('aria-current') === 'page').textContent.trim(), label);
        assert.equal(view.host.querySelector('.lv-shell-sidebar').classList.contains('is-open'), false);
        assert.equal(view.host.querySelector('.lv-legal-live nav'), null);
        assert.equal(view.host.querySelector('.lv-legal-process, .lv-legal-stages'), null);
      }
    } finally { await view.close(); }
  }
  assert.equal(writes, 0);
});

test('basis assessment cannot classify or approve an absent distribution dossier', async () => {
  const value=contextFixture();value.basisDossier=null;value.snapshot=null;value.vaultStatus='DOCUMENT_VERIFICATION';value.willComparison.vaultStatus=value.vaultStatus;
  value.capabilities={approval:{allowed:false,blockedReason:'BASIS_DOSSIER_INVALID_STATE'},unlock:{allowed:false,blockedReason:'BASIS_DOSSIER_INVALID_STATE'}};
  let writes=0;globalThis.fetch=async(url,init)=>{if(init.method==='POST')writes++;if(url.endsWith('/context'))return json(value);if(url.includes('verification-cases?'))return json(pageFixture());if(url.endsWith('will-comparisons'))return json(value.willComparison);return json({code:'RESOURCE_NOT_FOUND'},404);};
  const view=await mount({...base,step:'basis-route-selection'});
  try{assert.equal(view.host.querySelector('form'),null);assert.match(view.host.textContent,/unavailable|outside this account/);assert.equal(view.host.querySelector('option[value=NOTARIAL]'),null);assert.equal(writes,0);}finally{await view.close();}
});

test('queue paging requests the next server page rather than treating the first page as all cases', async () => {
  const pages = [], destinations = [];
  globalThis.fetch = async url => {
    const page = Number(new URL(url, 'http://local').searchParams.get('page')); pages.push(page); return json(pageFixture(page));
  };
  const view = await mount({ ...base, caseId: '', onNavigate: destination => destinations.push(destination) });
  try { await click(view.host, 'Next'); assert.deepEqual(pages, [0, 1]);
    assert.match(view.host.querySelector('select').textContent, /CASE-B/);
    assert.doesNotMatch(view.host.querySelector('select').textContent, /CASE-A/);
    assert.equal(destinations[0], '/legal/approval-review?lang=en');
  } finally { await view.close(); }
});
