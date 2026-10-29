import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/basis-route-selection' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false,
  lib: { entry: 'src/pages/legal/LegalLiveWorkflow.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Screen = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222';
const digest = 'a'.repeat(64), now = '2026-10-29T10:00:00Z';
const session = { accessToken: 'hold-test-fixture', expiresAt: Date.now() + 3600000, user: { id: a, roles: ['LEGAL_VERIFIER'] } };
function context(route = 'COURT') {
  const held = route === 'ON_HOLD', vaultStatus = held ? 'ON_HOLD' : 'LEGAL_BASIS_VERIFICATION';
  return { caseId: a, vaultId: b, caseNumber: 'Hold fixture', caseStatus: 'OPEN', vaultStatus, evaluatedAt: now,
    deathDocuments: [], willComparison: { caseId: a, vaultStatus },
    basisDossier: { id: b, caseId: a, route, status: held ? 'DRAFT' : 'LEGAL_BASIS_FORWARDED', disputeStatus: held ? 'DISPUTED' : 'NONE',
      requiredVersion: held ? 2 : 1, routeReason: held ? 'Disputed entitlement' : 'Received document', classifiedBy: a,
      versions: [{ version: 1, sha256: digest, forwardStatus: 'FORWARDED' }] },
    snapshot: { dossierId: b, currentVersion: 1, requiredVersion: held ? 2 : 1, sha256Hash: digest, allocationHash: digest,
      disputeStatus: held ? 'DISPUTED' : 'NONE', reviewFresh: false, approvalCurrent: false },
    capabilities: { approval: { allowed: false, blockedReason: 'LEGAL_APPROVAL_REQUIRED' }, unlock: { allowed: false, blockedReason: 'LEGAL_APPROVAL_REQUIRED' } } };
}
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps'))];
const change = (element, value) => act(async () => props(element).onChange({ target: { value } }));
const click = (host, text) => act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === text).click());
const submit = host => act(async () => { props(host.querySelector('form')).onSubmit({ preventDefault() {} }); });
async function mount(contextLoader, extra = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const options = { session, caseId: a, step: 'basis-route-selection', lang: 'en', contextLoader,
    discovery: async () => [{ caseId: a, label: 'Hold fixture', deathDocumentIds: [] }], ...extra };
  const render = next => act(async () => root.render(React.createElement(Screen, { ...options, ...next })));
  await render({});
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const originalFetch = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = originalFetch; });

for (const route of ['COURT', 'NOTARIAL']) test(`${route}: hold remains reachable without the distribution service and success refreshes the parent into resume`, async () => {
  let current = context(route), writes = 0, body;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/context')) return json(current);
    if (init.method === 'POST') { assert.ok(url.endsWith('/basis-dossier/hold')); body = JSON.parse(init.body); writes++; current = context('ON_HOLD'); return json(current.basisDossier); }
    return json({}, 409);
  };
  const view = await mount(async () => current);
  try {
    await click(view.host, 'Place case on hold');
    assert.equal(view.host.querySelector('[type=submit]').disabled, true);
    await change(view.host.querySelector('form select'), 'NEW_DISPUTE'); await change(view.host.querySelector('textarea'), ' New dispute ');
    await submit(view.host);
    assert.equal(writes, 1); assert.deepEqual(body, { cause: 'NEW_DISPUTE', reason: 'New dispute' });
    assert.match(view.host.textContent, /Case placed on hold/); assert.match(view.host.textContent, /Resume case processing/);
    assert.doesNotMatch(view.host.textContent, /notification has been sent/);
  } finally { await view.close(); }
});

for (const route of ['COURT', 'NOTARIAL']) test(`ON_HOLD resumes through the existing ${route} reclassification endpoint, without a distribution GET`, async () => {
  let current = context('ON_HOLD'), body, writes = 0;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/distribution-workflow')) {
      assert.notEqual(current.basisDossier.route, 'ON_HOLD', 'A held case must not depend on distribution reads');
      return json({}, 404);
    }
    if (url.endsWith('/context')) return json(current);
    assert.ok(url.endsWith('/basis-dossier/reclassification')); assert.equal(init.method, 'POST');
    body = JSON.parse(init.body); writes++; current = context(route);
    current.vaultStatus = current.willComparison.vaultStatus = 'AWAITING_LEGAL_BASIS';
    return json(current.basisDossier);
  };
  const view = await mount(async () => current);
  try {
    assert.match(view.host.textContent, /Disputed entitlement/);
    await change(view.host.querySelector('form select'), route); await change(view.host.querySelector('textarea'), 'Documents checked');
    await submit(view.host);
    assert.equal(writes, 1); assert.deepEqual(body, { route, routeReason: 'Documents checked' });
    assert.match(view.host.textContent, /Case processing resumed/);
    assert.match(view.host.textContent, /Place case on hold/);
  } finally { await view.close(); }
});

test('Changed context blocks hold POST, keeps the reason, and requires a reload', async () => {
  const current = context(); let writes = 0;
  globalThis.fetch = async (url, init) => {
    if (init.method === 'POST') writes++;
    return url.endsWith('/context') ? json({ ...current, basisDossier: { ...current.basisDossier, requiredVersion: 2 },
      snapshot: { ...current.snapshot, requiredVersion: 2 } }) : json({}, 404);
  };
  const view = await mount(async () => current);
  try {
    await click(view.host, 'Place case on hold'); await change(view.host.querySelector('form select'), 'INSUFFICIENT_EVIDENCE');
    await change(view.host.querySelector('textarea'), 'Keep this reason'); await submit(view.host);
    assert.equal(writes, 0); assert.match(view.host.textContent, /case changed/i);
    assert.equal(view.host.querySelector('textarea').value, 'Keep this reason'); assert.equal(view.host.querySelector('[type=submit]').disabled, true);
  } finally { await view.close(); }
});

test('Duplicate resume sends once; token change aborts it and ignores late success', async () => {
  const current = context('ON_HOLD'); let writes = 0, finish, signal;
  globalThis.fetch = async (url, init) => {
    if (url.endsWith('/context')) return json(current);
    writes++; signal = init.signal; return new Promise(resolve => { finish = resolve; });
  };
  const view = await mount(async () => current);
  try {
    await change(view.host.querySelector('form select'), 'COURT'); await change(view.host.querySelector('textarea'), 'Resume reason');
    await submit(view.host); await submit(view.host); assert.equal(writes, 1);
    await view.render({ session: { ...session, accessToken: 'new-fixture-token' } }); assert.equal(signal.aborted, true);
    await act(async () => finish(json({ ...current.basisDossier, route: 'COURT' })));
    assert.doesNotMatch(view.host.textContent, /Case processing resumed/); assert.equal(view.host.querySelector('textarea').value, '');
  } finally { await view.close(); }
});

for (const status of [401, 403, 409, 500]) test(`Resume HTTP ${status} cannot produce success or allow blind retry`, async () => {
  const current = context('ON_HOLD'); let unauthorized = 0;
  globalThis.fetch = async (url) => url.endsWith('/context') ? json(current) : json({ code: 'FAILED' }, status);
  const view = await mount(async () => current, { onUnauthorized: () => { unauthorized++; } });
  try {
    await change(view.host.querySelector('form select'), 'COURT'); await change(view.host.querySelector('textarea'), 'Retained reason'); await submit(view.host);
    assert.doesNotMatch(view.host.textContent, /Case processing resumed/); assert.ok(view.host.querySelector('[role=alert]'));
    if (status !== 403) { assert.equal(view.host.querySelector('textarea').value, 'Retained reason'); assert.equal(view.host.querySelector('[type=submit]').disabled, true); }
    assert.equal(unauthorized, status === 401 ? 1 : 0);
  } finally { await view.close(); }
});

test('Closed or unlocked cases expose neither hold nor resume forms', async () => {
  globalThis.fetch = async () => json({}, 404);
  for (const current of [{ ...context(), caseStatus: 'CLOSED' }, { ...context('ON_HOLD'), caseStatus: 'CANCELLED' }, { ...context(), vaultStatus: 'UNLOCKED' }]) {
    const view = await mount(async () => current);
    try { assert.equal(view.host.querySelector('form'), null); assert.doesNotMatch(view.host.textContent, /Place case on hold|Resume processing/); }
    finally { await view.close(); }
  }
});
