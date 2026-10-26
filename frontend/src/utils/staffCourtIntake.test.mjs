import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
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
function transport() { globalThis.fetch = async url => json(String(url).includes('/assets?') ? catalog : String(url).endsWith('/beneficiaries') ? [] : dossier); }
async function fillCourtForm(host) {
  await act(async () => host.querySelector('#tab-btn-intake').click());
  await act(async () => host.querySelector('.lv-btn-add-allocation').click());
  const selects = host.querySelectorAll('.lv-court-editor select');
  await change(selects[0], b); await change(selects[1], 'court');
  await change(host.querySelector('.lv-court-editor input[type=text]'), 'Recipient C');
  const inputs = host.querySelectorAll('form input.lv-form-input[type=text]');
  await change(inputs[0], 'Court'); await change(inputs[1], '25/2026');
  await change(host.querySelector('form input.lv-form-input[type=date]'), '2026-10-01');
  const input = host.querySelector('input[type=file]');
  await act(async () => props(input).onChange({ target: { files: [new File(['%PDF-1.7\n%%EOF'], 'court.pdf', { type: 'application/pdf' })], value: '' } }));
}
test.afterEach(() => { globalThis.fetch = originalFetch; globalThis.XMLHttpRequest = originalXHR; });
test('live intake with an empty recipient roster submits C via multipart, never beneficiary/account IDs; duplicate submit sends once', async () => {
  transport(); const calls = [];
  globalThis.XMLHttpRequest = class {
    upload = {}; open(method, url) { this.url = url; } setRequestHeader() {} abort() {}
    async send(body) { calls.push(JSON.parse(await body.get('metadata').text())); this.status = 201; this.responseText = JSON.stringify({ ...dossier, versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED', allocations: [] }] }); this.onload(); }
  };
  const view = await mount(Intake);
  try {
    await fillCourtForm(view.host);
    assert.equal(view.host.querySelector('.lv-btn-submit-version').disabled, false);
    await act(async () => { const form = view.host.querySelector('form'); for (let i = 0; i < 2; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(calls.length, 1);
    const row = calls[0].allocations[0];
    assert.equal(row.assetId, b); assert.equal(row.beneficiaryId, undefined); assert.equal(row.courtRecipient.fullName, 'Recipient C');
    assert.equal(row.courtRecipient.accountLinked, undefined); assert.equal(row.courtRecipient.identityNumber, undefined);
  } finally { await view.close(); }
});
test('failed court intake keeps recipient/file draft; retry uses the same draft and shows success only after receipt', async () => {
  transport(); let calls = 0;
  globalThis.XMLHttpRequest = class {
    upload = {}; open() {} setRequestHeader() {} abort() {}
    send() { this.status = ++calls === 1 ? 500 : 201; this.responseText = JSON.stringify(calls === 1 ? { code: 'INTERNAL_ERROR', message: 'Retry upload' } : { ...dossier, versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED' }] }); queueMicrotask(() => this.onload()); }
  };
  const view = await mount(Intake);
  try {
    await fillCourtForm(view.host);
    await act(async () => view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.match(view.host.textContent, /Retry upload/);
    assert.equal(view.host.querySelector('.lv-court-editor input[type=text]').value, 'Recipient C');
    assert.match(view.host.textContent, /court.pdf/);
    await act(async () => view.host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
    assert.equal(calls, 2); assert.equal(Boolean(view.host.querySelector('.lv-form-success-banner')), true);
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
