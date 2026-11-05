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
  const reactModules = ['react', 'react-dom', 'react/jsx-runtime'];
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': String(!production), 'import.meta.env.PROD': String(production) },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: reactModules } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of reactModules) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
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
    assert.equal(view.host.querySelectorAll('#plans article').length, 3);
    await act(async () => view.host.querySelector('.lv-landing-login').click());
    await act(async () => view.host.querySelector('.lv-landing-primary').click());
    assert.equal(login, 1); assert.equal(register, 1);
    assert.equal(view.host.querySelector('.lv-landing-art-footer button'), null);
    await act(async () => view.host.querySelector('.lv-landing-language').click());
    assert.match(view.host.querySelector('h1').textContent, /A lifetime of stories/);
    assert.match(view.host.querySelector('#plans h2').textContent, /One vault/);
  } finally { await view.close(); }
});

test('Landing renders Register button beside Sign in with bilingual text and language preservation', async () => {
  const Landing = await component(false, 'src/pages/landing/LandingPage.jsx');
  let registeredWithLang = null;
  let loggedInWithLang = null;
  const view = await mount(Landing, {
    onLogin: lang => { loggedInWithLang = lang; },
    onRegister: lang => { registeredWithLang = lang; },
  });
  try {
    const registerBtn = view.host.querySelector('.lv-landing-register');
    const loginBtn = view.host.querySelector('.lv-landing-login');
    assert.ok(registerBtn, 'Register button should exist in navbar');
    assert.ok(loginBtn, 'Login button should exist in navbar');
    assert.equal(registerBtn.textContent.trim(), 'Đăng ký');
    assert.match(loginBtn.textContent, /Đăng nhập/);

    await act(async () => registerBtn.click());
    assert.equal(registeredWithLang, 'vi');

    await act(async () => view.host.querySelector('.lv-landing-language').click());
    assert.equal(registerBtn.textContent.trim(), 'Sign up');
    assert.match(loginBtn.textContent, /Sign in/);

    await act(async () => registerBtn.click());
    assert.equal(registeredWithLang, 'en');

    await act(async () => loginBtn.click());
    assert.equal(loggedInWithLang, 'en');
  } finally {
    await view.close();
  }
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
      onRegister: lang => calls.push(['register',lang]), onDashboard: lang => calls.push(['dashboard',lang]),
      onLogin: lang => calls.push(['login',lang]) });
    try {
      await act(async () => view.host.querySelector('.lv-landing-language').click());
      await act(async () => view.host.querySelector('.lv-landing-primary').click());
      await act(async () => view.host.querySelector('.lv-landing-end-cta').click());
      const footerActions = [...view.host.querySelectorAll('.lv-landing-footer-actions button')];
      assert.deepEqual(footerActions.map(button => button.textContent.trim()), authenticated ? ['Dashboard'] : ['Sign in', 'Create an account']);
      for (const button of footerActions) await act(async () => button.click());
      assert.deepEqual(calls, (authenticated ? ['dashboard', 'dashboard', 'dashboard'] : ['register', 'register', 'login', 'register']).map(action => [action, 'en']));
    } finally { await view.close(); }
  }
});

test('the footer groups links by topic and keeps page anchors and language in their destinations', async () => {
  const Landing = await component();
  const view = await mount(Landing);
  try {
    const footer = view.host.querySelector('#site-footer');
    for (const lang of ['vi', 'en']) {
      if (lang === 'en') await act(async () => view.host.querySelector('.lv-landing-language').click());
      const en = lang === 'en';
      const headings = [...footer.querySelectorAll('nav h2')].map(heading => heading.textContent);
      assert.deepEqual(headings, en ? ['Product', 'Resources', 'Security', 'LegacyVault'] : ['Sản phẩm', 'Tài nguyên', 'Bảo mật', 'LegacyVault']);
      const support = `/support?lang=${lang}`;
      const privacy = `/privacy?lang=${lang}`;
      assert.deepEqual([...footer.querySelectorAll('nav a')].map(link => link.getAttribute('href')), [
        '#features', '#how-it-works', '#plans', support, `${support}#faq`, `${support}#beneficiaries`,
        `${privacy}#protection`, `${privacy}#access`, `${privacy}#account-safety`, `/about?lang=${lang}`, `${support}#contact`,
      ]);
      const legal = footer.querySelector('.lv-landing-footer-bottom a');
      assert.equal(legal.getAttribute('href'), privacy);
      assert.equal(legal.textContent, en ? 'Privacy & Security' : 'Điều khoản bảo mật');
      for (const link of footer.querySelectorAll('a[href^="#"]')) {
        assert.ok(view.host.querySelector(link.getAttribute('href')), link.href);
      }
    }
  } finally { await view.close(); }
});

test('support, privacy and about are public routes with working content links', async () => {
  const App = await component(false, 'src/App.jsx');
  const originalUrl = window.location.href;
  try {
    window.history.replaceState({}, '', '/support?lang=vi#beneficiaries');
    const support = await mount(App);
    try {
      assert.equal(support.host.querySelector('h1').textContent, 'Trợ giúp và hỗ trợ');
      assert.equal(support.host.querySelector('#beneficiaries h2').textContent, 'Người thụ hưởng');
      assert.equal(support.host.querySelectorAll('details').length, 6);
      assert.ok(support.host.querySelector('a[href="/forgot-password?lang=vi"]'));
      assert.ok(support.host.querySelector('a[href="/privacy?lang=vi"]'));
      for (const link of support.host.querySelectorAll('nav a[href^="#"]')) {
        assert.ok(support.host.querySelector(link.getAttribute('href')), link.href);
      }
    } finally { await support.close(); }

    window.history.replaceState({}, '', '/privacy?lang=en');
    const privacy = await mount(App);
    try {
      assert.equal(privacy.host.querySelector('h1').textContent, 'Privacy & Security');
      assert.match(privacy.host.querySelector('#protection').textContent, /encrypted when stored/);
      assert.match(privacy.host.querySelector('.lv-public-info__notice').textContent, /formal privacy policy is being finalized/);
      assert.ok(privacy.host.querySelector('a[href="/support?lang=en"]'));
      assert.ok(privacy.host.querySelector('a[href="/privacy?lang=vi"]'));
    } finally { await privacy.close(); }

    window.history.replaceState({}, '', '/about?lang=vi');
    const about = await mount(App);
    try {
      assert.equal(about.host.querySelector('h1').textContent, 'Về LegacyVault');
      assert.ok(about.host.querySelector('#handover'));
      assert.ok(about.host.querySelector('a[href="/about?lang=en"]'));
      assert.ok(about.host.querySelector('a[href="/support?lang=vi"]'));
    } finally { await about.close(); }
  } finally {
    window.history.replaceState({}, '', originalUrl);
  }
});
