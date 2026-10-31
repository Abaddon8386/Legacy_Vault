import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { distributionFixture } from './staffDistributionFixture.mjs';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/legal-documents' });
globalThis.window = dom.window; globalThis.document = dom.window.document; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalFetch = globalThis.fetch, originalXHR = globalThis.XMLHttpRequest;
const a = '11111111-1111-4111-8111-111111111111', b = '22222222-2222-4222-8222-222222222222', c = '33333333-3333-4333-8333-333333333333';
const json = value => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });
const caseItem = { caseId: a, caseNumber: 'HS-2026-000001', status: 'OPEN' };
const dossier = { id: a, caseId: a, route: 'COURT', status: 'DRAFT', versions: [] };
const catalog = { content: [{ assetId: b, name: 'Court asset', assetType: 'TEXT' }], page: 0, size: 100, totalElements: 1, totalPages: 1 };
async function component(entry) {
  const result = await build({ configFile: false, logLevel: 'silent', build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Intake = await component('src/pages/staff/StaffLegalDocumentsPage.jsx');
const Handover = await component('src/pages/staff/ScopedAssetHandoverPage.jsx');
const props = element => element[Object.keys(element).find(key => key.startsWith('__reactProps$'))];
async function change(element, value) { assert.ok(element); await act(async () => props(element).onChange({ target: { value } })); }
async function mount(Page, extra = {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Page, { caseId: a, caseItem, accessToken: 'fixture', lang: 'en', ...extra })));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
function transport(state = { uploaded: false, forwarded: false }) {
  const currentDossier = () => ({ ...dossier, status: state.forwarded ? 'LEGAL_BASIS_FORWARDED' : 'DRAFT',
    versions: state.uploaded ? [{ version: 1, forwardStatus: state.forwarded ? 'FORWARDED' : 'NOT_FORWARDED' }] : [] });
  globalThis.fetch = async (url, options = {}) => {
    if (String(url).endsWith('/distribution-workflow')) return json(distributionFixture(a, {
      allowed: state.forwarded ? [] : [state.uploaded ? 'forwardDocuments' : 'uploadDocuments'],
      phase: state.forwarded ? 'DOCUMENTS_UNDER_REVIEW' : 'AWAITING_DOCUMENTS',
      document: state.uploaded ? { version: 1, sha256: 'a'.repeat(64), status: 'PENDING' } : null,
    }));
    if (options.method === 'POST' && String(url).endsWith('/forward')) {
      state.forwarded = true;
      state.forwardCalls = (state.forwardCalls || 0) + 1;
      return json(currentDossier());
    }
    assert.ok(String(url).endsWith('/basis-dossier'), 'Document intake does not read allocation catalogues');
    return json(currentDossier());
  };
}
async function fillCourtForm(host) {
  await act(async () => host.querySelector('#tab-btn-intake').click());
  assert.equal(host.querySelector('#panel-intake .lv-court-editor'), null, 'Allocations wait for Legal document approval');
  const inputs = host.querySelectorAll('form input.lv-form-input[type=text]');
  await change(inputs[0], 'Court'); await change(inputs[1], '25/2026');
  const date = host.querySelector('.lv-datepicker-input');
  await change(date, '2026-10-01');
  await act(async () => props(date).onBlur());
  const input = host.querySelector('input[type=file]');
  await act(async () => props(input).onChange({ target: { files: [new File(['%PDF-1.7\n%%EOF'], 'court.pdf', { type: 'application/pdf' })], value: '' } }));
}
test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXHR; });
test('requested document intake submits evidence without allocations or recipient/account IDs; duplicate submit sends once', async () => {
  const state = { uploaded: false, forwarded: false }; transport(state); const calls = [];
  globalThis.XMLHttpRequest = class {
    upload = {}; open(method, url) { this.url = url; } setRequestHeader() {} abort() {}
    async send(body) { calls.push(JSON.parse(await body.get('metadata').text())); state.uploaded = true; this.status = 201; this.responseText = JSON.stringify({ ...dossier, versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED', allocations: [] }] }); this.onload(); }
  };
  const view = await mount(Intake);
  try {
    await fillCourtForm(view.host);
    assert.equal(view.host.querySelector('.lv-btn-submit-version').disabled, false);
    await act(async () => { const form = view.host.querySelector('form'); for (let i = 0; i < 2; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].allocations, undefined);
    assert.equal(calls[0].beneficiaryId, undefined); assert.equal(calls[0].accountId, undefined);
    assert.equal(calls[0].documentNumber, '25/2026');
    assert.equal(state.forwarded, true, 'Uploaded evidence is forwarded through the separate server capability');
    assert.equal(state.forwardCalls, 1);
    assert.ok(view.host.querySelector('.lv-forward-badge--forwarded'), 'Confirmed server state survives workflow refresh');
  } finally { await view.close(); }
});
test('failed requested document upload keeps metadata/file draft; confirmed retry forwards evidence exactly once', async () => {
  const state = { uploaded: false, forwarded: false }; transport(state); let calls = 0; const metadata = [];
  globalThis.XMLHttpRequest = class {
    upload = {}; open() {} setRequestHeader() {} abort() {}
    async send(body) { metadata.push(JSON.parse(await body.get('metadata').text())); this.status = ++calls === 1 ? 500 : 201; state.uploaded = this.status === 201; this.responseText = JSON.stringify(calls === 1 ? { code: 'INTERNAL_ERROR', message: 'Retry upload' } : { ...dossier, versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED' }] }); queueMicrotask(() => this.onload()); }
  };
  const view = await mount(Intake);
  try {
    await fillCourtForm(view.host);
    await act(async () => view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.match(view.host.textContent, /upload could not be confirmed/i);
    assert.equal(state.forwarded, false);
    assert.equal(view.host.querySelector('.lv-form-success-banner'), null);
    assert.equal(view.host.querySelector('form input.lv-form-input[type=text]').value, 'Court');
    assert.match(view.host.textContent, /court.pdf/);
    await act(async () => view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(calls, 2);
    assert.deepEqual(metadata[1], metadata[0]);
    assert.equal(state.forwarded, true);
    assert.equal(state.forwardCalls, 1);
    assert.ok(view.host.querySelector('.lv-forward-badge--forwarded'), 'Persisted confirmation remains after automatic dossier refresh');
  } finally { await view.close(); }
});
test('mixed A/C delivery keeps C visible with a reason, blocks its checkbox/button, and still allows A', async () => {
  let posts = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') posts++;
    if (String(url).includes('/eligible-assets')) return json([
      { assetId: b, recipientId: a, assetName: 'A asset', recipientName: 'A', deliveryStatus: 'ELIGIBLE', accountLinked: true, deliverable: true, blockedReason: null },
      { assetId: c, recipientId: c, assetName: 'C asset', recipientName: 'C', recipientSource: 'COURT_DOCUMENT', deliveryStatus: 'ELIGIBLE', accountLinked: false, deliverable: false, blockedReason: 'RECIPIENT_ACCOUNT_REQUIRED' },
    ]);
    return json(String(url).includes('/assets?') ? catalog : []);
  };
  const view = await mount(Handover, { sessionId: b });
  try {
    const select = view.host.querySelector('.lv-recipient-select') || view.host.querySelector('select');
    await change(select, c);
    assert.match(view.host.textContent, /confirm this recipient’s account link/);
    const single = view.host.querySelector('.lv-btn-record-handover');
    assert.equal(single.disabled, true);
    await act(async () => props(single).onClick());
    assert.equal(Boolean(view.host.querySelector('.lv-handover-modal')), false); assert.equal(posts, 0);
    await change(select, a);
    assert.equal(view.host.querySelector('.lv-btn-record-handover').disabled, false);
  } finally { await view.close(); }
});
