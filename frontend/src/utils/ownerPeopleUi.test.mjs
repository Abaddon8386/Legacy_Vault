import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/beneficiaries' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
async function component(entry) {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const People = await component('src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx');
const Summary = await component('src/components/vault/VaultSummary.jsx');
const vaultId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const page = content => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
for (const lang of ['vi', 'en']) test(`people ${lang}: separate add dialogs, validation, close and corrected Trustee name`, async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes('configuration-check') ? json({ vaultId, ready: false, beneficiaryCount: 0, issues: [{ code: 'BENEFICIARY_REQUIRED' }] }) : json(page([]));
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(People, { vaultId, accessToken: 'synthetic', lang })));
    assert.equal(host.querySelectorAll('dialog').length, 2);
    assert.equal(host.querySelector('dialog[open]'), null);
    assert.ok(!host.textContent.includes('giám hộ'));
    if (lang === 'vi') assert.match(host.textContent, /Người thi hành bên ngoài/);
    for (const id of ['trustee', 'beneficiary']) {
      const section = host.querySelector(`section[aria-labelledby="${id}-heading"]`);
      await act(async () => section.querySelector('button.lv-tb-btn-primary').click());
      const dialog = section.querySelector('dialog[open]'); assert.ok(dialog);
      await act(async () => dialog.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })));
      assert.ok(dialog.querySelector('.lv-tb-error-text'));
      await act(async () => dialog.querySelector('.lv-tb-dialog-header button').click());
      assert.equal(dialog.open, false);
    }
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; }
});
test('vault widget explains subscription policy pending without inventing plan or quota', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => url.includes('/subscriptions/me') ? json({ code: 'SUBSCRIPTION_POLICY_PENDING' }, 503) : json({});
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(Summary, { vaultId, ownerId: vaultId, accessToken: 'synthetic', lang: 'vi' })));
    assert.match(host.querySelector('.lv-summary-sub-widget').textContent, /Gói sử dụng hiện chưa được mở/);
    assert.equal(host.querySelector('.lv-summary-sub-plan-badge'), null);
  } finally { await act(async () => root.unmount()); host.remove(); globalThis.fetch = originalFetch; }
});
