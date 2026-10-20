import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

import {
  validateAdminOverview,
  validateAdminUser,
  validateAdminAuditLog,
  fetchAdminUsers,
  fetchAdminAuditLogs,
} from './adminService.js';

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

const AdminUsersPage = await loadComponent('src/pages/admin/AdminUsersPage.jsx');

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    rerender: async (newProps) => {
      await act(async () => root.render(React.createElement(Component, newProps)));
    },
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

// =========================================================================
// 1. REPRO TEST: Lỗi 3 - Thiếu dữ liệu: không tự gán ACTIVE, số 0 hoặc thời gian hiện tại
// =========================================================================

test('REPRO Lỗi 3: validateAdminUser must NOT default missing status to ACTIVE', () => {
  const user = validateAdminUser({
    id: 'u-1',
    email: 'user@example.com',
  });
  assert.notEqual(
    user.status,
    'ACTIVE',
    'User status must NOT default to ACTIVE when missing from backend'
  );
  assert.equal(user.status, null);
});

test('REPRO Lỗi 3: validateAdminOverview must NOT default missing asOf to now, nor missing metrics to 0 or totalUsers', () => {
  const overview = validateAdminOverview({
    totalUsers: 100,
  });
  assert.equal(
    overview.asOf,
    null,
    'Overview asOf must NOT default to current time when missing from backend'
  );
  assert.equal(
    overview.activeUsers,
    null,
    'Overview activeUsers must NOT default to totalUsers when missing'
  );
  assert.equal(
    overview.lockedUsers,
    null,
    'Overview lockedUsers must NOT default to 0 when missing'
  );
  assert.equal(
    overview.roleDistribution.VAULT_OWNER,
    null,
    'Role count must NOT default to 0 when missing'
  );
});

test('REPRO Lỗi 3: validateAdminAuditLog must NOT default missing occurredAt to now, nor missing actorType to USER', () => {
  const log = validateAdminAuditLog({
    id: 'aud-1',
    action: 'VAULT_CREATED',
  });
  assert.equal(
    log.occurredAt,
    null,
    'occurredAt must NOT default to current time when missing'
  );
  assert.equal(
    log.actorType,
    null,
    'actorType must NOT default to USER when missing'
  );
});

// =========================================================================
// 2. REPRO TEST: Lỗi 4 - Response sai cấu trúc: báo lỗi dữ liệu, không biến thành empty thành công
// =========================================================================

test('REPRO Lỗi 4: fetchAdminUsers must throw error on malformed response without items array', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ malformed: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    await assert.rejects(
      async () => {
        await fetchAdminUsers('test-token');
      },
      (err) => err.code === 'INVALID_USERS_RESPONSE' || err.code === 'INVALID_DATA_STRUCTURE',
      'fetchAdminUsers must reject with error on malformed response, not return empty items'
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('REPRO Lỗi 4: fetchAdminAuditLogs must throw error on malformed response without items array', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response(JSON.stringify({ unexpectedField: 'xyz' }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  try {
    await assert.rejects(
      async () => {
        await fetchAdminAuditLogs('test-token');
      },
      (err) => err.code === 'INVALID_AUDIT_LOGS_RESPONSE' || err.code === 'INVALID_DATA_STRUCTURE',
      'fetchAdminAuditLogs must reject with error on malformed response, not return empty items'
    );
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// =========================================================================
// 3. REPRO TEST: Lỗi 1 - Response 403: dọn danh sách, chi tiết/modal và target đang mở
// =========================================================================

test('REPRO Lỗi 1: AdminUsersPage on 403 clears users list, detail modal, and lock dialog', async () => {
  const prevFetch = globalThis.fetch;
  let fetchCount = 0;

  globalThis.fetch = async () => {
    fetchCount++;
    if (fetchCount === 1) {
      // First call succeeds with 1 user
      return new Response(
        JSON.stringify({
          items: [{ id: 'u-1', fullName: 'User 1', email: 'u1@example.com', roles: ['ADMIN'], status: 'ACTIVE' }],
          total: 1,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Second call (e.g. reload or search) returns 403 Forbidden
    return new Response(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 });
  };

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', fetchOnMount: true, accessToken: 'token-1' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      assert.ok(view.host.textContent.includes('User 1'));

      // Open detail modal
      const detailBtn = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Xem chi tiết'));
      assert.ok(detailBtn);
      await act(async () => { detailBtn.click(); });
      assert.ok(view.host.querySelector('#user-detail-modal-title'));

      // Now trigger a search / reload that receives 403
      const searchInput = view.host.querySelector('input[type="search"]');
      const searchForm = view.host.querySelector('form');
      await act(async () => {
        searchInput.value = 'test';
        searchForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 40));
      });

      // In the fixed version: modal must be closed and user list must be wiped clean!
      assert.equal(
        view.host.querySelector('#user-detail-modal-title'),
        null,
        'Detail modal must be closed upon receiving 403 Forbidden'
      );
      assert.equal(
        view.host.textContent.includes('User 1'),
        false,
        'User list data must be cleared upon receiving 403 Forbidden'
      );
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

// =========================================================================
// 4. REPRO TEST: Lỗi 2 - Response cũ sau đổi account/token/filter: bỏ hoàn toàn
// =========================================================================

test('REPRO Lỗi 2: AdminUsersPage discards late response from previous token after account change', async () => {
  const prevFetch = globalThis.fetch;
  let delayedResolve = null;

  globalThis.fetch = async (url, options) => {
    const authHeader = options?.headers?.Authorization || '';
    if (authHeader.includes('token-A')) {
      // Return a delayed response for token A
      return new Promise((resolve) => {
        delayedResolve = () =>
          resolve(
            new Response(
              JSON.stringify({
                items: [{ id: 'u-A', fullName: 'User From Token A', email: 'a@example.com', roles: ['VAULT_OWNER'], status: 'ACTIVE' }],
                total: 1,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
      });
    }
    // Token B returns immediately with User B
    return new Response(
      JSON.stringify({
        items: [{ id: 'u-B', fullName: 'User From Token B', email: 'b@example.com', roles: ['ADMIN'], status: 'ACTIVE' }],
        total: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', fetchOnMount: true, accessToken: 'token-A' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 10)); });

      // Change session to token-B before token-A resolves
      await view.rerender({ lang: 'vi', fetchOnMount: true, accessToken: 'token-B' });
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });

      // Verify Token B data is displayed
      assert.ok(view.host.textContent.includes('User From Token B'));

      // Now the delayed response for Token A resolves late
      if (delayedResolve) {
        await act(async () => {
          delayedResolve();
          await new Promise((r) => setTimeout(r, 30));
        });
      }

      // Assert Token A data was DISCARDED and did NOT overwrite or pollute Token B session
      assert.equal(
        view.host.textContent.includes('User From Token A'),
        false,
        'Late response from Token A must be discarded and NOT overwrite Token B'
      );
      assert.ok(view.host.textContent.includes('User From Token B'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

test('REPRO Lỗi 2: AdminUsersPage discards late response on rapid reload/retry', async () => {
  const prevFetch = globalThis.fetch;
  let delayedResolve1 = null;
  let callCount = 0;

  globalThis.fetch = async () => {
    callCount++;
    if (callCount === 1) {
      // First reload request is slow
      return new Promise((resolve) => {
        delayedResolve1 = () =>
          resolve(
            new Response(
              JSON.stringify({
                items: [{ id: 'u-1', fullName: 'Slow Result 1', email: 'slow1@example.com', roles: ['ADMIN'], status: 'ACTIVE' }],
                total: 1,
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
      });
    }
    // Second reload request returns fast with fresh data
    return new Response(
      JSON.stringify({
        items: [{ id: 'u-2', fullName: 'Fresh Result 2', email: 'fresh2@example.com', roles: ['ADMIN'], status: 'ACTIVE' }],
        total: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', fetchOnMount: false, accessToken: 'token-1' });
    try {
      // Trigger slow reload 1 by clicking search/reload
      const searchForm = view.host.querySelector('form');
      await act(async () => {
        searchForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 10));
      });

      // Trigger fast reload 2 before reload 1 finishes
      await act(async () => {
        searchForm.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        await new Promise((r) => setTimeout(r, 20));
      });

      // Fresh Result 2 is displayed
      assert.ok(view.host.textContent.includes('Fresh Result 2'));

      // Now slow reload 1 resolves late
      if (delayedResolve1) {
        await act(async () => {
          delayedResolve1();
          await new Promise((r) => setTimeout(r, 20));
        });
      }

      // Assert Slow Result 1 was discarded and did NOT overwrite Fresh Result 2
      assert.equal(
        view.host.textContent.includes('Slow Result 1'),
        false,
        'Slow reload 1 response must be discarded and NOT overwrite fresh reload 2'
      );
      assert.ok(view.host.textContent.includes('Fresh Result 2'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = prevFetch;
  }
});

