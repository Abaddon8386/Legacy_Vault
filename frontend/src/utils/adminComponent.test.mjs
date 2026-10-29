const userId = '11111111-1111-4111-8111-111111111111';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/admin' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponent(entryPath) {
  const entry = resolve(import.meta.dirname, '..', entryPath.replace(/^src\//, ''));
  const root = resolve(import.meta.dirname, '../..');
  const result = await build({
    root,
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const AdminHome = await loadComponent('src/pages/admin/AdminHome.jsx');
const AdminUsersPage = await loadComponent('src/pages/admin/AdminUsersPage.jsx');
const AdminLogsPage = await loadComponent('src/pages/admin/AdminLogsPage.jsx');
const AppShell = await loadComponent('src/components/layout/AppShell.jsx');

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
    },
  };
}

// ==========================================
// 1. AdminHome (Overview) Component Tests
// ==========================================

test('AdminHome renders title with #admin-home-title and bilingual support', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });

  try {
    const viView = await mount(AdminHome, { lang: 'vi' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const h1 = viView.host.querySelector('#admin-home-title');
      assert.ok(h1);
      assert.equal(h1.textContent, 'Tổng quan quản trị');
      assert.ok(viView.host.querySelector('#overview-metrics-heading').textContent.includes('Số liệu hệ thống'));
      assert.ok(viView.host.textContent.includes('CHƯA KHẢ DỤNG'));
    } finally {
      await viView.close();
    }

    const enView = await mount(AdminHome, { lang: 'en' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const h1 = enView.host.querySelector('#admin-home-title');
      assert.ok(h1);
      assert.equal(h1.textContent, 'Administration overview');
      assert.ok(enView.host.querySelector('#overview-metrics-heading').textContent.includes('System metrics'));
      assert.ok(enView.host.textContent.includes('UNAVAILABLE'));
    } finally {
      await enView.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('AdminHome renders live metrics and multi-role distribution correctly', async () => {
  const prevFetch = globalThis.fetch;
  const mockOverview = {
    completedAt: '2026-10-20T12:00:00Z',
    totalAccounts: 50,
    activeVaults: 48,
    processingCases: 2,
    roleAssignments: {
      ROLE_VAULT_OWNER: 45,
      ROLE_BENEFICIARY: 20, // 45 + 20 = 65 > 50 (multi-role)
      ROLE_STAFF_EXECUTOR: 4,
      ROLE_LEGAL_VERIFIER: 3,
      ROLE_ADMIN: 2,
    },
  };

  globalThis.fetch = async () =>
    new Response(JSON.stringify(mockOverview), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const view = await mount(AdminHome, { lang: 'vi', accessToken: 'test-token', fetchOnMount: true });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      assert.ok(view.host.textContent.includes('50'));
      assert.ok(view.host.textContent.includes('48'));
      assert.ok(view.host.textContent.includes('74')); // total roles: 45+20+4+3+2 = 74
      assert.ok(view.host.textContent.includes('Chủ sở hữu kho'));
      assert.ok(view.host.textContent.includes('Người thụ hưởng'));
      assert.ok(view.host.textContent.includes('Kho chưa lưu trữ'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('AdminHome triggers onUnauthorized on 401', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 401 });

  let unauthorizedCalled = false;
  try {
    const view = await mount(AdminHome, {
      onUnauthorized: () => { unauthorizedCalled = true; },
      accessToken: 'test-token', fetchOnMount: true,
    });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      assert.equal(unauthorizedCalled, true);
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// ==========================================
// 2. AdminUsersPage Component Tests
// ==========================================

test('AdminUsersPage renders user table, filters, and prevents creation/role editing', async () => {
  const prevFetch = globalThis.fetch;
  const mockUsers = [
    {
      id: 'u-101',
      fullName: 'Trần Văn B',
      email: 'b@example.com',
      roles: ['ROLE_VAULT_OWNER', 'ROLE_BENEFICIARY'],
      status: 'ACTIVE',
      createdAt: '2026-10-15T00:00:00Z',
    },
    {
      id: 'u-102',
      fullName: 'Lê Thị C',
      email: 'c@example.com',
      roles: ['ROLE_STAFF_EXECUTOR'],
      status: 'LOCKED',
      createdAt: '2026-10-16T00:00:00Z',
    },
  ];

  globalThis.fetch = async () =>
    new Response(JSON.stringify(userPage(mockUsers)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', accessToken: 'test-token', fetchOnMount: true });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

      // Title & columns
      assert.ok(view.host.querySelector('#admin-users-title'));
      assert.ok(view.host.textContent.includes('Trần Văn B'));
      assert.ok(view.host.textContent.includes('Lê Thị C'));
      assert.ok(view.host.querySelector('[title="VAULT_OWNER"]').textContent.includes('Chủ sở hữu kho'));
      assert.ok(view.host.querySelector('[title="BENEFICIARY"]').textContent.includes('Người thụ hưởng'));

      // Search & Filters exist
      assert.ok(view.host.querySelector('input[type="search"]'));
      assert.ok(view.host.querySelectorAll('select').length >= 2);

      // Verify NO create user button exists
      const buttons = [...view.host.querySelectorAll('button')];
      assert.equal(
        buttons.some((b) => b.textContent.includes('Tạo người dùng') || b.textContent.includes('Create user') || b.textContent.includes('Thêm người dùng')),
        false,
        'AdminUsersPage must NOT have a create user button'
      );

      // Verify NO edit user button exists
      assert.equal(
        buttons.some((b) => b.textContent.includes('Sửa thông tin') || b.textContent.includes('Edit user')),
        false,
        'AdminUsersPage must NOT have an edit user button'
      );
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('AdminUsersPage user detail modal displays read-only information', async () => {
  const prevFetch = globalThis.fetch;
  const mockUser = {
    id: 'u-101',
    fullName: 'Trần Văn B',
    email: 'b@example.com',
    roles: ['VAULT_OWNER', 'BENEFICIARY'],
    status: 'ACTIVE',
    createdAt: '2026-10-15T00:00:00Z',
  };

  globalThis.fetch = async url =>
    new Response(JSON.stringify(url.includes('?') ? userPage([mockUser]) : wireUser(mockUser)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', accessToken: 'test-token', fetchOnMount: true });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

      // Click "Xem chi tiết"
      const detailBtn = [...view.host.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Xem chi tiết')
      );
      assert.ok(detailBtn);
      await act(async () => { detailBtn.click(); });

      // Modal is visible
      assert.ok(view.host.querySelector('#user-detail-modal-title'));
      assert.ok(view.host.textContent.includes(userId));
      assert.ok(view.host.textContent.includes('Trần Văn B'));
      assert.ok(view.host.textContent.includes('b@example.com'));

      // Close modal
      const closeBtn = [...view.host.querySelectorAll('button')].find((b) =>
        b.textContent.includes('Đóng')
      );
      assert.ok(closeBtn);
      await act(async () => { closeBtn.click(); });
      assert.equal(view.host.querySelector('#user-detail-modal-title'), null);
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

for (const lang of ['vi', 'en']) test(`AdminUsersPage shows unavailable lock/unlock actions before interaction (${lang})`, async () => {
  const prevFetch = globalThis.fetch;
  const mockUsers = [
    { fullName: 'Active account', email: 'active@example.com', roles: ['VAULT_OWNER'], status: 'ACTIVE' },
    { fullName: 'Locked account', email: 'locked@example.com', roles: ['VAULT_OWNER'], status: 'LOCKED' },
  ];
  let requests = 0;

  globalThis.fetch = async () => {
    requests++;
    return new Response(JSON.stringify(userPage(mockUsers)), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  try {
    const view = await mount(AdminUsersPage, { lang, accessToken: 'test-token', fetchOnMount: true });
    try {
      const notice = view.host.querySelector('#admin-lock-policy-notice');
      assert.match(notice.textContent, lang === 'en' ? /currently unavailable/ : /hiện chưa khả dụng/);
      const labels = lang === 'en' ? ['Lock account', 'Unlock account'] : ['Khóa tài khoản', 'Mở khóa'];
      for (const label of labels) {
        const button = [...view.host.querySelectorAll('button')].find(candidate => candidate.textContent.trim() === label);
        assert.ok(button);
        assert.equal(button.disabled, true);
        assert.equal(button.getAttribute('aria-describedby'), notice.id);
        assert.equal(button.title, notice.textContent);
        await act(async () => button.click());
      }
      assert.equal(view.host.querySelector('[role="dialog"]'), null);
      assert.equal(requests, 1, 'Unavailable actions must not make requests');
      const details = [...view.host.querySelectorAll('button')].filter(button =>
        button.textContent.trim() === (lang === 'en' ? 'View details' : 'Xem chi tiết'));
      assert.equal(details.length, 2);
      assert.ok(details.every(button => !button.disabled), 'Read-only details remain available');
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// ==========================================
// 3. AdminLogsPage Component Tests
// ==========================================

test('AdminLogsPage renders immutable audit records, SYSTEM actor, and forbids edit/delete/export/risk badges', async () => {
  const prevFetch = globalThis.fetch;
  const actorId = '11111111-1111-4111-8111-111111111111';
  const mockLogs = ['SYSTEM', 'USER'].map((kind, index) => ({
    id: `22222222-2222-4222-8222-22222222222${index}`,
    occurredAt: '2026-10-20T10:00:00Z', actor: { kind, userId: kind === 'USER' ? actorId : null },
    action: index ? 'VAULT_CREATED' : 'DMS_TRIGGERED', entityType: 'VAULT', vaultId: null,
  }));
  globalThis.fetch = async url => new Response(JSON.stringify(url.includes('?') ? { content: mockLogs, page: 0, size: 10, totalElements: 2, totalPages: 1 } : { event: mockLogs[1], traceId: actorId }),
    { headers: { 'Content-Type': 'application/json' } });

  try {
    const view = await mount(AdminLogsPage, { lang: 'vi', accessToken: 'test-token', fetchOnMount: true });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

      assert.ok(view.host.querySelector('#admin-logs-title'));
      assert.ok(view.host.textContent.includes('Hệ thống (SYSTEM)'));
      const tableText = view.host.querySelector('table').textContent;
      assert.equal(tableText.includes(actorId), false);
      assert.ok(tableText.includes('DMS_TRIGGERED'));
      assert.ok(tableText.includes('Tạo kho'));
      assert.equal(tableText.includes('VAULT_CREATED'), false);

      const buttons = [...view.host.querySelectorAll('button')];

      // Strictly NO edit button
      assert.equal(
        buttons.some((b) => b.textContent.includes('Sửa') || b.textContent.includes('Edit')),
        false,
        'AdminLogsPage must NOT have edit buttons'
      );

      // Strictly NO delete button
      assert.equal(
        buttons.some((b) => b.textContent.includes('Xóa') || b.textContent.includes('Delete')),
        false,
        'AdminLogsPage must NOT have delete buttons'
      );

      // Strictly NO CSV export button
      assert.equal(
        buttons.some((b) => b.textContent.includes('Xuất CSV') || b.textContent.includes('Export CSV')),
        false,
        'AdminLogsPage must NOT have export CSV buttons'
      );

      // Strictly NO risk level classifications (e.g. LOW / MEDIUM / CRITICAL risk badges)
      assert.equal(view.host.textContent.includes('CRITICAL'), false);
      assert.equal(view.host.textContent.includes('Mức độ rủi ro'), false);

      // Click "Xem chi tiết" on log #2
      const detailBtns = buttons.filter((b) => b.textContent.includes('Xem chi tiết'));
      assert.ok(detailBtns.length > 0);
      await act(async () => { detailBtns[1].click(); });

      // Modal shows traceId
      assert.ok(view.host.querySelector('[role="dialog"]'));
      assert.ok(view.host.textContent.includes(actorId));
      assert.ok(view.host.querySelector('[role="dialog"]').textContent.includes('VAULT_CREATED'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// ==========================================
// 4. AppShell Admin Navigation Regression Tests
// ==========================================

test('AppShell renders all 4 Admin tabs and preserves 15 render sites including Shared with me', async () => {
  const activeSession = {
    accessToken: 'test-admin-token',
    user: {
      id: 'admin-1',
      fullName: 'System Admin',
      email: 'admin@legacyvault.vn',
      roles: ['ADMIN'],
    },
  };

  const view = await mount(AppShell, {
    role: 'ADMIN',
    session: activeSession,
    user: activeSession.user,
    lang: 'vi',
    currentTab: 'admin-home',
    isAuthenticated: true,
  });

  try {
    const navText = view.host.querySelector('.lv-sidebar-nav')?.textContent || '';
    assert.ok(navText.includes('Tổng quan quản trị'));
    assert.ok(navText.includes('Người dùng'));
    assert.ok(navText.includes('Quản lý gói sử dụng'));
    assert.ok(navText.includes('Nhật ký'));
  } finally {
    await view.close();
  }

  // Develop adds the Shared with me shell; Admin continues to use its existing shell.
  const appJsx = readFileSync(resolve(import.meta.dirname, '../App.jsx'), 'utf8');
  const appShellMatches = appJsx.match(/<AppShell\b[^>]*>/gs) || [];
  assert.equal(
    appShellMatches.length,
    15,
    'Expected 15 AppShell render sites including the Shared with me route from develop'
  );
});

// Exact PS-109 wire fixtures; IDs and createdAt below are synthetic test-only values.

function wireUser(value, index = 0) {
  const rest = { ...value }; delete rest.id;
  return { ...rest, publicId: value.publicId || (index ? '22222222-2222-4222-8222-222222222222' : userId),
    createdAt: value.createdAt || '2026-10-20T10:00:00Z' };
}
function userPage(users) { return { content: users.map(wireUser), page: 0, size: 10, totalElements: users.length, totalPages: users.length ? 1 : 0 }; }
