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
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}


const { default: Profile } = await loadComponentModule('src/pages/account/AccountProfilePage.jsx');
const user = { id: '12345678-1234-4234-8234-123456789012', fullName: 'Test User', email: 'test@example.test', roles: ['VAULT_OWNER'] };
const session = { accessToken: 'test-token', expiresAt: Date.now() + 600000, user };
for (const scenario of ['unmount', 'logout', 'switch', 'success']) {
  test(`profile refresh ${scenario}: never applies a stale response`, async () => {
    const originalFetch = globalThis.fetch;
    let resolveFetch, signal;
    globalThis.fetch = (_url, options) => { signal = options.signal; return new Promise(resolve => { resolveFetch = resolve; }); };
    const host = document.createElement('div'); document.body.append(host);
    const root = createRoot(host); const calls = [];
    const render = value => root.render(React.createElement(Profile, { session: value, onRefreshSession: (...args) => calls.push(args) }));
    let mounted = true;
    try {
      await act(async () => render(session));
      await act(async () => host.querySelector('.lv-profile-refresh-btn').click());
      if (scenario === 'unmount') { await act(async () => root.unmount()); mounted = false; }
      if (scenario === 'logout') await act(async () => render(null));
      if (scenario === 'switch') await act(async () => render({ ...session, accessToken: 'new-token' }));
      if (scenario !== 'success') assert.equal(signal.aborted, true);
      // Deliberately ignore abort in this transport to test late-response rejection too.
      await act(async () => { resolveFetch({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => user }); });
      assert.equal(calls.length, scenario === 'success' ? 1 : 0);
      if (scenario === 'success') assert.deepEqual(calls[0][1], { accessToken: session.accessToken, userId: user.id });
    } finally {
      if (mounted) await act(async () => root.unmount());
      host.remove(); globalThis.fetch = originalFetch;
    }
  });
}

for (const lang of ['vi', 'en']) {
  test(`Bug 15: ${lang} profile keeps personal information without session internals`, async () => {
    const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
    try {
      await act(async()=>root.render(React.createElement(Profile,{session,lang})));
      assert.match(host.textContent,/Test User/);assert.match(host.textContent,/test@example.test/);
      assert.equal(host.querySelector('#session-info-heading'),null);
      assert.equal(host.querySelector('.lv-profile-session-grid'),null);
      assert.doesNotMatch(host.textContent,/test-token/);
      assert.ok(host.querySelector('.lv-profile-edit-btn'));
      assert.ok(host.querySelector('.lv-profile-refresh-btn'));
    } finally {await act(async()=>root.unmount());host.remove();}
  });
}
