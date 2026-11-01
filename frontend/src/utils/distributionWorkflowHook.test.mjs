import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { distributionFixture } from './testFixtures/distribution.js';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/workflows/useDistributionWorkflow.js', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(value => value.type === 'chunk' && value.isEntry).code;
code = code.replaceAll('from "react"', 'from "' + import.meta.resolve('react') + '"');
const { useDistributionWorkflow } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
const id = '11111111-1111-4111-8111-111111111111', sha = 'a'.repeat(64);
function fixture() { const value = distributionFixture({ caseId: id, caseStatus: 'OPEN', basisDossier: { versions: [{ version: 1, sha256: sha }] }, snapshot: { allocationHash: sha }, vaultId: id }, 'DOCUMENTS_UNDER_REVIEW'); value.document.status = 'PENDING'; value.capabilities.approveDocuments = { allowed: true, blockedReason: null }; return value; }
const json = value => new Response(JSON.stringify(value), { status: 200, headers: { 'Content-Type': 'application/json' } });
function Harness({ token }) {
  const model = useDistributionWorkflow({ caseId: id, workspace: 'LEGAL', accessToken: token });
  return React.createElement('div', null, React.createElement('span', null, model.data?.phase || (model.error ? 'unavailable' : 'loading')),
    React.createElement('button', { disabled: !model.data || model.pending, onClick: () => model.run('approveDocuments', { reason: 'Hợp lệ' }) }, 'Save'),
    model.receipt && React.createElement('strong', null, model.receipt.action));
}
async function mount(token) { const host = document.createElement('div'); document.body.append(host); const root = createRoot(host); const render = value => act(async () => root.render(React.createElement(Harness, { token: value }))); await render(token); return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } }; }
const originalFetch = globalThis.fetch; test.afterEach(() => { globalThis.fetch = originalFetch; });
test('duplicate saves are locked and switching token cancels the old mutation without freezing the new session', async () => {
  let writes = 0, finish, oldSignal;
  globalThis.fetch = async (_url, init) => {
    if (init.method !== 'POST') return json(fixture());
    writes++; oldSignal = init.signal; return new Promise(resolve => { finish = resolve; });
  };
  const view = await mount('first');
  try {
    await act(async () => { view.host.querySelector('button').click(); view.host.querySelector('button').click(); });
    assert.equal(writes, 1); assert.equal(view.host.querySelector('button').disabled, true);
    await view.render('second'); assert.equal(oldSignal.aborted, true); assert.equal(view.host.querySelector('button').disabled, false);
    await act(async () => finish(json({ caseId: id, action: 'approveDocuments', revision: 2 })));
    assert.equal(view.host.querySelector('strong'), null); assert.equal(view.host.querySelector('button').disabled, false);
  } finally { await view.close(); }
});
test('a late read from a prior token cannot replace the new session workflow', async () => {
  let finish, oldSignal;
  globalThis.fetch = async (_url, init) => init.headers.Authorization === 'Bearer first'
    ? new Promise(resolve => { finish = resolve; oldSignal = init.signal; }) : json(fixture());
  const view = await mount('first');
  try {
    await view.render('second'); assert.equal(oldSignal.aborted, true);
    await act(async () => finish(json({ ...fixture(), phase: 'CLOSED' })));
    assert.match(view.host.textContent, /DOCUMENTS_UNDER_REVIEW/); assert.doesNotMatch(view.host.textContent, /CLOSED/);
  } finally { await view.close(); }
});
