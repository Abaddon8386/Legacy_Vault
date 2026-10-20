import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, storeSession, readStoredSession } from './session.js';
import { readUser } from '../api/contracts.js';
import {
  linkExistingBeneficiaryAccount,
  createAndLinkBeneficiaryAccount,
  validateBeneficiaryAccountReceipt,
} from '../pages/staff/beneficiaryAccountService.js';
import { validateCreateBeneficiaryAccountForm, validateLinkExistingAccountForm } from './beneficiaryAccountValidation.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/beneficiary' });
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry, stubLogin = false) {
  const result = await build({
    configFile: false,
    plugins: [
      react(),
      ...(stubLogin
        ? [
            {
              name: 'beneficiary-auth-test',
              load(id) {
                if (id.replaceAll('\\', '/').endsWith('/pages/auth/LoginPage.jsx')) {
                  return `import React from 'react'; export default function Login({onAuthenticated}) { return React.createElement('button',{onClick:()=>onAuthenticated({accessToken:'synthetic-token',tokenType:'Bearer',expiresInSeconds:3600,user:globalThis.__testUser},{lang:'vi'})},'Test sign in'); }`;
                }
              },
            },
          ]
        : []),
    ],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find((item) => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const App = await component('src/App.jsx', true);
const BeneficiaryHome = await component('src/pages/beneficiary/BeneficiaryHome.jsx');

const refreshUser = { id: '99999999-9999-4999-8999-999999999999', fullName: 'Refresh Test', email: 'refresh@example.test', roles: ['BENEFICIARY'] };
const refreshJson = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });
const refreshButton = host => [...host.querySelectorAll('button')].find(button => button.textContent.includes('Làm mới'));

for (const failure of ['401', 'wrong-user']) {
  test(`Refresh ${failure}: re-login renders content and permits another refresh`, async () => {
    window.history.replaceState({}, '', '/beneficiary');
    storeSession(createSession({ accessToken: 'old-token', tokenType: 'Bearer', expiresInSeconds: 3600, user: refreshUser }));
    const originalFetch = globalThis.fetch;
    globalThis.__testUser = refreshUser;
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 2) return failure === '401' ? refreshJson({ code: 'UNAUTHENTICATED' }, 401) : refreshJson({ ...refreshUser, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' });
      return refreshJson(refreshUser);
    };
    const view = await mount(App);
    try {
      await act(async () => refreshButton(view.host).click());
      assert.equal(window.location.pathname, '/login');
      assert.equal(readStoredSession(), null);
      await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent === 'Test sign in').click());
      assert.equal(window.location.pathname, '/beneficiary');
      assert.ok(view.host.querySelector('#beneficiary-home-title'));
      await act(async () => refreshButton(view.host).click());
      assert.ok(view.host.querySelector('#beneficiary-home-title'));
      assert.equal(calls, 4);
    } finally { await view.close(); globalThis.fetch = originalFetch; delete globalThis.__testUser; }
  });
}

for (const action of ['unmount', 'logout-and-relogin']) {
  test(`Refresh ${action}: aborts request and ignores a late response`, async () => {
    window.history.replaceState({}, '', '/beneficiary');
    storeSession(createSession({ accessToken: 'old-token', tokenType: 'Bearer', expiresInSeconds: 3600, user: refreshUser }));
    const originalFetch = globalThis.fetch;
    const nextUser = { ...refreshUser, id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Next Account' };
    let calls = 0, signal, finish;
    globalThis.fetch = async (_url, options) => {
      if (++calls === 2) return new Promise(resolve => { signal = options.signal; finish = resolve; });
      return refreshJson(calls === 1 ? refreshUser : nextUser);
    };
    const view = await mount(App);
    let closed = false;
    try {
      const button = refreshButton(view.host);
      await act(async () => { button.click(); button.click(); });
      assert.equal(calls, 2, 'Rapid refresh clicks send only one request');
      if (action === 'unmount') { await view.close(); closed = true; }
      else {
        await act(async () => view.host.querySelector('.lv-user-badge-card').click());
        await act(async () => [...view.host.querySelectorAll('.lv-account-menu-item')].find(item => item.textContent.includes('Đăng xuất')).click());
        globalThis.__testUser = nextUser;
        await act(async () => [...view.host.querySelectorAll('button')].find(item => item.textContent === 'Test sign in').click());
      }
      assert.equal(signal.aborted, true);
      await act(async () => finish(refreshJson({ ...refreshUser, roles: ['VAULT_OWNER'] })));
      if (!closed) {
        assert.equal(readStoredSession().user.id, nextUser.id);
        assert.equal(window.location.pathname, '/beneficiary');
        assert.ok(view.host.querySelector('#beneficiary-home-title'));
      }
    } finally {
      if (!closed) await view.close();
      if (finish) await act(async () => finish(refreshJson(refreshUser)));
      globalThis.fetch = originalFetch; delete globalThis.__testUser;
    }
  });
}

test('Refresh network failure keeps expiry and supports retry', async () => {
  window.history.replaceState({}, '', '/beneficiary');
  const session = createSession({ accessToken: 'retry-token', tokenType: 'Bearer', expiresInSeconds: 3600, user: refreshUser });
  storeSession(session);
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { if (++calls === 2) throw new Error('Network unavailable'); return refreshJson(refreshUser); };
  const view = await mount(App);
  try {
    await act(async () => refreshButton(view.host).click());
    assert.match(view.host.textContent, /Lỗi kết nối/);
    assert.equal(readStoredSession().expiresAt, session.expiresAt);
    await act(async () => [...view.host.querySelectorAll('button')].find(button => button.textContent.includes('Thử lại')).click());
    assert.ok(view.host.querySelector('#beneficiary-home-title'));
    assert.equal(calls, 3);
  } finally { await view.close(); globalThis.fetch = originalFetch; }
});

async function mount(Component, props = {}) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    render: async (newProps) => {
      await act(async () => root.render(React.createElement(Component, newProps)));
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
      storeSession(null);
    },
  };
}

// -------------------------------------------------------------------------
// SECTION A: UI & Neutral Content Verification (No Speculative Information)
// -------------------------------------------------------------------------

test('BeneficiaryHome - renders neutral profile without fake ACTIVE default and no speculative contacts in VI', async () => {
  const user = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Trần Minh Quang',
    email: 'quang.tran@example.test',
    phoneNumber: '0912345678',
    roles: ['BENEFICIARY'],
    // status is undefined from BE to verify neutral handling
  };

  const view = await mount(BeneficiaryHome, { lang: 'vi', user });
  try {
    const text = view.host.textContent;
    // 1. Account info
    assert.match(text, /Thông tin dành cho Người thụ hưởng/);
    assert.match(text, /Trần Minh Quang/);
    assert.match(text, /quang\.tran@example\.test/);
    assert.match(text, /0912345678/);
    assert.match(text, /Cổng Người Thụ Hưởng/);
    assert.doesNotMatch(text, /Người Thụ Hưởng Hợp Pháp/);
    assert.doesNotMatch(text, /Verified Beneficiary/);
    assert.doesNotMatch(text, /ROLE_BENEFICIARY/);

    // 2. Regulatory boundary checks
    assert.match(text, /Quy định pháp lý & Giới hạn vận hành/);
    assert.match(text, /Mã mời chỉ có tác dụng liên kết tài khoản/);
    assert.match(text, /KHÔNG đồng nghĩa với việc bạn được xem chi tiết tài sản/);
    assert.match(text, /Đăng nhập không cấp quyền truy cập kho của Chủ sở hữu hoặc giải mã tài sản/);
    assert.match(text, /không cung cấp cổng tài sản bí mật/);

    // 3. 4-step counter handover process (no technical jargon like VERIFIED_AT_COUNTER in title)
    assert.match(text, /Quy trình tiếp nhận di sản tại quầy/);
    assert.match(text, /Đối chiếu danh tính trực tiếp tại quầy/);
    assert.doesNotMatch(text, /VERIFIED_AT_COUNTER/);
    assert.doesNotMatch(text, /lưu trữ vĩnh viễn/);

    // 4. Contact Staff box - completely free of fake email and fake hours
    assert.match(text, /Liên hệ Nhân viên quầy tiếp nhận/);
    assert.doesNotMatch(text, /support@legacyvault\.vn/);
    assert.doesNotMatch(text, /08:30/);
  } finally {
    await view.close();
  }
});

test('BeneficiaryHome - renders English translation cleanly without placeholders or technical route leakages', async () => {
  const user = {
    id: '22222222-2222-4222-8222-222222222222',
    fullName: 'Alice Vance',
    email: 'alice@example.test',
    phoneNumber: null,
    roles: ['BENEFICIARY'],
    status: 'ACTIVE',
  };

  const view = await mount(BeneficiaryHome, { lang: 'en', user });
  try {
    const text = view.host.textContent;
    assert.match(text, /Beneficiary Information/);
    assert.match(text, /Alice Vance/);
    assert.match(text, /Information unavailable/);
    assert.match(text, /Active/);
    assert.match(text, /Beneficiary Portal/);
    assert.doesNotMatch(text, /Verified Beneficiary/);
    assert.match(text, /Important Legal & Operational Boundaries/);
    assert.match(text, /Invitation codes are used solely to link your login account/);
    assert.match(text, /Inheritance Handover Procedure/);
    assert.match(text, /In-Person Identity Verification/);
    assert.doesNotMatch(text, /support@legacyvault\.vn/);
  } finally {
    await view.close();
  }
});

test('BeneficiaryHome - multi-role detection offers clean switchers without technical route URLs', async () => {
  const multiRoleUser = {
    id: '33333333-3333-4333-8333-333333333333',
    fullName: 'Đỗ Văn Thành',
    email: 'thanh.do@example.test',
    roles: ['BENEFICIARY', 'VAULT_OWNER', 'STAFF_EXECUTOR'],
  };

  let navigatedTo = null;
  const view = await mount(BeneficiaryHome, {
    lang: 'vi',
    user: multiRoleUser,
    onNavigatePortal: (path) => {
      navigatedTo = path;
    },
  });

  try {
    const text = view.host.textContent;
    assert.match(text, /Tài khoản có nhiều vai trò hoạt động/);

    // Button labels should NOT include raw routes like (/vault) or (/staff/cases)
    const vaultBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Kho di sản');
    assert.ok(vaultBtn);
    await act(async () => vaultBtn.click());
    assert.equal(navigatedTo, '/vault');

    const staffBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cổng Nhân viên');
    assert.ok(staffBtn);
    await act(async () => staffBtn.click());
    assert.equal(navigatedTo, '/staff/cases');
  } finally {
    await view.close();
  }
});

test('BeneficiaryHome - error state renders honest retry and logout buttons', async () => {
  let refreshed = false;
  let loggedOut = false;

  const view = await mount(BeneficiaryHome, {
    lang: 'vi',
    errorMessage: 'Lỗi kết nối máy chủ. Vui lòng thử lại.',
    onRefresh: () => {
      refreshed = true;
    },
    onLogout: () => {
      loggedOut = true;
    },
  });

  try {
    const text = view.host.textContent;
    assert.match(text, /Thông tin tạm thời chưa khả dụng/);
    assert.match(text, /Lỗi kết nối máy chủ/);

    const retryBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Thử lại'));
    assert.ok(retryBtn);
    await act(async () => retryBtn.click());
    assert.equal(refreshed, true);

    const logoutBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Đăng xuất'));
    assert.ok(logoutBtn);
    await act(async () => logoutBtn.click());
    assert.equal(loggedOut, true);
  } finally {
    await view.close();
  }
});

// -------------------------------------------------------------------------
// SECTION B: Adapter Receipt Validation & Strict Contract Verification
// -------------------------------------------------------------------------

test('validateBeneficiaryAccountReceipt - strictly validates receipt fields, UUIDs, and statuses', () => {
  const beneficiaryId = '550e8400-e29b-41d4-a716-446655440000';
  const accountId = '660e8400-e29b-41d4-a716-446655440001';

  // Valid receipt
  assert.equal(
    validateBeneficiaryAccountReceipt(
      {
        beneficiaryId,
        accountId,
        accountStatus: 'ACCOUNT_CREATED',
        identityVerificationStatus: 'VERIFIED_AT_COUNTER',
      },
      beneficiaryId
    ),
    true
  );

  // Missing / null response
  assert.throws(() => validateBeneficiaryAccountReceipt(null, beneficiaryId), { code: 'INVALID_RECEIPT' });
  assert.throws(() => validateBeneficiaryAccountReceipt({}, beneficiaryId), { code: 'INVALID_RECEIPT' });

  // Wrong or non-UUID beneficiaryId
  assert.throws(
    () =>
      validateBeneficiaryAccountReceipt(
        { beneficiaryId: 'not-a-uuid', accountId, accountStatus: 'ACCOUNT_CREATED', identityVerificationStatus: 'VERIFIED_AT_COUNTER' },
        beneficiaryId
      ),
    { code: 'INVALID_RECEIPT' }
  );
  assert.throws(
    () =>
      validateBeneficiaryAccountReceipt(
        { beneficiaryId: '770e8400-e29b-41d4-a716-446655440002', accountId, accountStatus: 'ACCOUNT_CREATED', identityVerificationStatus: 'VERIFIED_AT_COUNTER' },
        beneficiaryId
      ),
    { code: 'INVALID_RECEIPT' }
  );

  // Non-UUID accountId
  assert.throws(
    () =>
      validateBeneficiaryAccountReceipt(
        { beneficiaryId, accountId: 'acc-123', accountStatus: 'ACCOUNT_CREATED', identityVerificationStatus: 'VERIFIED_AT_COUNTER' },
        beneficiaryId
      ),
    { code: 'INVALID_RECEIPT' }
  );

  // Ineligible / wrong accountStatus
  assert.throws(
    () =>
      validateBeneficiaryAccountReceipt(
        { beneficiaryId, accountId, accountStatus: 'NOT_CREATED', identityVerificationStatus: 'VERIFIED_AT_COUNTER' },
        beneficiaryId
      ),
    { code: 'INVALID_RECEIPT' }
  );

  // Unverified identityVerificationStatus
  assert.throws(
    () =>
      validateBeneficiaryAccountReceipt(
        { beneficiaryId, accountId, accountStatus: 'ACCOUNT_CREATED', identityVerificationStatus: 'NOT_VERIFIED' },
        beneficiaryId
      ),
    { code: 'INVALID_RECEIPT' }
  );
});

test('Staff account service - rejects invalid HTTP status (e.g. non-200 for link, non-201 for create)', async () => {
  const beneficiaryId = '550e8400-e29b-41d4-a716-446655440000';
  const accountId = '660e8400-e29b-41d4-a716-446655440001';

  // Link endpoint returning 201 Created (contract strictly mandates 200)
  const mockFetchLink201 = async () =>
    new Response(
      JSON.stringify({
        beneficiaryId,
        accountId,
        accountStatus: 'ACCOUNT_CREATED',
        identityVerificationStatus: 'VERIFIED_AT_COUNTER',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );

  await assert.rejects(
    linkExistingBeneficiaryAccount(beneficiaryId, 'user@example.test', {
      accessToken: 'jwt',
      fetchFn: mockFetchLink201,
    }),
    { code: 'INVALID_RESPONSE' }
  );

  // Create endpoint returning 200 OK (contract strictly mandates 201 Created)
  const mockFetchCreate200 = async () =>
    new Response(
      JSON.stringify({
        beneficiaryId,
        accountId,
        accountStatus: 'ACCOUNT_CREATED',
        identityVerificationStatus: 'VERIFIED_AT_COUNTER',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  await assert.rejects(
    createAndLinkBeneficiaryAccount(
      beneficiaryId,
      { email: 'new@example.test', password: 'ValidPassword123' },
      {
        accessToken: 'jwt',
        fetchFn: mockFetchCreate200,
      }
    ),
    { code: 'INVALID_RESPONSE' }
  );
});

test('Staff account service - live linkExistingBeneficiaryAccount calls real POST /api/v1/staff/beneficiaries/{id}/account-link', async () => {
  const beneficiaryId = '550e8400-e29b-41d4-a716-446655440000';
  const accountId = '660e8400-e29b-41d4-a716-446655440001';
  const accountEmail = 'ben.official@example.com';
  let capturedUrl = null;
  let capturedMethod = null;
  let capturedBody = null;
  let capturedAuth = null;

  const mockFetch = async (url, init) => {
    capturedUrl = url;
    capturedMethod = init.method;
    capturedBody = JSON.parse(init.body);
    capturedAuth = init.headers?.Authorization;

    return new Response(
      JSON.stringify({
        beneficiaryId,
        accountId,
        accountStatus: 'ACCOUNT_CREATED',
        identityVerificationStatus: 'VERIFIED_AT_COUNTER',
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const res = await linkExistingBeneficiaryAccount(beneficiaryId, accountEmail, {
    accessToken: 'valid-staff-jwt',
    fetchFn: mockFetch,
    lang: 'vi',
  });

  assert.equal(capturedUrl, `/api/v1/staff/beneficiaries/${beneficiaryId}/account-link`);
  assert.equal(capturedMethod, 'POST');
  assert.deepEqual(capturedBody, { accountEmail });
  assert.equal(capturedAuth, 'Bearer valid-staff-jwt');
  assert.equal(res.status, 'LINKED');
  assert.equal(res.linkedUserId, accountId);
  assert.equal(res.accountStatus, 'ACCOUNT_CREATED');
  assert.equal(res.identityVerificationStatus, 'VERIFIED_AT_COUNTER');
});

test('Staff account service - live createAndLinkBeneficiaryAccount calls real POST /api/v1/staff/beneficiaries/{id}/account with untrimmed password and optional phone', async () => {
  const beneficiaryId = '550e8400-e29b-41d4-a716-446655440000';
  const accountId = '770e8400-e29b-41d4-a716-446655440002';
  const form = {
    email: 'thaomy@example.com',
    password: ' SecurePassword123! ', // Raw password with spaces that must NOT be trimmed
    phone: '0987654321',
  };
  let capturedUrl = null;
  let capturedBody = null;

  const mockFetch = async (url, init) => {
    capturedUrl = url;
    capturedBody = JSON.parse(init.body);

    return new Response(
      JSON.stringify({
        beneficiaryId,
        accountId,
        accountStatus: 'ACCOUNT_CREATED',
        identityVerificationStatus: 'VERIFIED_AT_COUNTER',
      }),
      { status: 201, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const res = await createAndLinkBeneficiaryAccount(beneficiaryId, form, {
    accessToken: 'valid-staff-jwt',
    fetchFn: mockFetch,
    lang: 'vi',
  });

  assert.equal(capturedUrl, `/api/v1/staff/beneficiaries/${beneficiaryId}/account`);
  assert.deepEqual(capturedBody, {
    email: 'thaomy@example.com',
    password: ' SecurePassword123! ', // Must retain exact user characters per security contract
    phone: '0987654321',
  });
  assert.equal(res.status, 'LINKED');
  assert.equal(res.activatedAtCounter, true);
  assert.equal(res.linkedUserId, accountId);
});

test('Staff account service - maps contract conflict codes accurately', async () => {
  const beneficiaryId = '550e8400-e29b-41d4-a716-446655440000';

  for (const conflictCode of [
    'BENEFICIARY_IDENTITY_NOT_VERIFIED',
    'BENEFICIARY_ACCOUNT_ALREADY_LINKED',
    'BENEFICIARY_ACCOUNT_INELIGIBLE',
    'EMAIL_ALREADY_EXISTS',
  ]) {
    const mockFetch = async () =>
      new Response(JSON.stringify({ code: conflictCode, message: 'Conflict' }), {
        status: 409,
        headers: { 'Content-Type': 'application/json' },
      });

    await assert.rejects(
      linkExistingBeneficiaryAccount(beneficiaryId, 'user@example.test', {
        accessToken: 'jwt',
        fetchFn: mockFetch,
      }),
      { code: conflictCode }
    );
  }
});

// -------------------------------------------------------------------------
// SECTION C: Validation & Edge Cases (BE DTO Alignment)
// -------------------------------------------------------------------------

test('Live Form validation - strictly enforces phone pattern, password requirements, and boundaries (8-72)', () => {
  // Missing or whitespace-only password in live mode is strictly rejected
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: '' }, { isLive: true }).errors.password,
    'passwordRequired'
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: '   ' }, { isLive: true }).errors.password,
    'passwordRequired'
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com' }, { isLive: true }).errors.password,
    'passwordRequired'
  );

  // Password boundaries: 7 chars (too short), 8 chars (valid), 72 chars (valid), 73 chars (too long)
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: '1234567' }, { isLive: true }).errors.password,
    'passwordLengthInvalid'
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: '12345678' }, { isLive: true }).isValid,
    true
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'a'.repeat(72) }, { isLive: true }).isValid,
    true
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'a'.repeat(73) }, { isLive: true }).errors.password,
    'passwordLengthInvalid'
  );

  // Phone optional in live mode (can be empty string or null)
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'ValidPassword123', phone: '' }, { isLive: true }).isValid,
    true
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'ValidPassword123', phone: null }, { isLive: true }).isValid,
    true
  );

  // Phone validation per BE regexp ^$|^\+?[0-9]{8,15}$
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'ValidPassword123', phone: '+84901234567' }, { isLive: true }).isValid,
    true
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'ValidPassword123', phone: '0901234567' }, { isLive: true }).isValid,
    true
  );
  assert.equal(
    validateCreateBeneficiaryAccountForm({ email: 'test@example.com', password: 'ValidPassword123', phone: '090-123-4567' }, { isLive: true }).errors.phone,
    'phoneInvalid' // Spaces/dashes not accepted per BE DTO
  );

  // Email boundary 254
  assert.equal(
    validateLinkExistingAccountForm('a'.repeat(250) + '@example.com').errorKey,
    'emailTooLong'
  );
});

// -------------------------------------------------------------------------
// SECTION D: App Integration, Refresh, Session Expiry & Role Revocation
// -------------------------------------------------------------------------

test('App integration - Multi-role user has access to Beneficiary portal from Account popover and can return to Vault', async () => {
  storeSession(null);
  window.history.replaceState({}, '', '/vault');

  const multiUser = {
    id: '11111111-1111-4111-8111-111111111111',
    fullName: 'Hoàng Minh',
    email: 'hoang.minh@example.test',
    roles: ['VAULT_OWNER', 'BENEFICIARY'],
  };

  storeSession(
    createSession({
      accessToken: 'synthetic-multi',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: multiUser,
    })
  );

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/auth/me')) {
      return new Response(JSON.stringify(multiUser), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const view = await mount(App);
  try {
    // 1. Initially at /vault
    assert.equal(window.location.pathname, '/vault');

    // 2. Open Account popover menu
    const badgeBtn = view.host.querySelector('.lv-user-badge-card');
    assert.ok(badgeBtn);
    await act(async () => badgeBtn.click());

    // 3. Find Beneficiary Portal menu item and click it
    const beneficiaryMenuItem = [...view.host.querySelectorAll('.lv-account-menu-item')].find((btn) =>
      btn.textContent.includes('Cổng Người thụ hưởng')
    );
    assert.ok(beneficiaryMenuItem, 'Account popover must include Beneficiary Portal link for multi-role user');
    await act(async () => beneficiaryMenuItem.click());

    // 4. Now at /beneficiary
    assert.equal(window.location.pathname, '/beneficiary');
    assert.ok(view.host.querySelector('#beneficiary-home-title'));

    // 5. From Beneficiary home, multi-role box allows returning to Vault
    const returnVaultBtn = [...view.host.querySelectorAll('button')].find((btn) =>
      btn.textContent.trim() === 'Kho di sản'
    );
    assert.ok(returnVaultBtn, 'Beneficiary home must display quick switcher to Vault');
    await act(async () => returnVaultBtn.click());
    assert.equal(window.location.pathname, '/vault');
  } finally {
    await view.close();
    globalThis.fetch = originalFetch;
    storeSession(null);
  }
});

test('App integration - Refresh calls /auth/me, updates roles, keeps expiry, and redirects if role is revoked', async () => {
  storeSession(null);
  window.history.replaceState({}, '', '/beneficiary');

  const userId = '88888888-8888-4888-8888-888888888888';
  let currentUserPayload = {
    id: userId,
    fullName: 'Lê Thảo My',
    email: 'thaomy@example.test',
    roles: ['BENEFICIARY', 'VAULT_OWNER'],
  };

  const initialExpiry = Date.now() + 1800 * 1000;
  const initialSession = {
    accessToken: 'valid-refresh-token',
    expiresAt: initialExpiry,
    user: currentUserPayload,
  };
  storeSession(initialSession);

  let meCallCount = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/auth/me')) {
      meCallCount++;
      return new Response(JSON.stringify(currentUserPayload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    return new Response(JSON.stringify({}), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const view = await mount(App);
  try {
    assert.equal(window.location.pathname, '/beneficiary');

    // Trigger refresh button from BeneficiaryHome
    const refreshBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Làm mới'));
    assert.ok(refreshBtn, 'Beneficiary page must contain real refresh button');
    await act(async () => refreshBtn.click());

    assert.ok(meCallCount >= 1, 'Refresh must trigger real /auth/me network call');
    // Session expiresAt must NOT be extended on refresh
    assert.equal(readStoredSession().expiresAt, initialExpiry);

    // Now simulate BE revoking BENEFICIARY role (e.g. only VAULT_OWNER remains)
    currentUserPayload = {
      id: userId,
      fullName: 'Lê Thảo My',
      email: 'thaomy@example.test',
      roles: ['VAULT_OWNER'], // BENEFICIARY removed
    };

    const refreshBtn2 = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Làm mới'));
    assert.ok(refreshBtn2);
    await act(async () => refreshBtn2.click());

    // Navigation must redirect out of /beneficiary to /vault as user lost BENEFICIARY role
    assert.equal(window.location.pathname, '/vault');
  } finally {
    await view.close();
    globalThis.fetch = originalFetch;
    storeSession(null);
  }
});

for (const lang of ['vi', 'en']) {
  test(`Beneficiary phone ${lang}: auth projection without phone does not claim the profile is incomplete`, async () => {
    const projected = readUser({ ...refreshUser, phoneNumber: '0901234567' });
    assert.equal(Object.hasOwn(projected, 'phoneNumber'), false, 'The current auth contract does not expose profile phone');
    const view = await mount(BeneficiaryHome, { user: projected, lang });
    try {
      const detail = [...view.host.querySelectorAll('.lv-ben-detail-item')].find(item => item.textContent.includes(lang === 'en' ? 'Phone Number' : 'Số điện thoại'));
      assert.ok(detail);
      assert.match(detail.textContent, lang === 'en' ? /Information unavailable/ : /Thông tin chưa khả dụng/);
      assert.doesNotMatch(detail.textContent, /Not provided|Chưa cập nhật/);
    } finally { await view.close(); }
  });
  for (const path of ['/admin', '/admin/subscriptions']) {
    test(`Admin beneficiary menu ${lang} ${path}: multi-role account reaches beneficiary portal`, async () => {
      const admin = { ...refreshUser, roles: ['ADMIN', 'BENEFICIARY'] };
      window.history.replaceState({}, '', `${path}?lang=${lang}`);
      storeSession(createSession({ accessToken: 'admin-beneficiary-test', tokenType: 'Bearer', expiresInSeconds: 3600, user: admin }));
      const originalFetch = globalThis.fetch;
      globalThis.fetch = async url => url.includes('/auth/me') ? refreshJson(admin) : refreshJson({ code: 'BACKEND_NOT_READY' }, 503);
      const view = await mount(App);
      try {
        await act(async () => view.host.querySelector('.lv-user-badge-card').click());
        const entry = [...view.host.querySelectorAll('.lv-account-menu-item')].find(item => item.textContent.includes(lang === 'en' ? 'Beneficiary Portal' : 'Cổng Người thụ hưởng'));
        assert.ok(entry);
        await act(async () => entry.click());
        assert.equal(window.location.pathname, '/beneficiary');
        assert.ok(view.host.querySelector('#beneficiary-home-title'));
        assert.deepEqual(readStoredSession().user.roles, ['ADMIN', 'BENEFICIARY']);
      } finally { await view.close(); globalThis.fetch = originalFetch; }
    });
  }
}
