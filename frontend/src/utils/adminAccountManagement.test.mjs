import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { changeAdminUserRole, createAdminUser, validateCreateAdminUserForm } from './adminService.js';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/admin' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
// react-dom inspects `document` when it loads, so it must be imported after the globals exist.
const { createRoot } = await import('react-dom/client');

const staffId = '22222222-2222-4222-8222-222222222222';
const adminId = '33333333-3333-4333-8333-333333333333';
const apiUser = (overrides = {}) => ({ publicId: staffId, fullName: 'Nguyen Staff', email: 'staff@example.test',
  roles: ['ROLE_STAFF_EXECUTOR'], createdAt: '2026-11-11T00:00:00Z', status: 'ACTIVE', ...overrides });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const form = { fullName: ' Nguyen Staff ', email: ' Staff@Example.test ', phone: '', password: 'Str0ng-Pass!', role: 'STAFF_EXECUTOR' };

async function loadComponent(entryPath) {
  const entry = resolve(import.meta.dirname, '..', entryPath.replace(/^src\//, ''));
  const result = await build({
    root: resolve(import.meta.dirname, '../..'), configFile: false, plugins: [react()], logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find((item) => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const AdminUsersPage = await loadComponent('src/pages/admin/AdminUsersPage.jsx');

async function mount(props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(AdminUsersPage, props)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const button = (scope, label) => [...scope.querySelectorAll('button')].find((b) => (b.getAttribute('aria-label') || b.textContent).trim() === label);
async function type(input, value) {
  const setter = Object.getOwnPropertyDescriptor(input.constructor.prototype, 'value').set;
  await act(async () => { setter.call(input, value); input._valueTracker?.setValue(''); input.dispatchEvent(new window.Event(input.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); });
}
const inputOf = (scope, name) => scope.querySelector(`input[id$="-${name}"]`);
const usersPage = (content) => ({ content, page: 0, size: 10, totalElements: content.length, totalPages: 1 });

test('create form validation mirrors the backend rules and only allows Staff, Legal and Vault Owner', () => {
  assert.deepEqual(validateCreateAdminUserForm(form), {});
  assert.deepEqual(validateCreateAdminUserForm({}), { fullName: 'required', email: 'required', password: 'required', role: 'required' });
  assert.equal(validateCreateAdminUserForm({ ...form, email: 'nope' }).email, 'invalid');
  assert.equal(validateCreateAdminUserForm({ ...form, phone: '12ab' }).phone, 'invalid');
  assert.equal(validateCreateAdminUserForm({ ...form, password: 'short' }).password, 'invalid');
  assert.equal(validateCreateAdminUserForm({ ...form, password: 'é'.repeat(37) }).password, 'invalid');
  for (const role of ['ADMIN', 'ROLE_ADMIN', 'BENEFICIARY', 'ROOT']) {
    assert.equal(validateCreateAdminUserForm({ ...form, role }).role, 'required');
  }
  assert.deepEqual(validateCreateAdminUserForm({ ...form, role: 'ROLE_LEGAL_VERIFIER' }), {});
});

test('createAdminUser posts the trimmed body with the ROLE_ prefix and never returns the password', async () => {
  const previous = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => { call = { url, options }; return json(apiUser(), 201); };
  try {
    const created = await createAdminUser('T', form);
    assert.match(call.url, /\/admin\/users$/);
    assert.equal(call.options.method, 'POST');
    assert.equal(call.options.headers.Authorization, 'Bearer T');
    assert.deepEqual(JSON.parse(call.options.body), { fullName: 'Nguyen Staff', email: 'Staff@Example.test', phone: '',
      password: 'Str0ng-Pass!', role: 'ROLE_STAFF_EXECUTOR' });
    assert.deepEqual(created.roles, ['STAFF_EXECUTOR']);
    assert.equal(JSON.stringify(created).includes('Str0ng'), false);
    globalThis.fetch = async () => { throw new Error('must not be called'); };
    await assert.rejects(() => createAdminUser('T', { ...form, role: 'ADMIN' }), /VALIDATION_FAILED/);
  } finally { globalThis.fetch = previous; }
});

test('changeAdminUserRole puts the role and rejects non-assignable roles or mismatched responses', async () => {
  const previous = globalThis.fetch;
  let call;
  globalThis.fetch = async (url, options) => { call = { url, options }; return json(apiUser({ roles: ['ROLE_LEGAL_VERIFIER'] })); };
  try {
    const user = await changeAdminUserRole('T', staffId, 'LEGAL_VERIFIER');
    assert.match(call.url, new RegExp(`/admin/users/${staffId}/role$`));
    assert.equal(call.options.method, 'PUT');
    assert.deepEqual(JSON.parse(call.options.body), { role: 'ROLE_LEGAL_VERIFIER' });
    assert.deepEqual(user.roles, ['LEGAL_VERIFIER']);
    await assert.rejects(() => changeAdminUserRole('T', staffId, 'ADMIN'), /VALIDATION_FAILED/);
    await assert.rejects(() => changeAdminUserRole('T', 'not-a-uuid', 'STAFF_EXECUTOR'), /VALIDATION_FAILED/);
    globalThis.fetch = async () => json(apiUser({ publicId: adminId }));
    await assert.rejects(() => changeAdminUserRole('T', staffId, 'STAFF_EXECUTOR'), /INVALID_USER_RECORD/);
  } finally { globalThis.fetch = previous; }
});

test('Admin creates an account from the Users page and the list reloads', async () => {
  const previous = globalThis.fetch;
  let posted = null, listReads = 0;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') { posted = JSON.parse(options.body); return json(apiUser(), 201); }
    listReads++;
    return json(usersPage(listReads === 1 ? [] : [apiUser()]));
  };
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    await act(async () => button(view.host, 'Tạo tài khoản').click());
    const dialog = view.host.querySelector('[role=dialog]');
    assert.ok(dialog);

    await act(async () => button(dialog, 'Tạo tài khoản').click());
    assert.equal(posted, null, 'invalid form is not submitted');
    assert.ok(dialog.querySelectorAll('.lv-admin-field-error').length >= 4);

    await type(inputOf(dialog, 'fullName'), 'Nguyen Staff');
    await type(inputOf(dialog, 'email'), 'staff@example.test');
    await type(inputOf(dialog, 'phone'), '');
    await type(inputOf(dialog, 'password'), 'Str0ng-Pass!');
    await type(inputOf(dialog, 'confirmPassword'), 'different');
    await type(dialog.querySelector('select'), 'STAFF_EXECUTOR');
    await act(async () => button(dialog, 'Tạo tài khoản').click());
    assert.equal(posted, null, 'mismatched confirmation is not submitted');
    assert.equal(dialog.querySelector('[id$="-confirmPassword-error"]').textContent, 'Mật khẩu nhập lại không khớp.');
    await type(inputOf(dialog, 'confirmPassword'), 'Str0ng-Pass!');
    assert.equal(dialog.querySelector('[id$="-confirmPassword-error"]'), null, 'error clears when the field is edited');
    await type(dialog.querySelector('select'), 'STAFF_EXECUTOR');
    await act(async () => button(dialog, 'Tạo tài khoản').click());

    assert.deepEqual(posted, { fullName: 'Nguyen Staff', email: 'staff@example.test', phone: '', password: 'Str0ng-Pass!', role: 'ROLE_STAFF_EXECUTOR' });
    assert.equal(view.host.querySelector('[role=dialog]'), null);
    assert.equal(view.host.querySelector('.lv-admin-form-notice').textContent, 'Đã tạo tài khoản.');
    assert.equal(listReads, 2);
    assert.match(view.host.textContent, /staff@example\.test/);
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('a duplicate email keeps the dialog open with a readable message', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => options.method === 'POST'
    ? json({ code: 'EMAIL_ALREADY_EXISTS' }, 409) : json(usersPage([]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'en' });
  try {
    await act(async () => button(view.host, 'Create account').click());
    const dialog = view.host.querySelector('[role=dialog]');
    await type(inputOf(dialog, 'fullName'), 'Dup');
    await type(inputOf(dialog, 'email'), 'dup@example.test');
    await type(inputOf(dialog, 'password'), 'Str0ng-Pass!');
    await type(inputOf(dialog, 'confirmPassword'), 'Str0ng-Pass!');
    await type(dialog.querySelector('select'), 'LEGAL_VERIFIER');
    await act(async () => button(dialog, 'Create account').click());
    assert.ok(view.host.querySelector('[role=dialog]'));
    assert.equal(view.host.querySelector('.lv-admin-form-error').textContent, 'This email is already registered.');
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('Admin changes a role from the row action; admin accounts offer no role change', async () => {
  const previous = globalThis.fetch;
  let put = null;
  const adminUser = apiUser({ publicId: adminId, fullName: 'Root Admin', email: 'root@example.test', roles: ['ROLE_ADMIN'] });
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') { put = { url, body: JSON.parse(options.body) }; return json(apiUser({ roles: ['ROLE_LEGAL_VERIFIER'] })); }
    return json(usersPage([adminUser, apiUser()]));
  };
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    const rows = [...view.host.querySelectorAll('tbody tr')];
    assert.equal(button(rows[0], 'Đổi vai trò'), undefined);
    await act(async () => button(rows[1], 'Đổi vai trò').click());
    const dialog = view.host.querySelector('[role=dialog]');
    const save = button(dialog, 'Lưu vai trò');
    assert.equal(save.disabled, true, 'unchanged role cannot be saved');
    await type(dialog.querySelector('select'), 'LEGAL_VERIFIER');
    assert.equal(save.disabled, false);
    await act(async () => save.click());
    assert.match(put.url, new RegExp(`/admin/users/${staffId}/role$`));
    assert.deepEqual(put.body, { role: 'ROLE_LEGAL_VERIFIER' });
    assert.equal(view.host.querySelector('[role=dialog]'), null);
    assert.equal(view.host.querySelector('.lv-admin-form-notice').textContent, 'Đã cập nhật vai trò.');
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('create form follows the sign-up layout: red asterisks on required fields only, role select, password toggle', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => json(usersPage([]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    await act(async () => button(view.host, 'Tạo tài khoản').click());
    const dialog = view.host.querySelector('[role=dialog]');
    const marked = [...dialog.querySelectorAll('label')].filter((label) => label.querySelector('.lv-admin-required'))
      .map((label) => label.getAttribute('for').replace(/^.*-/, ''));
    assert.deepEqual(marked, ['fullName', 'email', 'password', 'confirmPassword', 'role']);
    assert.equal(dialog.querySelector('label[for$="-phone"] .lv-admin-required'), null);
    assert.doesNotMatch(dialog.textContent, /bắt buộc|Tùy chọn/i);
    assert.equal(dialog.querySelectorAll('.lv-admin-form-row').length, 2);
    assert.deepEqual([...dialog.querySelectorAll('select option')].map((o) => o.value), ['', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'VAULT_OWNER']);

    assert.equal(inputOf(dialog, 'password').type, 'password');
    await act(async () => dialog.querySelector('.lv-admin-eye-btn').click());
    assert.equal(inputOf(dialog, 'password').type, 'text');
    assert.equal(inputOf(dialog, 'confirmPassword').type, 'text');
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('row icons show an open padlock for unlocked accounts and a closed one for locked accounts', async () => {
  const previous = globalThis.fetch;
  const locked = apiUser({ publicId: adminId, fullName: 'Locked User', email: 'locked@example.test', status: 'LOCKED' });
  globalThis.fetch = async () => json(usersPage([apiUser(), locked]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    const [activeRow, lockedRow] = [...view.host.querySelectorAll('tbody tr')];
    const icon = (row, label) => button(row, label).querySelector('svg').getAttribute('class');
    assert.match(icon(activeRow, 'Khóa tài khoản'), /lucide-lock-open/);
    assert.match(icon(lockedRow, 'Mở khóa tài khoản'), /lucide-lock(?!-open)/);
    assert.match(button(activeRow, 'Xem chi tiết').querySelector('svg').getAttribute('class'), /lucide-eye/);
    assert.match(button(view.host, 'Tạo tài khoản').querySelector('svg').getAttribute('class'), /lucide-plus/);
    assert.equal(button(lockedRow, 'Đổi vai trò').disabled, true);
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('Admin locks an account with a reason and unlocks it again from the lock icon', async () => {
  const previous = globalThis.fetch;
  const posts = [];
  let state = 'ACTIVE';
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'POST') {
      posts.push({ url, body: options.body ? JSON.parse(options.body) : null });
      state = url.endsWith('/lock') ? 'LOCKED' : 'ACTIVE';
      return json(apiUser({ status: state }));
    }
    return json(usersPage([apiUser({ status: state })]));
  };
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    await act(async () => button(view.host.querySelector('tbody tr'), 'Khóa tài khoản').click());
    let dialog = view.host.querySelector('[role=dialog]');
    assert.match(dialog.textContent, /đăng xuất khỏi mọi thiết bị/);
    assert.equal(posts.length, 0, 'nothing is sent before confirmation');
    await type(dialog.querySelector('textarea'), '  Nghi ngờ truy cập trái phép ');
    await act(async () => button(dialog, 'Khóa tài khoản').click());

    assert.equal(posts.length, 1);
    assert.match(posts[0].url, new RegExp(`/admin/users/${staffId}/lock$`));
    assert.deepEqual(posts[0].body, { reason: 'Nghi ngờ truy cập trái phép' });
    assert.equal(view.host.querySelector('[role=dialog]'), null);
    assert.equal(view.host.querySelector('.lv-admin-form-notice').textContent, 'Đã khóa tài khoản.');
    assert.ok(button(view.host.querySelector('tbody tr'), 'Mở khóa tài khoản'), 'row now offers unlock');

    await act(async () => button(view.host.querySelector('tbody tr'), 'Mở khóa tài khoản').click());
    dialog = view.host.querySelector('[role=dialog]');
    assert.equal(dialog.querySelector('textarea'), null, 'no reason is asked when unlocking');
    await act(async () => button(dialog, 'Mở khóa').click());
    assert.match(posts[1].url, new RegExp(`/admin/users/${staffId}/unlock$`));
    assert.equal(posts[1].body, null);
    assert.equal(view.host.querySelector('.lv-admin-form-notice').textContent, 'Đã mở khóa tài khoản.');
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('a rejected lock keeps the dialog open with the reason, and admin accounts have no lock icon', async () => {
  const previous = globalThis.fetch;
  const adminUser = apiUser({ publicId: adminId, roles: ['ROLE_ADMIN'], fullName: 'Root', email: 'root@example.test' });
  globalThis.fetch = async (url, options = {}) => options.method === 'POST'
    ? json({ code: 'ADMIN_ACCOUNT_PROTECTED' }, 409) : json(usersPage([apiUser(), adminUser]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'en' });
  try {
    const [staffRow, adminRow] = [...view.host.querySelectorAll('tbody tr')];
    assert.equal(button(adminRow, 'Lock account'), undefined);
    assert.equal(button(adminRow, 'Unlock account'), undefined);
    await act(async () => button(staffRow, 'Lock account').click());
    const dialog = view.host.querySelector('[role=dialog]');
    await act(async () => button(dialog, 'Lock account').click());
    assert.ok(view.host.querySelector('[role=dialog]'));
    assert.match(view.host.querySelector('.lv-admin-form-error').textContent, /cannot have its role changed or be locked/);
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('password check mirrors the backend policy: blank, NUL and unpaired surrogates are refused', () => {
  for (const password of ['        ', 'abc\u0000defgh', 'abcdefg\ud800', 'abcdefg\udc00x', 'a'.repeat(73)]) {
    assert.equal(validateCreateAdminUserForm({ ...form, password }).password, 'invalid', JSON.stringify(password));
  }
  assert.equal(validateCreateAdminUserForm({ ...form, password: 'ok pass 😀' }).password, undefined, 'valid pairs and spaces are fine');
});

test('a server-side password rejection is explained next to the password field, not as a generic error', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => options.method === 'POST'
    ? json({ code: 'VALIDATION_FAILED', errors: [{ field: 'password', code: 'VALID_PASSWORD' }] }, 400)
    : json(usersPage([]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    await act(async () => button(view.host, 'Tạo tài khoản').click());
    const dialog = view.host.querySelector('[role=dialog]');
    await type(inputOf(dialog, 'fullName'), 'Weak Pass');
    await type(inputOf(dialog, 'email'), 'weak@example.test');
    await type(inputOf(dialog, 'password'), 'Str0ng-Pass!');
    await type(inputOf(dialog, 'confirmPassword'), 'Str0ng-Pass!');
    await type(dialog.querySelector('select'), 'STAFF_EXECUTOR');
    await act(async () => button(dialog, 'Tạo tài khoản').click());
    assert.equal(dialog.querySelector('[id$="-password-error"]').textContent, 'Mật khẩu phải từ 8 đến 72 ký tự.');
    assert.equal(dialog.querySelector('.lv-admin-form-error'), null, 'no generic banner when the field is known');
  } finally { await view.close(); globalThis.fetch = previous; }
});

test('statuses follow accountStatus; rows that are in a case or whose vault is archived offer no lock or role change', async () => {
  const previous = globalThis.fetch;
  const rows = [
    apiUser({ publicId: '41111111-1111-4111-8111-111111111111', email: 'active@example.test', status: 'ACTIVE', accountStatus: 'ACTIVE' }),
    apiUser({ publicId: '42222222-2222-4222-8222-222222222222', email: 'locked@example.test', status: 'LOCKED', accountStatus: 'LOCKED' }),
    apiUser({ publicId: '43333333-3333-4333-8333-333333333333', email: 'process@example.test', status: 'ACTIVE', accountStatus: 'IN_PROCESS' }),
    apiUser({ publicId: '44444444-4444-4444-8444-444444444444', email: 'archived@example.test', roles: ['ROLE_VAULT_OWNER'],
      status: 'ACTIVE', accountStatus: 'ACTIVE', vaultStatus: 'ARCHIVED' }),
  ];
  globalThis.fetch = async () => json(usersPage(rows));
  for (const [lang, labels, lockLabel] of [
    ['vi', ['Hoạt động', 'Đã khóa', 'Đang xử lý', 'Hoạt động'], 'Khóa tài khoản'],
    ['en', ['Active', 'Locked', 'In process', 'Active'], 'Lock account'],
  ]) {
    const view = await mount({ accessToken: 'T', fetchOnMount: true, lang });
    try {
      const trs = [...view.host.querySelectorAll('tbody tr')];
      assert.deepEqual(trs.map((tr) => tr.querySelector('td:nth-child(5) .lv-admin-status-badge').textContent.trim()), labels);
      assert.deepEqual(trs.map((tr) => tr.querySelector('td:nth-child(5) .lv-admin-status-badge').className.match(/lv-admin-status-(?!badge)(\S+)/)[1]),
        ['active', 'locked', 'in_process', 'active']);
      // In-case and archived-vault rows only have the view button: no lock/unlock, no role change.
      assert.equal(trs[2].querySelectorAll('button').length, 1);
      assert.equal(trs[3].querySelectorAll('button').length, 1);
      assert.equal(trs[0].querySelectorAll('button').length, 3);
      assert.ok(button(trs[0], lockLabel));
    } finally { await view.close(); }
  }
  globalThis.fetch = previous;
});

test('the search box takes a UUID as well and sends it as the query; unknown statuses are not valid filters', async () => {
  const previous = globalThis.fetch;
  const urls = [];
  globalThis.fetch = async (url) => { urls.push(new URL(url, 'http://local')); return json({ content: [], page: 0, size: 10, totalElements: 0, totalPages: 0 }); };
  try {
    const { fetchAdminUsers } = await import('./adminService.js');
    for (const status of ['IN_PROCESS', 'LOCKED', 'PENDING']) await fetchAdminUsers('T', { status, pageSize: 10 });
    assert.deepEqual(urls.map((u) => u.searchParams.get('status')), ['IN_PROCESS', 'LOCKED', 'PENDING']);
    await assert.rejects(() => fetchAdminUsers('T', { status: 'SUSPENDED', pageSize: 10 }), /VALIDATION_FAILED/);
    await fetchAdminUsers('T', { query: ' 3f2b8c1e-aaaa-4bbb-8ccc-123456789abc ', pageSize: 10 });
    assert.equal(urls.at(-1).searchParams.get('query'), '3f2b8c1e-aaaa-4bbb-8ccc-123456789abc');

    const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
    try {
      assert.ok([...view.host.querySelectorAll('.lv-admin-field > span')].some((s) => s.textContent === 'Tên, email hoặc UUID'));
      assert.match(view.host.querySelector('input[type=search]').placeholder, /UUID/);
    } finally { await view.close(); }
  } finally { globalThis.fetch = previous; }
});

test('locking an account that is in handover explains why instead of a generic error', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => options.method === 'POST'
    ? json({ code: 'ADMIN_ACCOUNT_IN_HANDOVER' }, 409) : json(usersPage([apiUser()]));
  const view = await mount({ accessToken: 'T', fetchOnMount: true, lang: 'vi' });
  try {
    await act(async () => button(view.host.querySelector('tbody tr'), 'Khóa tài khoản').click());
    await act(async () => button(view.host.querySelector('[role=dialog]'), 'Khóa tài khoản').click());
    assert.equal(view.host.querySelector('.lv-admin-form-error').textContent,
      'Tài khoản này đang trong quá trình bàn giao tài sản hoặc đã được lưu trữ nên không thể khóa.');
  } finally { await view.close(); globalThis.fetch = previous; }
});
