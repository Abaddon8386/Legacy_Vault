import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/legal/controlled-unlock' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const built = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry: 'src/pages/legal/LegalLiveWorkflow.jsx', formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Screen = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const a = '11111111-1111-4111-8111-111111111111';
const session = { accessToken: 'synthetic-test-only', expiresAt: Date.now() + 3600000, user: { id: a, fullName: 'Legal Test', roles: ['LEGAL_VERIFIER'] } };
const base = { session, lang: 'en', caseId: a, discovery: async () => [{ caseId: a, label: 'Case A', deathDocumentIds: [a] }],
  contextLoader: async caseId => ({ caseId, deathDocuments: [{ id: caseId }], capabilities: { approval: { allowed: false }, unlock: { allowed: false } } }) };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const original = globalThis.fetch;
test.afterEach(() => { globalThis.fetch = original; });
async function mount(step, extra = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Screen, { ...base, step, ...extra })));
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('only the controlled-unlock step reads and shows reopening requests', async () => {
  const urls = [];
  globalThis.fetch = async url => { urls.push(String(url)); return String(url).includes('/group-handover/reopen-requests?')
    ? json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }) : json({ code: 'RESOURCE_NOT_FOUND' }, 404); };
  let view = await mount('controlled-unlock');
  try {
    // A case is selected, so the empty state is the one about that case.
    assert.match(view.host.textContent, /Handover reopening requests/); assert.match(view.host.textContent, /The selected case has no reopening request waiting for Legal/);
    assert.ok(urls.some(url => url.includes('/legal-verifications/group-handover/reopen-requests?')));
  } finally { await view.close(); }
  urls.length = 0;
  for (const step of ['death-verification', 'will-document-verification', 'basis-route-selection', 'approval-review']) {
    view = await mount(step);
    try { assert.doesNotMatch(view.host.textContent, /Handover reopening requests/); } finally { await view.close(); }
  }
  assert.ok(!urls.some(url => url.includes('reopen-requests')), 'other Legal steps never read reopening requests');
});

test('an empty queue shows exactly one short message, and the explanation appears only when there is a request', async () => {
  globalThis.fetch = async url => String(url).includes('/group-handover/reopen-requests?')
    ? json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }) : json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  const general = /No reopening request is waiting for Legal/, forCase = /The selected case has no reopening request waiting for Legal/, explanation = /Only Legal decides/;
  let view = await mount('controlled-unlock', { caseId: '' });
  try {
    assert.match(view.host.textContent, general); assert.doesNotMatch(view.host.textContent, forCase); assert.doesNotMatch(view.host.textContent, explanation);
  } finally { await view.close(); }
  view = await mount('controlled-unlock');
  try {
    assert.match(view.host.textContent, forCase); assert.doesNotMatch(view.host.textContent, general); assert.doesNotMatch(view.host.textContent, explanation);
  } finally { await view.close(); }
});
