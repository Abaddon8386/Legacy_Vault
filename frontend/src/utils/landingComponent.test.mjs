import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/subscription?preview=true&scenario=active_basic' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(production = false, entry = 'src/pages/landing/LandingPage.jsx') {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': String(!production), 'import.meta.env.PROD': String(production) },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('Landing renders six decorative 3D faces without playback controls, supports language and navigation', async () => {
  const Landing = await component(false, 'src/pages/landing/LandingPage.jsx');
  let login = 0; let register = 0;
  const view = await mount(Landing, { onLogin: () => login++, onRegister: () => register++ });
  try {
    assert.equal(view.host.querySelectorAll('.lv-landing-face').length, 6);
    assert.match(view.host.querySelector('#plans').textContent, /Các gói đề xuất để tham khảo/);
    await act(async () => view.host.querySelector('.lv-landing-login').click());
    await act(async () => view.host.querySelector('.lv-landing-primary').click());
    assert.equal(login, 1); assert.equal(register, 1);
    assert.equal(view.host.querySelector('.lv-landing-art-footer button'), null);
    await act(async () => view.host.querySelector('.lv-landing-language').click());
    assert.match(view.host.querySelector('h1').textContent, /A lifetime of stories/);
    assert.match(view.host.querySelector('#plans').textContent, /Proposed plans for reference/);
  } finally { await view.close(); }
});

test('Task 26: Homepage authentication states and role-based Dashboard button', async () => {
  const Landing = await component(false, 'src/pages/landing/LandingPage.jsx');

  // 1. Guest (unauthenticated): shows Register & Sign in, no Dashboard button
  {
    const view = await mount(Landing, { session: null, isRestoringSession: false });
    try {
      assert.ok(view.host.querySelector('.lv-landing-register'), 'Guest should see register button');
      assert.ok(view.host.querySelector('.lv-landing-login'), 'Guest should see sign in button');
      assert.equal(view.host.querySelector('.lv-landing-dashboard'), null, 'Guest should not see dashboard button');
      assert.equal(view.host.querySelector('.lv-landing-register').textContent.trim(), 'Đăng ký');
      assert.match(view.host.querySelector('.lv-landing-login').textContent, /Đăng nhập/);
    } finally { await view.close(); }
  }

  // 2. Authenticated Vault Owner: replaces Register & Login with Dashboard button
  {
    let dashboardClickedLang = null;
    const ownerSession = {
      accessToken: 'valid-owner-token',
      expiresAt: Date.now() + 3600000,
      user: { id: 'owner-1', roles: ['VAULT_OWNER'] }
    };
    const view = await mount(Landing, {
      session: ownerSession,
      isRestoringSession: false,
      onDashboard: lang => { dashboardClickedLang = lang; }
    });
    try {
      assert.equal(view.host.querySelector('.lv-landing-register'), null, 'Owner should not see register button');
      assert.equal(view.host.querySelector('.lv-landing-login'), null, 'Owner should not see login button');
      const dashboardBtn = view.host.querySelector('.lv-landing-dashboard');
      assert.ok(dashboardBtn, 'Owner should see dashboard button');
      assert.match(dashboardBtn.textContent, /Bảng điều khiển/);

      await act(async () => dashboardBtn.click());
      assert.equal(dashboardClickedLang, 'vi');

      // Test English translation
      await act(async () => view.host.querySelector('.lv-landing-language').click());
      assert.match(dashboardBtn.textContent, /Dashboard/);
      await act(async () => dashboardBtn.click());
      assert.equal(dashboardClickedLang, 'en');
    } finally { await view.close(); }
  }

  // 3. Authenticated Beneficiary: replaces with Dashboard button
  {
    let dashboardClicked = false;
    const beneficiarySession = {
      accessToken: 'valid-beneficiary-token',
      expiresAt: Date.now() + 3600000,
      user: { id: 'bene-1', roles: ['BENEFICIARY'] }
    };
    const view = await mount(Landing, {
      session: beneficiarySession,
      isRestoringSession: false,
      onDashboard: () => { dashboardClicked = true; }
    });
    try {
      assert.equal(view.host.querySelector('.lv-landing-register'), null);
      assert.equal(view.host.querySelector('.lv-landing-login'), null);
      const dashboardBtn = view.host.querySelector('.lv-landing-dashboard');
      assert.ok(dashboardBtn, 'Beneficiary should see dashboard button');
      await act(async () => dashboardBtn.click());
      assert.equal(dashboardClicked, true);
    } finally { await view.close(); }
  }

  // 4. Pure Staff / Legal: does not get Dashboard button
  {
    const staffSession = {
      accessToken: 'staff-token',
      expiresAt: Date.now() + 3600000,
      user: { id: 'staff-1', roles: ['STAFF_EXECUTOR'] }
    };
    const view = await mount(Landing, { session: staffSession, isRestoringSession: false });
    try {
      assert.equal(view.host.querySelector('.lv-landing-dashboard'), null, 'Pure staff should not see dashboard button');
      assert.ok(view.host.querySelector('.lv-landing-register'), 'Pure staff sees default entrance');
    } finally { await view.close(); }
  }

  // 5. Session restoration in progress: does not display false auth state
  {
    const candidateSession = {
      accessToken: 'candidate-token',
      expiresAt: Date.now() + 3600000,
      user: { id: 'candidate-1', roles: ['VAULT_OWNER'] }
    };
    const view = await mount(Landing, { session: candidateSession, isRestoringSession: true });
    try {
      assert.equal(view.host.querySelector('.lv-landing-dashboard'), null, 'Must not show dashboard while restoring');
      assert.equal(view.host.querySelector('.lv-landing-register'), null, 'Must not show register while restoring');
      assert.equal(view.host.querySelector('.lv-landing-login'), null, 'Must not show login while restoring');
      assert.ok(view.host.querySelector('.lv-landing-auth-loading'), 'Must show loading indicator');
    } finally { await view.close(); }
  }

  // 6. Expired session / logged out: reverts cleanly to Register & Sign in without old identity
  {
    const expiredSession = {
      accessToken: 'expired-token',
      expiresAt: Date.now() - 1000,
      user: { id: 'old-user', roles: ['VAULT_OWNER'] }
    };
    const view = await mount(Landing, { session: expiredSession, isRestoringSession: false });
    try {
      assert.equal(view.host.querySelector('.lv-landing-dashboard'), null, 'Expired session must not see dashboard');
      assert.ok(view.host.querySelector('.lv-landing-register'), 'Expired session reverts to register');
      assert.ok(view.host.querySelector('.lv-landing-login'), 'Expired session reverts to login');
      assert.equal(view.host.textContent.includes('old-user'), false, 'Does not leak old identity');
    } finally { await view.close(); }
  }
});

test('all landing calls to action preserve language and route authenticated users to Dashboard', async () => {
  const Landing = await component();
  for (const authenticated of [false, true]) {
    const calls = [];
    const view = await mount(Landing, { session: authenticated ? { accessToken: 'fixture', expiresAt: Date.now()+60000, user: { id: 'owner', roles: ['VAULT_OWNER'] } } : null,
      onRegister: lang => calls.push(['register',lang]), onDashboard: lang => calls.push(['dashboard',lang]) });
    try {
      await act(async () => view.host.querySelector('.lv-landing-language').click());
      await act(async () => view.host.querySelector('.lv-landing-primary').click());
      await act(async () => view.host.querySelector('.lv-landing-end-cta').click());
      assert.deepEqual(calls, [[authenticated ? 'dashboard':'register','en'],[authenticated ? 'dashboard':'register','en']]);
    } finally { await view.close(); }
  }
});
