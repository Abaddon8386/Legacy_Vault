import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, storeSession, readStoredSession } from './session.js';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/vault' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry = 'src/components/layout/AppShell.jsx') {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] }
    }
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    }
  };
}

test('Task 27: Back to home link in Owner Dashboard with language preservation and no logout', async () => {
  const AppShell = await component('src/components/layout/AppShell.jsx');
  const user = { id: 'owner-1', fullName: 'Nguyen Van An', roles: ['VAULT_OWNER'] };
  const session = { accessToken: 'valid-token', expiresAt: Date.now() + 3600000, user };

  let navigatedTab = null;
  let logoutCalled = false;

  const view = await mount(AppShell, {
    role: 'OWNER',
    user,
    session,
    isAuthenticated: true,
    lang: 'vi',
    currentTab: 'vault',
    onNavigateTab: tab => { navigatedTab = tab; },
    onLogout: () => { logoutCalled = true; },
  });

  try {
    // 1. Header Home Button in Vietnamese
    const headerHomeBtn = view.host.querySelector('.lv-header-home-btn');
    assert.ok(headerHomeBtn, 'Owner dashboard must have Back to home button in header');
    assert.match(headerHomeBtn.textContent, /Về trang chủ/);

    await act(async () => headerHomeBtn.click());
    assert.equal(navigatedTab, 'home', 'Clicking header home button must navigate to home');
    assert.equal(logoutCalled, false, 'Must not log out when returning home');

    // 2. Account popover menu Back to home item
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    const menuHomeBtn = view.host.querySelector('.lv-account-menu-item--home');
    assert.ok(menuHomeBtn, 'Owner account menu must have Back to home item');
    assert.match(menuHomeBtn.textContent, /Về trang chủ/);

    navigatedTab = null;
    await act(async () => menuHomeBtn.click());
    assert.equal(navigatedTab, 'home');
    assert.equal(logoutCalled, false);
  } finally {
    await view.close();
  }
});

test('Task 27: Back to home link in Beneficiary Dashboard with English language support', async () => {
  const AppShell = await component('src/components/layout/AppShell.jsx');
  const user = { id: 'bene-1', fullName: 'Tran Thi Binh', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'valid-bene-token', expiresAt: Date.now() + 3600000, user };

  let navigatedTab = null;
  let logoutCalled = false;

  const view = await mount(AppShell, {
    role: 'BENEFICIARY',
    user,
    session,
    isAuthenticated: true,
    lang: 'en',
    currentTab: 'beneficiary-home',
    onNavigateTab: tab => { navigatedTab = tab; },
    onLogout: () => { logoutCalled = true; },
  });

  try {
    const headerHomeBtn = view.host.querySelector('.lv-header-home-btn');
    assert.ok(headerHomeBtn, 'Beneficiary dashboard must have Back to home button');
    assert.match(headerHomeBtn.textContent, /Back to home/);

    await act(async () => headerHomeBtn.click());
    assert.equal(navigatedTab, 'home');
    assert.equal(logoutCalled, false);

    // Account menu
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    const menuHomeBtn = view.host.querySelector('.lv-account-menu-item--home');
    assert.ok(menuHomeBtn, 'Beneficiary account menu must have Back to home item');
    assert.match(menuHomeBtn.textContent, /Back to home/);
  } finally {
    await view.close();
  }
});

test('Task 27: Staff and Legal portals MUST NOT contain Back to home link (regression safety)', async () => {
  const AppShell = await component('src/components/layout/AppShell.jsx');

  // Staff check
  {
    const staffUser = { id: 'staff-1', fullName: 'Staff Member', roles: ['STAFF_EXECUTOR'] };
    const staffSession = { accessToken: 'staff-token', expiresAt: Date.now() + 3600000, user: staffUser };
    const view = await mount(AppShell, {
      role: 'STAFF',
      user: staffUser,
      session: staffSession,
      isAuthenticated: true,
      lang: 'vi',
      currentTab: 'cases',
    });
    try {
      assert.equal(view.host.querySelector('.lv-header-home-btn'), null, 'Staff header must not have home button');
      await act(async () => view.host.querySelector('.lv-user-badge-card').click());
      assert.equal(view.host.querySelector('.lv-account-menu-item--home'), null, 'Staff account menu must not have home item');
    } finally {
      await view.close();
    }
  }

  // Legal check
  {
    const legalUser = { id: 'legal-1', fullName: 'Legal Officer', roles: ['LEGAL_VERIFIER'] };
    const legalSession = { accessToken: 'legal-token', expiresAt: Date.now() + 3600000, user: legalUser };
    const view = await mount(AppShell, {
      role: 'LEGAL',
      user: legalUser,
      session: legalSession,
      isAuthenticated: true,
      lang: 'en',
      currentTab: 'death-verification',
    });
    try {
      assert.equal(view.host.querySelector('.lv-header-home-btn'), null, 'Legal header must not have home button');
      await act(async () => view.host.querySelector('.lv-user-badge-card').click());
      assert.equal(view.host.querySelector('.lv-account-menu-item--home'), null, 'Legal account menu must not have home item');
    } finally {
      await view.close();
    }
  }
});

test('App home navigation preserves authenticated session and landing language', async () => {
  const App = await component('src/App.jsx');
  const previous = globalThis.fetch;
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Owner', email: 'owner@example.test', roles: ['VAULT_OWNER'] };
  storeSession(createSession({ accessToken: 'isolated-fixture', tokenType: 'Bearer', expiresInSeconds: 3600, user }));
  window.history.replaceState({}, '', '/account/profile?lang=en');
  globalThis.fetch = async () => new Response(JSON.stringify(user), { headers: { 'Content-Type': 'application/json' } });
  let view;
  try {
    view = await mount(App);
    const home = view.host.querySelector('.lv-header-home-btn'); assert.ok(home);
    await act(async () => home.click());
    assert.equal(window.location.pathname, '/'); assert.equal(new URLSearchParams(window.location.search).get('lang'), 'en');
    assert.match(view.host.querySelector('h1').textContent, /A lifetime of stories/);
    assert.equal(readStoredSession().accessToken, 'isolated-fixture');
  } finally { if (view) await view.close(); storeSession(null); globalThis.fetch = previous; }
});
