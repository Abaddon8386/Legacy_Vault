import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, readStoredSession, storeSession } from './session.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/account/profile' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Reload User', email: 'reload@example.test', roles: ['VAULT_OWNER'] };
const candidate = () => createSession({ accessToken: 'synthetic-reload-token', tokenType: 'Bearer', expiresInSeconds: 3600, user });

test('tab storage preserves expiry and removes expired, malformed and logged-out sessions', () => {
  const storage = window.sessionStorage;
  const value = candidate();
  storeSession(value);
  assert.deepEqual(readStoredSession(), value);
  assert.equal(readStoredSession(storage, value.expiresAt), null);
  storage.setItem('legacyvault.session.v1', '{broken');
  assert.equal(readStoredSession(), null);
  storeSession(value);
  storeSession(null);
  assert.equal(readStoredSession(), null);
  assert.equal(window.localStorage.length, 0);
  assert.doesNotThrow(() => storeSession(value, { setItem() { throw new Error('blocked'); } }));
});

const output = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
  define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
  build: { write: false, minify: false, lib: { entry: 'src/App.jsx', formats: ['es'] },
    rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
let code = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
const { default: App } = await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));

for (const role of ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'BENEFICIARY', 'ADMIN']) {
  test(`reload restores ${role} on current route using server roles and keeps original expiry`, async () => {
    const saved = { ...candidate(), user: { ...user, roles: [role] } };
    storeSession(saved);
    window.history.replaceState({}, '', '/account/profile');
    const originalFetch = globalThis.fetch;
    const calls = [];
    globalThis.fetch = async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => saved.user };
    };
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => root.render(React.createElement(App)));
      assert.equal(window.location.pathname, '/account/profile');
      assert.ok(host.querySelector('.lv-shell-sidebar'));
      assert.equal(calls[0].url, '/api/v1/auth/me');
      assert.equal(calls[0].options.headers.Authorization, `Bearer ${saved.accessToken}`);
      assert.equal(readStoredSession().expiresAt, saved.expiresAt);
    } finally {
      await act(async () => root.unmount()); host.remove(); storeSession(null); globalThis.fetch = originalFetch;
    }
  });
}

for (const status of [401, 503]) test(`restore HTTP ${status}: invalid session clears; outage permits retry`, async () => {
  storeSession(candidate());
  window.history.replaceState({}, '', '/account/profile');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status, headers: { get: () => 'application/json' }, json: async () => ({ code: status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL_ERROR' }) });
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(React.createElement(App)));
    if (status === 401) {
      assert.equal(readStoredSession(), null);
      assert.equal(window.location.pathname, '/login');
    } else {
      assert.ok(readStoredSession());
      assert.match(host.textContent, /Thử lại/);
      globalThis.fetch = async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => user });
      await act(async () => host.querySelector('button').click());
      assert.ok(host.querySelector('.lv-shell-sidebar'));
    }
  } finally {
    await act(async () => root.unmount()); host.remove(); storeSession(null); globalThis.fetch = originalFetch;
  }
});

for (const role of ['VAULT_OWNER', 'BENEFICIARY']) {
  for (const failure of ['unauthorized', 'forbidden', 'unavailable', 'network', 'malformed']) {
    test(`homepage ${role}: ${failure} verification never exposes stored Dashboard; retry requires server success`, async () => {
      const saved = { ...candidate(), user: { ...user, roles: [role] } };
      storeSession(saved);
      window.history.replaceState({}, '', '/?lang=en');
      const originalFetch = globalThis.fetch;
      let finish;
      globalThis.fetch = () => new Promise(resolve => { finish = resolve; });
      const host = document.createElement('div'); document.body.append(host);
      const root = createRoot(host);
      try {
        await act(async () => root.render(React.createElement(App)));
        assert.equal(host.querySelector('.lv-landing-dashboard'), null);
        assert.match(host.textContent, /Restoring your session/);
        await act(async () => finish({ ok: failure === 'malformed', status: failure === 'malformed' ? 200 : failure === 'unauthorized' ? 401 : failure === 'forbidden' ? 403 : 503,
          headers: { get: () => 'application/json' }, json: async () => failure === 'malformed' ? {} : { code: 'INTERNAL_ERROR' } }));
        assert.equal(host.querySelector('.lv-landing-dashboard'), null);
        if (failure === 'malformed' || failure === 'unauthorized') {
          assert.equal(readStoredSession(), null);
          assert.equal(window.location.pathname, '/login');
          return;
        }
        assert.match(host.textContent, /Unable to verify your session/);
        assert.ok(readStoredSession(), 'An outage does not silently discard recoverable credentials');
        if (failure === 'network') {
          globalThis.fetch = async () => { throw new TypeError('offline'); };
          await act(async () => host.querySelector('button').click());
          assert.equal(host.querySelector('.lv-landing-dashboard'), null);
          assert.match(host.textContent, /Unable to verify your session/);
        }
        let retryFinish;
        globalThis.fetch = () => new Promise(resolve => { retryFinish = resolve; });
        await act(async () => host.querySelector('button').click());
        assert.equal(host.querySelector('.lv-landing-dashboard'), null);
        await act(async () => retryFinish({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => saved.user }));
        assert.ok(host.querySelector('.lv-landing-dashboard'));
        assert.equal(host.querySelector('.lv-landing-register'), null);
        assert.equal(host.querySelector('.lv-landing-login'), null);
        assert.match(host.querySelector('.lv-landing-dashboard').textContent, /Dashboard/);
        // Navigation uses the verified user's existing role destination and keeps English.
        globalThis.fetch = async () => ({ ok: false, status: 503, headers: { get: () => 'application/json' }, json: async () => ({ code: 'INTERNAL_ERROR' }) });
        await act(async () => host.querySelector('.lv-landing-dashboard').click());
        assert.equal(window.location.pathname, role === 'VAULT_OWNER' ? '/vault' : '/beneficiary');
        assert.equal(new URLSearchParams(window.location.search).get('lang'), 'en');
      } finally {
        await act(async () => root.unmount()); host.remove(); storeSession(null); globalThis.fetch = originalFetch;
      }
    });
  }
}
