import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { validateRecoveryEmail, recoveryErrorKey, validateRecoveryPassword } from './passwordRecoveryValidation.js';
import { readRecoveryCredential, requestPasswordRecovery, resetRecoveredPassword } from './passwordRecoveryService.js';
import { validatePasswordFields } from './registrationValidation.js';
import { passwordRecoveryI18n } from '../pages/auth/passwordRecoveryI18n.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/forgot-password' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
async function component(entry) {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Page = await component('src/pages/auth/PasswordRecoveryPage.jsx');
const App = await component('src/App.jsx');
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, render: async props => { await act(async () => root.render(React.createElement(Component, props))); },
    close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function change(host, field, value) {
  const input = host.querySelector(`#recovery-${field}`);
  const key = Object.keys(input).find(key => key.startsWith('__reactProps$'));
  await act(async () => { input[key].onChange({ target: { value } }); });
}
async function submit(host) {
  await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); });
}

test('email boundaries and shared registration password policy apply without trimming passwords', () => {
  assert.ok(validateRecoveryEmail('').email);
  assert.ok(validateRecoveryEmail('invalid').email);
  assert.ok(validateRecoveryEmail('a'.repeat(255) + '@example.test').email);
  assert.deepEqual(validateRecoveryEmail(' test@example.test '), {});
  assert.ok(validatePasswordFields({ password: '1234567', confirmPassword: '1234567' }).password);
  assert.ok(validatePasswordFields({ password: 'a'.repeat(73), confirmPassword: 'a'.repeat(73) }).password);
  assert.ok(validatePasswordFields({ password: '12345678', confirmPassword: '12345679' }).confirmPassword);
  assert.deepEqual(validatePasswordFields({ password: ' pass123 ', confirmPassword: ' pass123 ' }), {});
  assert.deepEqual(Object.keys(passwordRecoveryI18n.vi).sort(), Object.keys(passwordRecoveryI18n.en).sort());
});

test('invalid email focuses its field; switching language retains input and translates errors', async () => {
  let calls = 0;
  const view = await mount(Page, { onRequestRecovery: async () => calls++ });
  try {
    assert.equal(document.activeElement, view.host.querySelector('h1'));
    await change(view.host, 'email', 'bad-email'); await submit(view.host);
    assert.equal(calls, 0); assert.equal(document.activeElement.id, 'recovery-email');
    assert.match(view.host.querySelector('[role=alert]').textContent, /định dạng/);
    await act(async () => view.host.querySelectorAll('.lv-recovery-languages button')[1].click());
    assert.equal(view.host.querySelector('input').value, 'bad-email');
    assert.match(view.host.querySelector('[role=alert]').textContent, /valid email/);
  } finally { await view.close(); }
});

test('request submits once, passes abort signal and shows only a neutral acknowledgement', async () => {
  let finish, calls = 0, submitted;
  const view = await mount(Page, { initialLang: 'en', onRequestRecovery: (data, options) => {
    calls++; submitted = { data, options }; return new Promise(resolve => { finish = resolve; });
  } });
  try {
    await change(view.host, 'email', ' test@example.test '); await submit(view.host); await submit(view.host);
    assert.equal(calls, 1); assert.deepEqual(submitted.data, { email: 'test@example.test' });
    assert.ok(submitted.options.signal); assert.equal(view.host.querySelector('input').disabled, true);
    assert.match(view.host.querySelector('[role=status]').textContent, /Processing/);
    await act(async () => finish({ accountExists: false, message: 'PRIVATE PROVIDER RESPONSE' }));
    assert.match(view.host.textContent, /If the account is eligible/);
    assert.doesNotMatch(view.host.textContent, /test@example|PRIVATE PROVIDER RESPONSE|accountExists/);
  } finally { await view.close(); }
});

test('network, account-type and provider errors do not leak details or claim success; retries remain possible', async () => {
  for (const code of ['NETWORK_ERROR', 'PROVIDER_ERROR', 'GOOGLE_ONLY', 'ACCOUNT_NOT_FOUND', 'LOCKED']) {
    const view = await mount(Page, { initialLang: 'en', onRequestRecovery: async () => { throw { code, message: 'sensitive account details' }; } });
    try {
      await change(view.host, 'email', 'test@example.test'); await submit(view.host);
      assert.equal(view.host.querySelector('[role=alert]').textContent, passwordRecoveryI18n.en.requestError);
      assert.equal(view.host.querySelector('button[type=submit]').disabled, false);
      assert.equal(view.host.querySelector('input').value, 'test@example.test');
      assert.doesNotMatch(view.host.textContent, /sensitive|If the account is eligible/);
    } finally { await view.close(); }
  }
  assert.equal(recoveryErrorKey({ status: 429 }), 'rateLimited');
});

test('reset rejects mismatched passwords; successful handler receives the exact password without creating a session', async () => {
  let received;
  const before = window.sessionStorage.length;
  const view = await mount(Page, { mode: 'reset', initialLang: 'en', onResetPassword: async data => { received = data; } });
  try {
    await change(view.host, 'password', ' pass123 '); await change(view.host, 'confirmPassword', 'mismatch'); await submit(view.host);
    assert.equal(received, undefined); assert.match(view.host.textContent, /do not match/);
    await change(view.host, 'confirmPassword', ' pass123 '); await submit(view.host);
    assert.deepEqual(received, { password: ' pass123 ' });
    assert.match(view.host.textContent, /password has been reset/);
    assert.equal(view.host.querySelector('input'), null); assert.equal(window.sessionStorage.length, before);
  } finally { await view.close(); }
});

test('invalid recovery clears secrets and stays blocked even after editing; rate limiting stays an error', async () => {
  const props = { mode: 'reset', initialLang: 'en', onResetPassword: async () => { throw { code: 'RECOVERY_INVALID' }; } };
  const view = await mount(Page, props);
  try {
    await change(view.host, 'password', 'password1'); await change(view.host, 'confirmPassword', 'password1'); await submit(view.host);
    assert.equal(view.host.querySelector('input').value, '');
    assert.match(view.host.textContent, /no longer valid/);
    await change(view.host, 'password', 'password2');
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    assert.ok(view.host.querySelector('a[href="/forgot-password?lang=en"]'));
  } finally { await view.close(); }
  const limited = await mount(Page, { initialLang:'en', onRequestRecovery:async()=>{ throw {status:429}; } });
  try { await change(limited.host,'email','test@example.test'); await submit(limited.host); assert.match(limited.host.querySelector('[role=alert]').textContent,/Too many requests/); }
  finally { await limited.close(); }
});

test('leaving request/reset aborts pending work and ignores a late result', async () => {
  let finish, signal;
  const view = await mount(Page, { onRequestRecovery: (_data, options) => {
    signal = options.signal; return new Promise(resolve => { finish = resolve; });
  } });
  await change(view.host, 'email', 'test@example.test'); await submit(view.host);
  await view.render({ mode: 'reset', initialLang: 'en' });
  assert.equal(signal.aborted, true);
  await act(async () => finish());
  assert.match(view.host.textContent, /Complete recovery verification/);
  assert.doesNotMatch(view.host.textContent, /If the account is eligible/);
  await view.close();
});

test('actual App routes enable requests but block reset without credential; never submit on GET', async () => {
  for (const path of ['/forgot-password?lang=en', '/reset-password?lang=en']) {
    window.history.replaceState({}, '', path);
    let calls = 0; const originalFetch = globalThis.fetch;
    globalThis.fetch = async () => { calls++; throw Error('No recovery endpoint should be called'); };
    const view = await mount(App, {});
    try {
      assert.ok(view.host.querySelector('.lv-password-recovery-page'));
      assert.equal(view.host.querySelector('button[type=submit]').disabled, path.startsWith('/reset-password'));
      assert.equal(calls, 0); assert.equal(window.sessionStorage.length, 0);
      assert.doesNotMatch(view.host.textContent, /If the account is eligible|password has been reset/);
    } finally { await view.close(); globalThis.fetch = originalFetch; }
  }
  window.history.replaceState({}, '', '/login?lang=en');
  const view = await mount(App, {});
  try {
    const link = view.host.querySelector('a.hn-login-forgot-password');
    assert.equal(link.textContent, 'Forgot password?');
    await act(async () => link.click());
    assert.equal(window.location.pathname, '/forgot-password');
    assert.match(view.host.querySelector('h1').textContent, /Forgot your password/);
    await act(async () => view.host.querySelector('a[href="/login?lang=en"]').click());
    assert.ok(view.host.querySelector('.hn-login-page'));
  } finally { await view.close(); }
});

const credential = 'A'.repeat(43);
test('recovery adapters use public POSTs, exact bodies/statuses and no JWT; reset accepts empty 204', async () => {
  const controller = new AbortController();
  let captured;
  const fetchFn = async (url, options) => { captured = { url, ...options }; return new Response(JSON.stringify({ messageKey: 'auth.recovery.requestAccepted' }), { status: 202 }); };
  await requestPasswordRecovery({ email: 'a@example.test' }, { lang: 'en', signal: controller.signal, fetchFn });
  assert.match(captured.url, /\/auth\/password-recovery\/requests$/);
  assert.deepEqual(JSON.parse(captured.body), { email: 'a@example.test', locale: 'en' });
  assert.equal(captured.headers.Authorization, undefined);
  assert.equal(captured.signal, controller.signal);
  assert.equal(captured.cache, 'no-store');
  await resetRecoveredPassword(credential, { password: ' pass123 ' }, { fetchFn: async (url, options) => {
    assert.match(url, /\/password-recovery\/reset$/);
    assert.deepEqual(JSON.parse(options.body), { credential, password: ' pass123 ' });
    return new Response(null, { status: 204 });
  } });
  for (const [status, code] of [[400, 'RECOVERY_INVALID'], [429, 'RATE_LIMITED'], [503, 'RECOVERY_UNAVAILABLE']]) {
    await assert.rejects(requestPasswordRecovery({ email: 'a@example.test' }, { fetchFn: async () => new Response(JSON.stringify({ code }), { status }) }), error => error.code === code && error.status === status);
  }
  await assert.rejects(requestPasswordRecovery({ email: 'a@example.test' }, { fetchFn: async () => new Response('{}', { status: 200 }) }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(resetRecoveredPassword(credential, { password: 'password1' }, { fetchFn: async () => new Response(JSON.stringify({code:'VALIDATION_FAILED', errors:[{field:'password'}]}), {status:400}) }), {code:'PASSWORD_POLICY'});
});

test('credential parsing and reset policy follow PS-112 without storing or trimming secrets', () => {
  assert.equal(readRecoveryCredential(`#token=${credential}`), credential);
  for (const hash of ['', '#token=bad', `#token=${credential}&token=${credential}`, '#token=' + 'B'.repeat(43)]) assert.equal(readRecoveryCredential(hash), null);
  for (const password of [' '.repeat(8), 'é'.repeat(37), 'a'.repeat(8) + '\0', 'a'.repeat(8) + '\uD800']) assert.ok(validateRecoveryPassword({password,confirmPassword:password}, 'en').password);
  assert.deepEqual(validateRecoveryPassword({password:' pass123 ',confirmPassword:' pass123 '}, 'en'), {});
});

test('actual App captures fragment, removes it immediately and resets via API before clearing session and going to login', async () => {
  window.history.replaceState({}, '', `/reset-password?lang=en#token=${credential}`);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (url, options) => {
    calls++;
    assert.match(url, /\/password-recovery\/reset$/);
    assert.deepEqual(JSON.parse(options.body), {credential,password:'password1'});
    assert.equal(options.headers.Authorization, undefined);
    return new Response(null, {status:204});
  };
  const view = await mount(App, {});
  try {
    assert.equal(window.location.hash, ''); assert.equal(calls, 0);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, false);
    assert.doesNotMatch(JSON.stringify({...window.sessionStorage,...window.localStorage}), /AAAAAAAA/);
    await change(view.host,'password','password1'); await change(view.host,'confirmPassword','password1');
    window.sessionStorage.setItem('legacyvault.session.v1', 'stale-session');
    await submit(view.host);
    assert.equal(calls, 1); assert.equal(window.sessionStorage.getItem('legacyvault.session.v1'), null);
    assert.equal(window.location.pathname, '/login'); assert.equal(window.location.search, '?lang=en');
  } finally { await view.close(); globalThis.fetch = originalFetch; }
});
