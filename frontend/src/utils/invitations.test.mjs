import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, storeSession, readStoredSession } from './session.js';
import { invitationMessages } from '../components/invitations/invitationMessages.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/invitations?lang=en' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };
async function component(entry) {
  const output = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(output) ? output[0] : output).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Claim = await component('src/pages/beneficiary/InvitationPage.jsx');
const Code = await component('src/components/invitations/BeneficiaryInvitationCode.jsx');
const People = await component('src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx');
const App = await component('src/App.jsx');
const Shell = await component('src/components/layout/AppShell.jsx');
const vaultId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const beneficiaryId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const user = { id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', fullName: 'Test account', email: 'account@example.test', roles: ['VAULT_OWNER'] };
const linkedUser = { ...user, roles: ['VAULT_OWNER', 'BENEFICIARY'] };
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const page = content => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });
const validCodeView = (code, id = beneficiaryId) => ({ vaultId, beneficiaryId: id, state: 'available', code });
const claimProps = { user, lang: 'en', onAcceptInvitation: async () => {}, onRefreshAccount: async () => linkedUser };
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, render: async props => { await act(async () => root.render(React.createElement(Component, props))); },
    close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
async function change(host, selector, value) {
  const field = host.querySelector(selector); assert.ok(field, selector);
  const key = Object.keys(field).find(key => key.startsWith('__reactProps$'));
  await act(async () => { field[key].onChange({ target: { value } }); });
}
async function submit(host) { await act(async () => { host.querySelector('form').dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true })); }); }
async function click(host, text) { const button = [...host.querySelectorAll('button,a')].find(item => item.textContent.trim() === text); assert.ok(button, text); await act(async () => button.click()); }

test('VI/EN dictionaries match and unavailable invitation operations do not fabricate codes or linking', async () => {
  assert.deepEqual(Object.keys(invitationMessages.vi).sort(), Object.keys(invitationMessages.en).sort());
  const view = await mount(Claim, { user, lang: 'vi' });
  try {
    assert.match(view.host.textContent, /hiện chưa khả dụng/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await change(view.host, '#invitation-code', 'Input only'); await submit(view.host);
    assert.doesNotMatch(view.host.textContent, /đã được liên kết/);
    assert.deepEqual(user.roles, ['VAULT_OWNER']);
  } finally { await view.close(); }
  const code = await mount(Code, { vaultId, beneficiaryId, lang: 'en' });
  try { assert.match(code.host.textContent, /currently unavailable/); assert.equal(code.host.querySelector('code'), null); }
  finally { await code.close(); }
});

test('anonymous code entry is not authentication and retains the exact code only for explicit login/register intent', async () => {
  const calls = []; const view = await mount(Claim, { lang: 'en', onAuthenticate: (...args) => calls.push(args) });
  try {
    await click(view.host, 'Sign in to continue'); assert.equal(calls.length, 0);
    assert.equal(document.activeElement.id, 'invitation-code');
    await change(view.host, '#invitation-code', ' exact / code ');
    await click(view.host, 'Sign in to continue'); await click(view.host, 'New here? Register');
    assert.deepEqual(calls, [['login', ' exact / code '], ['register', ' exact / code ']]);
    assert.equal(window.sessionStorage.length, 0); assert.equal(window.localStorage.length, 0);
    assert.doesNotMatch(view.host.textContent, /has been linked/);
  } finally { await view.close(); }
});

test('acceptance ignores returned roles and requires an independent canonical account refresh', async () => {
  let received, confirmed, clears = 0;
  const view = await mount(Claim, { ...claimProps,
    onAcceptInvitation: async data => { received = data; return { roles: ['ADMIN'], linked: true }; },
    onConfirmed: value => { confirmed = value; }, onClearCode: () => clears++ });
  try {
    await change(view.host, '#invitation-code', ' Code+value '); await submit(view.host);
    assert.deepEqual(received, { code: ' Code+value ' }); assert.deepEqual(confirmed, linkedUser);
    assert.equal(clears, 1); assert.equal(view.host.querySelector('input'), null);
    assert.match(view.host.textContent, /beneficiary access confirmed/); assert.doesNotMatch(view.host.textContent, /ADMIN/);
  } finally { await view.close(); }
});

test('accepted invitation with failed role confirmation retries refresh only, never consumes the code again', async () => {
  let accepts = 0, reads = 0, confirmed = 0;
  const view = await mount(Claim, { ...claimProps, onAcceptInvitation: async () => accepts++,
    onRefreshAccount: async () => ++reads === 1 ? user : linkedUser, onConfirmed: () => confirmed++ });
  try {
    await change(view.host, '#invitation-code', 'One-use input'); await submit(view.host);
    assert.equal(confirmed, 0); assert.match(view.host.textContent, /without submitting the code again/);
    assert.equal(view.host.querySelector('input').value, '');
    await submit(view.host); assert.equal(accepts, 1); assert.equal(reads, 2); assert.equal(confirmed, 1);
  } finally { await view.close(); }
});

test('a different account or lost existing roles cannot confirm beneficiary access', async () => {
  for (const value of [{ ...linkedUser, id: beneficiaryId }, { ...linkedUser, roles: ['BENEFICIARY'] }]) {
    let confirmed = 0; const view = await mount(Claim, { ...claimProps, onRefreshAccount: async () => value, onConfirmed: () => confirmed++ });
    try { await change(view.host, '#invitation-code', 'Input'); await submit(view.host); assert.equal(confirmed, 0); assert.match(view.host.textContent, /could not be confirmed/); }
    finally { await view.close(); }
  }
});

test('invalid, expired, used, revoked, identity and rate-limit failures are localized without leaking server details', async () => {
  for (const [code, expected] of [['INVITATION_INVALID', 'invalid'], ['INVITATION_EXPIRED', 'expired'], ['INVITATION_USED', 'already been used'], ['INVITATION_REVOKED', 'no longer valid'], ['INVITATION_IDENTITY_MISMATCH', 'could not be linked'], ['RATE_LIMITED', 'Too many']]) {
    let reads = 0;
    const view = await mount(Claim, { ...claimProps, onAcceptInvitation: async () => { throw { code, message: 'PRIVATE SERVER DETAILS' }; }, onRefreshAccount: async () => { reads++; return linkedUser; } });
    try {
      await change(view.host, '#invitation-code', 'Input'); await submit(view.host);
      assert.ok(view.host.querySelector('[role=alert]').textContent.includes(expected));
      assert.doesNotMatch(view.host.textContent, /PRIVATE SERVER DETAILS|access confirmed/); assert.equal(reads, 0);
    } finally { await view.close(); }
  }
});

test('duplicate invitation submits are blocked and unmount aborts a late acceptance', async () => {
  let finish, signal, calls = 0, reads = 0;
  const view = await mount(Claim, { ...claimProps, onAcceptInvitation: (_data, options) => { calls++; signal = options.signal; return new Promise(resolve => { finish = resolve; }); }, onRefreshAccount: async () => { reads++; return linkedUser; } });
  await change(view.host, '#invitation-code', 'Input'); await submit(view.host); await submit(view.host);
  assert.equal(calls, 1); await view.close(); assert.equal(signal.aborted, true);
  await act(async () => finish()); assert.equal(reads, 0);
});

test('owner code is matched to the beneficiary and clipboard copies only the verified code on request', async () => {
  const copied = [];
  Object.defineProperty(navigator, 'clipboard', { value: { writeText: async value => copied.push(value) }, configurable: true });
  const view = await mount(Code, { vaultId, beneficiaryId, lang: 'en', loadInvitation: async () => validCodeView('Opaque / code') });
  try {
    assert.equal(copied.length, 0); assert.equal(view.host.querySelector('code').textContent, 'Opaque / code');
    await click(view.host, 'Copy code'); assert.deepEqual(copied, ['Opaque / code']);
    assert.match(view.host.textContent, /Code copied/);
  } finally { await view.close(); }
});

test('a code response for another beneficiary is rejected; unavailable clipboard does not claim copying', async () => {
  const wrong = await mount(Code, { vaultId, beneficiaryId, lang: 'en', loadInvitation: async () => validCodeView('Wrong secret', user.id) });
  try { assert.equal(wrong.host.querySelector('code'), null); assert.doesNotMatch(wrong.host.textContent, /Wrong secret/); assert.ok(wrong.host.querySelector('[role=alert]')); }
  finally { await wrong.close(); }
  Object.defineProperty(navigator, 'clipboard', { value: {}, configurable: true });
  const view = await mount(Code, { vaultId, beneficiaryId, lang: 'en', loadInvitation: async () => validCodeView('Code') });
  try { await click(view.host, 'Copy code'); assert.match(view.host.querySelector('[role=alert]').textContent, /Unable to copy/); }
  finally { await view.close(); }
});

test('late owner code cannot appear against another beneficiary', async () => {
  let oldFinish, oldSignal;
  const loadInvitation = ({ beneficiaryId: id }, { signal }) => id === beneficiaryId
    ? new Promise(resolve => { oldFinish = resolve; oldSignal = signal; }) : Promise.resolve(validCodeView('New code', user.id));
  const view = await mount(Code, { vaultId, beneficiaryId, accessToken: 'token', lang: 'en', loadInvitation });
  try {
    await view.render({ vaultId, beneficiaryId: user.id, accessToken: 'token', lang: 'en', loadInvitation });
    assert.equal(oldSignal.aborted, true); await act(async () => oldFinish(validCodeView('Old code')));
    assert.equal(view.host.querySelector('code').textContent, 'New code'); assert.doesNotMatch(view.host.textContent, /Old code/);
  } finally { await view.close(); }
});

test('empty or inactive invitations never expose a copyable code', async () => {
  for (const state of ['empty', 'expired', 'used', 'revoked']) {
    const view = await mount(Code, { vaultId, beneficiaryId, lang: 'en', loadInvitation: async () => ({ ...validCodeView('Must not display'), state }) });
    try { assert.equal(view.host.querySelector('code'), null); assert.doesNotMatch(view.host.textContent, /Must not display/); }
    finally { await view.close(); }
  }
});

test('beneficiary creation succeeds once even when its invitation load fails and retries', async () => {
  const originalFetch = globalThis.fetch; let created = null, creates = 0, codeLoads = 0;
  globalThis.fetch = async (url, options) => {
    if (options?.method === 'POST') {
      creates++; const body = JSON.parse(options.body);
      created = { id: beneficiaryId, vaultId, fullName: body.fullName, status: 'DESIGNATED', hasAccount: false, hasIdentityNumber: false, createdAt: '2026-10-20T00:00:00Z' };
      return json(created, 201);
    }
    if (url.includes('configuration-check')) return json({ vaultId, ready: Boolean(created), beneficiaryCount: created ? 1 : 0, issues: created ? [] : [{ code: 'BENEFICIARY_REQUIRED' }] });
    return json(page(url.includes('beneficiaries') && created ? [created] : []));
  };
  const view = await mount(People, { vaultId, accessToken: 'token', lang: 'en', onLoadInvitation: async () => { if (++codeLoads === 1) throw Error('offline'); return validCodeView('Loaded after retry'); } });
  try {
    await change(view.host, '#ben-fullname', 'Saved beneficiary'); await submit(view.host);
    assert.equal(creates, 1); assert.match(view.host.textContent, /Saved beneficiary/);
    assert.match(view.host.textContent, /retrying will not add/);
    await click(view.host, 'Retry loading code'); assert.equal(creates, 1);
    assert.equal(view.host.querySelector('.lv-invitation-code code').textContent, 'Loaded after retry');
  } finally { await view.close(); globalThis.fetch = originalFetch; }
});

test('invitation registration remains blocked on reload and never calls ordinary Owner registration', async () => {
  storeSession(null); window.history.replaceState({}, '', '/register?lang=en&invitation=true');
  let requests = 0; const originalFetch = globalThis.fetch; globalThis.fetch = async () => { requests++; throw Error('Unexpected registration'); };
  const view = await mount(App, {});
  try {
    assert.match(view.host.textContent, /Invitation registration is currently unavailable/);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true); await submit(view.host); assert.equal(requests, 0);
    await click(view.host, 'Leave invitation flow'); assert.equal(view.host.querySelector('button[type=submit]').disabled, false);
    assert.equal(new URLSearchParams(window.location.search).has('invitation'), false);
  } finally { await view.close(); globalThis.fetch = originalFetch; }
});

test('existing-account login preserves invitation intent in memory without placing the code in auth payloads, URLs or storage', async () => {
  storeSession(null); window.history.replaceState({}, '', '/invitations?lang=en');
  const originalFetch = globalThis.fetch; const bodies = [];
  globalThis.fetch = async (url, options) => {
    if (url.endsWith('/auth/login')) { bodies.push(JSON.parse(options.body)); return json({ accessToken: 'test-auth-token', tokenType: 'Bearer', expiresInSeconds: 3600, user }); }
    if (url.endsWith('/auth/me')) return json(user);
    throw Error('Unexpected endpoint');
  };
  const view = await mount(App, {});
  try {
    await change(view.host, '#invitation-code', 'CODE-ONLY-IN-MEMORY'); await click(view.host, 'Sign in to continue');
    await change(view.host, '#hn-login-email', 'account@example.test'); await change(view.host, '#hn-login-password', 'test-password'); await submit(view.host);
    assert.equal(window.location.pathname, '/invitations'); assert.equal(view.host.querySelector('#invitation-code').value, 'CODE-ONLY-IN-MEMORY');
    assert.doesNotMatch(window.location.href, /CODE-ONLY-IN-MEMORY/);
    assert.doesNotMatch(JSON.stringify(bodies), /CODE-ONLY-IN-MEMORY/);
    assert.doesNotMatch(JSON.stringify({ ...window.sessionStorage, ...window.localStorage }), /CODE-ONLY-IN-MEMORY/);
    assert.deepEqual(readStoredSession().user.roles, ['VAULT_OWNER']);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
  } finally { await view.close(); globalThis.fetch = originalFetch; storeSession(null); }
});

test('actual App uses only refreshed server roles and does not force a multi-role account into Owner or beneficiary landing', async () => {
  const session = createSession({ accessToken: 'session-test-token', tokenType: 'Bearer', expiresInSeconds: 3600, user });
  storeSession(session); window.history.replaceState({}, '', '/invitations?lang=en');
  let linked = false, reads = 0; const originalFetch = globalThis.fetch;
  globalThis.fetch = async url => { assert.ok(url.endsWith('/auth/me')); reads++; return json(linked ? linkedUser : user); };
  const view = await mount(App, { invitationActions: { accept: async () => { linked = true; return { roles: ['ADMIN'] }; } } });
  try {
    await change(view.host, '#invitation-code', 'Code'); await submit(view.host);
    assert.equal(reads, 2); assert.deepEqual(readStoredSession().user.roles, ['VAULT_OWNER', 'BENEFICIARY']);
    assert.equal(window.location.pathname, '/invitations'); assert.match(view.host.textContent, /access confirmed/);
    await click(view.host, 'Go to beneficiary page'); assert.equal(window.location.pathname, '/beneficiary');
  } finally { await view.close(); globalThis.fetch = originalFetch; storeSession(null); }
});

test('signed-in accounts have an invitation entry in the existing account widget', async () => {
  const session = createSession({ accessToken: 'session-test-token', tokenType: 'Bearer', expiresInSeconds: 3600, user });
  const view = await mount(Shell, { session, user, role: 'VAULT_OWNER', isAuthenticated: true, lang: 'en', onLogout(){} });
  try {
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    assert.ok(view.host.querySelector('a[href="/invitations?lang=en"]'));
  } finally { await view.close(); }
});
