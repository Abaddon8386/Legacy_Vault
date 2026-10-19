import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolvePostLoginRoute } from './staffLegalDocumentsValidation.js';
import { createSession, storeSession } from './session.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/login' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Beneficiary Test', email: 'beneficiary@example.test', roles: ['BENEFICIARY'] };
async function component(entry, stubLogin = false) {
  const result = await build({ configFile: false, plugins: [react(), ...(stubLogin ? [{ name: 'beneficiary-auth-test', load(id) {
    if (id.replaceAll('\\', '/').endsWith('/pages/auth/LoginPage.jsx')) return `import React from 'react'; export default function Login({onAuthenticated}) { return React.createElement('button',{onClick:()=>onAuthenticated({accessToken:'synthetic-login',tokenType:'Bearer',expiresInSeconds:3600,user:globalThis.__beneficiaryUser},{lang:'vi'})},'Test sign in'); }`;
  } }] : [])], logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const App = await component('src/App.jsx', true);
const Login = await component('src/pages/auth/LoginPage.jsx');
async function mount(Component) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); storeSession(null); } };
}
test('Beneficiary routing retains existing role precedence', () => {
  for (const [roles, route] of [[['BENEFICIARY'], '/beneficiary'], [['BENEFICIARY','VAULT_OWNER'], '/vault'], [['BENEFICIARY','LEGAL_VERIFIER'], '/legal/death-verification'], [['BENEFICIARY','STAFF_EXECUTOR'], '/staff/legal-documents']]) assert.equal(resolvePostLoginRoute({ roles }), route);
});
test('real login has home link in both languages', async () => {
  const view = await mount(Login);
  try {
    assert.equal(view.host.querySelector('.hn-login-back-home').getAttribute('href'), '/');
    assert.match(view.host.querySelector('.hn-login-back-home').textContent, /Về trang chủ/);
    const english = [...view.host.querySelectorAll('button')].find(button => button.textContent === 'English');
    await act(async () => english.click());
    assert.match(view.host.querySelector('.hn-login-back-home').textContent, /Back to home/);
  } finally { await view.close(); }
});
for (const accountRole of ['BENEFICIARY', 'ADMIN']) test(`${accountRole} signs in to correct destination, profile return and logout work without Owner APIs`, async () => {
  storeSession(null); window.history.replaceState({}, '', '/login');
  const currentUser = { ...user, roles: [accountRole] };
  const destination = accountRole === 'ADMIN' ? '/admin' : '/beneficiary';
  const heading = accountRole === 'ADMIN' ? '#admin-home-title' : '#beneficiary-home-title';
  const menuLabel = accountRole === 'ADMIN' ? 'Tổng quan quản trị' : 'Thông tin thụ hưởng';
  globalThis.__beneficiaryUser = currentUser;
  const originalFetch = globalThis.fetch; const urls = [];
  globalThis.fetch = async url => { urls.push(url); return new Response(JSON.stringify(currentUser), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  const view = await mount(App);
  try {
    await act(async () => view.host.querySelector('button').click());
    assert.equal(window.location.pathname, destination);
    assert.ok(view.host.querySelector(heading));
    const nav = view.host.querySelector('.lv-sidebar-nav');
    assert.ok(!nav.textContent.includes('Kho di sản số'));
    await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.includes('Xem hồ sơ tài khoản')).click());
    assert.equal(window.location.pathname, '/account/profile');
    assert.ok(!view.host.querySelector('.lv-sidebar-nav').textContent.includes('Kho di sản số'));
    await act(async () => [...view.host.querySelectorAll('.lv-nav-item')].find(button => button.textContent.includes(menuLabel)).click());
    assert.equal(window.location.pathname, destination);
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    await act(async () => view.host.querySelector('.lv-account-menu-item--logout').click());
    assert.equal(window.location.pathname, '/login');
    assert.ok(urls.every(url => url.endsWith('/auth/me')));
  } finally { await view.close(); globalThis.fetch = originalFetch; delete globalThis.__beneficiaryUser; }
});
for (const targetRole of ['BENEFICIARY', 'ADMIN']) for (const roles of [null, ['VAULT_OWNER'], ['STAFF_EXECUTOR'], ['LEGAL_VERIFIER'], [targetRole === 'ADMIN' ? 'BENEFICIARY' : 'ADMIN']]) test(`${targetRole} direct route rejects ${roles || 'anonymous'} even with preview`, async () => {
  window.history.replaceState({}, '', (targetRole === 'ADMIN' ? '/admin' : '/beneficiary') + '?preview=true');
  const originalFetch = globalThis.fetch;
  if (roles) { storeSession(createSession({ accessToken: 'synthetic-guard', tokenType: 'Bearer', expiresInSeconds: 3600, user: { ...user, roles } })); }
  globalThis.fetch = async () => new Response(JSON.stringify({ ...user, roles }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const view = await mount(App);
  try {
    assert.equal(view.host.querySelector(targetRole === 'ADMIN' ? '#admin-home-title' : '#beneficiary-home-title'), null);
    assert.match(view.host.textContent, roles ? (targetRole === 'ADMIN' ? /Trang này dành cho tài khoản quản trị viên/ : /Trang này dành cho tài khoản người thụ hưởng/) : /Test sign in/);
  } finally { await view.close(); globalThis.fetch = originalFetch; }
});
