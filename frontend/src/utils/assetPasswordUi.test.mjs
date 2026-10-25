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

test('real asset edit uploads selected files through add-only endpoints and preserves existing attachments', async () => {
  const { exports: { AssetManagementPage } } = await loadComponentModule('src/pages/assets/AssetManagementPage.jsx');
  const original = globalThis.fetch;
  const vaultId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  const record = { ...asset, id: assetId, vaultId, createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    calls.push({ url: String(url), options });
    if (options.method === 'PATCH') return new Response(JSON.stringify({ ...record, name: 'Updated record' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/images') && options.method === 'GET') return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/documents') && options.method === 'GET') return new Response(JSON.stringify([]), { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/images') && options.method === 'POST') return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    if (String(url).endsWith('/documents') && options.method === 'POST') return new Response(JSON.stringify([]), { status: 201, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(String(url).includes('?') ? { content: [record], page: 0, size: 10, totalElements: 1, totalPages: 1 } : record), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const view = await mount(AssetManagementPage, { vaultId, accessToken: 'real-page-fixture', lang: 'en' });
  try {
    await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit').click());
    const image = new File(['image'], 'new.png', { type: 'image/png' });
    const doc = new File(['%PDF-1.7\n%%EOF'], 'new.pdf', { type: 'application/pdf' });
    const inputs = view.host.querySelectorAll('input[type=file]');
    for (const [input, file] of [[inputs[0], image], [inputs[1], doc]]) {
      assert.ok(input.classList.contains('lv-file-picker__input'));
      assert.ok(input.closest('.lv-file-picker').querySelector('.lv-form-label'));
      const key = Object.keys(input).find(k => k.startsWith('__reactProps$'));
      await act(async () => input[key].onChange({ target: { files: [file], value: '' } }));
    }
    await change(view.host, 'edit-asset-name', 'Updated record');
    await change(view.host, 'edit-confirm-password', 'current-password');
    await submit(view.host);
    assert.equal(calls.filter(call => call.options.method === 'PATCH').length, 1);
    assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.endsWith('/images')).length, 1);
    assert.equal(calls.filter(call => call.options.method === 'POST' && call.url.endsWith('/documents')).length, 1);
    assert.equal(calls.some(call => call.options.method === 'DELETE'), false);
    assert.match(view.host.textContent, /Asset updated/);
  } finally { await view.close(); globalThis.fetch = original; }
});

test('uploading a new image without metadata edits skips the empty asset PATCH and uploads successfully', async () => {
  const { exports: { AssetManagementPage } } = await loadComponentModule('src/pages/assets/AssetManagementPage.jsx');
  const original = globalThis.fetch;
  const vaultId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  const record = { ...asset, id: assetId, vaultId, createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z' };
  const calls = [];
  globalThis.fetch = async (url, options) => {
    const path = String(url); calls.push({ path, options });
    if (path.endsWith('/images') && options.method === 'GET') return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/documents') && options.method === 'GET') return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
    if (path.endsWith('/images') && options.method === 'POST') return new Response('[]', { status: 201, headers: { 'Content-Type': 'application/json' } });
    return new Response(JSON.stringify(path.includes('?') ? { content: [record], page: 0, size: 10, totalElements: 1, totalPages: 1 } : record), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  const view = await mount(AssetManagementPage, { vaultId, accessToken: 'real-page-fixture', lang: 'en' });
  try {
    await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit').click());
    await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
    const input = view.host.querySelector('input[type=file]');
    const file = new File(['image'], 'new.png', { type: 'image/png' });
    const key = Object.keys(input).find(k => k.startsWith('__reactProps$'));
    await act(async () => input[key].onChange({ target: { files: [file], value: '' } }));
    await change(view.host, 'edit-confirm-password', 'current-password');
    await submit(view.host);
    assert.equal(calls.filter(call => call.options.method === 'PATCH').length, 0);
    assert.equal(calls.filter(call => call.options.method === 'POST' && call.path.endsWith('/images')).length, 1);
    assert.match(view.host.textContent, /Asset updated/);
  } finally { await view.close(); globalThis.fetch = original; }
});

async function mountEditWithFiles({ imagePosts = [], documentPosts = [] }) {
  const { exports: { AssetManagementPage } } = await loadComponentModule('src/pages/assets/AssetManagementPage.jsx');
  const original = globalThis.fetch;
  const vaultId = '11111111-1111-4111-8111-111111111111';
  const assetId = '22222222-2222-4222-8222-222222222222';
  const record = { ...asset, id: assetId, vaultId, createdAt: '2026-10-21T10:00:00Z', updatedAt: '2026-10-21T10:00:00Z' };
  const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const calls = [], queues = { images: [...imagePosts], documents: [...documentPosts] };
  globalThis.fetch = async (url, options) => {
    const path = String(url); calls.push({ path, options });
    for (const kind of ['images', 'documents']) {
      if (!path.endsWith('/' + kind)) continue;
      if (options.method === 'GET') return json([]);
      if (options.method === 'POST') {
        const next = queues[kind].shift() ?? 'ok';
        if (next === 'network') throw new TypeError('offline');
        return next === 'ok' ? json([], 201) : json({ code: 'UPLOAD_FAILED' }, next);
      }
    }
    return json(path.includes('?') ? { content: [record], page: 0, size: 10, totalElements: 1, totalPages: 1 } : record);
  };
  const view = await mount(AssetManagementPage, { vaultId, accessToken: 'real-page-fixture', lang: 'en' });
  await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.trim() === 'Edit').click());
  await act(async () => new Promise(resolve => setTimeout(resolve, 0)));
  const pick = async (index, file) => {
    const input = view.host.querySelectorAll('input[type=file]')[index];
    const key = Object.keys(input).find(k => k.startsWith('__reactProps$'));
    await act(async () => input[key].onChange({ target: { files: [file], value: '' } }));
  };
  await pick(0, new File(['image'], 'new.png', { type: 'image/png' }));
  await pick(1, new File(['%PDF-1.7\n%%EOF'], 'new.pdf', { type: 'application/pdf' }));
  const save = async () => { await change(view.host, 'edit-confirm-password', 'current-password'); await submit(view.host); };
  const posts = kind => calls.filter(call => call.options.method === 'POST' && call.path.endsWith('/' + kind)).length;
  return { view, save, posts, calls, close: async () => { await view.close(); globalThis.fetch = original; } };
}

for (const [label, failure] of [['API error', 500], ['network interruption', 'network']]) {
  test(`image saved but PDF fails (${label}): partial result is shown and retry uploads only the PDF`, async () => {
    const env = await mountEditWithFiles({ documentPosts: [failure, 'ok'] });
    const text = () => env.view.host.textContent;
    try {
      await env.save();
      assert.equal(env.posts('images'), 1); assert.equal(env.posts('documents'), 1);
      assert.doesNotMatch(text(), /Asset updated/);
      const partial = env.view.host.querySelector('[data-testid=edit-partial]');
      assert.ok(partial); assert.match(partial.textContent, /Saved: new\.png/); assert.match(partial.textContent, /Failed: new\.pdf/);
      await env.save();
      assert.equal(env.posts('images'), 1, 'image must not be uploaded again');
      assert.equal(env.posts('documents'), 2);
      assert.match(text(), /Asset updated/);
    } finally { await env.close(); }
  });
}

test('both uploads fail: no success, nothing is marked saved, selection is kept and retry sends both', async () => {
  const env = await mountEditWithFiles({ imagePosts: [500, 'ok'], documentPosts: [500, 'ok'] });
  try {
    await env.save();
    assert.equal(env.posts('images'), 1); assert.equal(env.posts('documents'), 1);
    assert.doesNotMatch(env.view.host.textContent, /Asset updated/);
    assert.equal(env.view.host.querySelector('[data-testid=edit-partial]'), null);
    assert.match(env.view.host.textContent, /Unable to update asset/);
    assert.match(env.view.host.textContent, /new\.png/); assert.match(env.view.host.textContent, /new\.pdf/);
    await env.save();
    assert.equal(env.posts('images'), 2); assert.equal(env.posts('documents'), 2);
    assert.match(env.view.host.textContent, /Asset updated/);
  } finally { await env.close(); }
});

test('image fails but PDF succeeds: retry uploads only the image', async () => {
  const env = await mountEditWithFiles({ imagePosts: [500, 'ok'] });
  try {
    await env.save();
    assert.match(env.view.host.querySelector('[data-testid=edit-partial]').textContent, /Saved: new\.pdf[\s\S]*Failed: new\.png/);
    await env.save();
    assert.equal(env.posts('images'), 2); assert.equal(env.posts('documents'), 1);
    assert.match(env.view.host.textContent, /Asset updated/);
  } finally { await env.close(); }
});

test('double submit while the first save is running does not upload files twice', async () => {
  const env = await mountEditWithFiles({});
  try {
    await change(env.view.host, 'edit-confirm-password', 'current-password');
    await act(async () => { const form = env.view.host.querySelector('form'); for (let i = 0; i < 2; i++) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
    assert.equal(env.posts('images'), 1); assert.equal(env.posts('documents'), 1);
  } finally { await env.close(); }
});
