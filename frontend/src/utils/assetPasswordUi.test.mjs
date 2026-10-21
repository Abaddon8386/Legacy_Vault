import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/profile' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent=()=>{};
dom.window.HTMLElement.prototype.detachEvent=()=>{};
async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { output: { codeSplitting: false }, external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return { exports: await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64')), code };
}


const { exports: { AssetEditModal } } = await loadComponentModule('src/components/assets/AssetEditModal.jsx');
const { ASSET_I18N } = await import('../pages/assets/assetI18n.js');
const asset = { id: '22222222-2222-4222-8222-222222222222', assetType: 'TEXT', name: 'Existing asset', description: '', hasPayload: true };
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  const render = async next => act(async () => root.render(React.createElement(Component, next)));
  await render(props);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function change(host, id, value) {
  const field = host.querySelector('#' + id); assert.ok(field, id);
  const key = Object.keys(field).find(key => key.startsWith('__reactProps$'));
  await act(async () => field[key].onChange({ target: { value } }));
}
async function submit(host) { await act(async () => host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }))); }
const base = { isOpen: true, asset, t: ASSET_I18N.en, onClose() {} };

test('current password is required; one save sends the raw password with the patch and clears its input', async () => {
  const calls = [];
  const view = await mount(AssetEditModal, { ...base, onSubmit: (...args) => calls.push(args) });
  try {
    await change(view.host, 'edit-asset-name', 'Changed'); await submit(view.host); assert.equal(calls.length, 0);
    await change(view.host, 'edit-confirm-password', '  current-password  '); await submit(view.host);
    assert.equal(calls.length, 1); assert.equal(calls[0][0], asset.id);
    assert.deepEqual(calls[0][1], { name: 'Changed', password: '  current-password  ' });
    assert.ok(calls[0][2].signal); assert.equal(view.host.querySelector('#edit-confirm-password').value, '');
  } finally { await view.close(); }
});

for (const [code, expected] of [['REAUTH_FAILED', /verify your password/], ['TOO_MANY_ATTEMPTS', /Too many attempts/], ['NETWORK_ERROR', /Unable to update asset/]]) {
  test(`PATCH ${code} keeps the draft, clears password and permits explicit retry`, async () => {
    const view = await mount(AssetEditModal, { ...base, onSubmit: async () => { throw Object.assign(new Error(code), { code }); } });
    try {
      await change(view.host, 'edit-asset-name', 'Draft'); await change(view.host, 'edit-confirm-password', 'password'); await submit(view.host);
      assert.equal(view.host.querySelector('#edit-asset-name').value, 'Draft'); assert.equal(view.host.querySelector('#edit-confirm-password').value, '');
      assert.match(view.host.querySelector('[role=alert]').textContent, expected); assert.equal(view.host.querySelector('[type=submit]').disabled, false);
    } finally { await view.close(); }
  });
}

test('duplicate submits send only one PATCH; unmount aborts the in-flight save', async () => {
  let finish, signal, calls = 0;
  const view = await mount(AssetEditModal, { ...base, onSubmit: (_id, _patch, options) => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); } });
  await change(view.host, 'edit-asset-name', 'Draft'); await change(view.host, 'edit-confirm-password', 'password'); await submit(view.host); await submit(view.host);
  assert.equal(calls, 1); await view.close(); assert.equal(signal.aborted, true); await act(async () => finish());
});

test('changing authentication context aborts the previous save and clears the password', async () => {
  let finish, signal;
  const props = { ...base, authContext: 'token-A', onSubmit: (_id, _patch, options) => { signal = options.signal; return new Promise(resolve => { finish = resolve; }); } };
  const view = await mount(AssetEditModal, props);
  try {
    await change(view.host, 'edit-asset-name', 'Draft'); await change(view.host, 'edit-confirm-password', 'password'); await submit(view.host);
    await view.render({ ...props, authContext: 'token-B' }); assert.equal(signal.aborted, true);
    await act(async () => finish()); assert.equal(view.host.querySelector('#edit-confirm-password').value, '');
    assert.equal(view.host.querySelector('[type=submit]').disabled, false);
  } finally { await view.close(); }
});

test('real asset page sends one PATCH with password; REAUTH_FAILED and 429 retain its modal and successful retry reloads metadata', async () => {
  const { exports: { AssetManagementPage } } = await loadComponentModule('src/pages/assets/AssetManagementPage.jsx');
  const original = globalThis.fetch;
  const vaultId = '11111111-1111-4111-8111-111111111111';
  const record = { ...asset, vaultId, createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z' };
  const calls = []; let failure = 'REAUTH_FAILED', logouts = 0;
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  globalThis.fetch = async (url, options) => {
    calls.push({ url, options });
    if (options.method === 'PATCH') {
      assert.deepEqual(JSON.parse(options.body), { name: 'Updated record', password: 'current-password' });
      assert.equal(options.headers.Authorization, 'Bearer real-page-fixture');
      return failure ? json({ code: failure }, failure === 'REAUTH_FAILED' ? 403 : 429) : json({ ...record, name: 'Updated record' });
    }
    assert.equal(options.method, 'GET', 'No separate password verification or reveal request');
    return json(url.includes('?') ? { content: [record], page: 0, size: 10, totalElements: 1, totalPages: 1 } : record);
  };
  const view = await mount(AssetManagementPage, { vaultId, accessToken: 'real-page-fixture', lang: 'en', onNavigateToLogin: () => logouts++ });
  try {
    await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit').click());
    await change(view.host, 'edit-asset-name', 'Updated record');
    for (const code of ['REAUTH_FAILED', 'TOO_MANY_ATTEMPTS', null]) {
      failure = code; await change(view.host, 'edit-confirm-password', 'current-password'); await submit(view.host);
      if (code) {
        assert.ok(view.host.querySelector('[role=dialog]'));
        assert.equal(view.host.querySelector('#edit-asset-name').value, 'Updated record');
        assert.equal(view.host.querySelector('#edit-confirm-password').value, '');
        assert.doesNotMatch(view.host.textContent, /Asset updated/);
      }
    }
    assert.equal(logouts, 0); assert.equal(view.host.querySelector('[role=dialog]'), null);
    assert.equal(calls.filter(call => call.options.method === 'PATCH').length, 3);
    assert.match(view.host.textContent, /Asset updated/);
    assert.equal(calls.some(call => /reveal|login|verify/.test(call.url)), false);
  } finally { await view.close(); globalThis.fetch = original; }
});
