const userId = '11111111-1111-4111-8111-111111111111';
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

function auditEvent() {
  return { id: '22222222-2222-4222-8222-222222222222', occurredAt: '2026-10-20T10:00:00Z',
    actor: { kind: 'SYSTEM', userId: null }, action: 'VAULT_CREATED', entityType: 'VAULT', vaultId: null };
}
function pageFixture(Component, name) {
  return Component === AdminUsersPage ? userPage([{ fullName: name, status: 'ACTIVE' }])
    : { content: [auditEvent()], page: 0, size: 10, totalElements: 1, totalPages: 1 };
}
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
    publicId: '11111111-1111-4111-8111-111111111111',
    email: 'user@example.com',
  });
  assert.notEqual(
    user.status,
    'ACTIVE',
    'User status must NOT default to ACTIVE when missing from backend'
  );
  assert.equal(user.status, null);
});

test('overview missing metrics remain unknown with PS-107 fields', () => {
  const overview = validateAdminOverview({ totalAccounts: 100 });
  assert.equal(overview.completedAt, null);
  assert.equal(overview.activeVaults, null);
  assert.equal(overview.processingCases, null);
  assert.equal(overview.roleDistribution.VAULT_OWNER, null);
});
test('incomplete audit event is rejected instead of fabricating actor or time', () => {
  assert.throws(() => validateAdminAuditLog({ id: 'aud-1' }));
});

// =========================================================================
// 2. REPRO TEST: Lỗi 4 - Response sai cấu trúc: báo lỗi dữ liệu, không biến thành empty thành công
// =========================================================================

test('REPRO Lỗi 4: fetchAdminUsers must throw error on malformed response without items array', async () => {
  const prevFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    fixtureResponse(JSON.stringify({ malformed: true }), {
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
    fixtureResponse(JSON.stringify({ unexpectedField: 'xyz' }), {
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

  globalThis.fetch = async url => {
    if (url.endsWith('/' + userId)) return fixtureResponse(JSON.stringify(wireUser({ fullName: 'User 1', email: 'u1@example.com', roles: ['ADMIN'], status: 'ACTIVE' })));
    fetchCount++;
    if (fetchCount === 1) {
      // First call succeeds with 1 user
      return fixtureResponse(
        JSON.stringify(userPage([{ id: 'u-1', fullName: 'User 1', email: 'u1@example.com', roles: ['ADMIN'], status: 'ACTIVE' }])),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    // Second call (e.g. reload or search) returns 403 Forbidden
    return fixtureResponse(JSON.stringify({ code: 'FORBIDDEN' }), { status: 403 });
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
            fixtureResponse(
              JSON.stringify(userPage([{ id: 'u-A', fullName: 'User From Token A', email: 'a@example.com', roles: ['VAULT_OWNER'], status: 'ACTIVE' }])),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
      });
    }
    // Token B returns immediately with User B
    return fixtureResponse(
      JSON.stringify(userPage([{ id: 'u-B', fullName: 'User From Token B', email: 'b@example.com', roles: ['ADMIN'], status: 'ACTIVE' }])),
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
            fixtureResponse(
              JSON.stringify(userPage([{ id: 'u-1', fullName: 'Slow Result 1', email: 'slow1@example.com', roles: ['ADMIN'], status: 'ACTIVE' }])),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
      });
    }
    // Second reload request returns fast with fresh data
    return fixtureResponse(
      JSON.stringify(userPage([{ id: 'u-2', fullName: 'Fresh Result 2', email: 'fresh2@example.com', roles: ['ADMIN'], status: 'ACTIVE' }])),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const view = await mount(AdminUsersPage, { lang: 'vi', fetchOnMount: true, accessToken: 'token-1' });
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


const AdminLogsPage = await loadComponent('src/pages/admin/AdminLogsPage.jsx');
const AdminHome = await loadComponent('src/pages/admin/AdminHome.jsx');

test('missing and malformed counts never become zero or a partial total', () => {
  for (const value of [null, undefined, '', ' ', false, [], -1, 1.5]) {
    const data = validateAdminOverview({ activeVaults: value, processingCases: value, roleAssignments: { ROLE_ADMIN: value } });
    assert.equal(data.totalAccounts, null);
    assert.equal(data.activeVaults, null);
    assert.equal(data.processingCases, null);
    assert.equal(data.roleDistribution.ADMIN, null);
    assert.equal(data.totalRolesAssigned, null);
  }
  assert.equal(validateAdminOverview({ totalAccounts: 0 }).totalAccounts, 0);
});

test('audit metadata without an approved field contract is never exposed', () => {
  for (const metadata of [{ payload: { password: 'SENSITIVE' } }, { note: 'SENSITIVE' }, 'SENSITIVE', [{ token: 'SENSITIVE' }]]) {
    const log = validateAdminAuditLog({ ...auditEvent(), context: metadata, stateBefore: metadata, stateAfter: metadata });
    assert.equal(log.context, undefined);
    assert.equal(log.stateBefore, undefined);
    assert.equal(log.stateAfter, undefined);
  }
});

test('pending contract mode never fetches on mount, filter, submit or token change', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => { calls++; throw new Error('unexpected request'); };
  try {
    for (const Component of [AdminUsersPage, AdminLogsPage, AdminHome]) {
      const view = await mount(Component, { accessToken: 'A', fetchOnMount: false });
      try {
        await act(async () => {
          const select = view.host.querySelector('select');
          if (select) {
            select.value = select.options[1].value;
            select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
          }
          view.host.querySelector('form')?.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
        });
        await view.rerender({ accessToken: 'B', fetchOnMount: false });
      } finally { await view.close(); }
    }
    assert.equal(calls, 0);
  } finally { globalThis.fetch = previous; }
});

for (const Component of [AdminUsersPage, AdminLogsPage]) {
  test(Component.name + ' hides old details during reload and ignores response after unmount', async () => {
    const previous = globalThis.fetch;
    let resolveLate;
    let lateSignal;
    let calls = 0;
    globalThis.fetch = async (_url, options) => {
      if (++calls === 1) return fixtureResponse(JSON.stringify(pageFixture(Component, 'OLD_RECORD')), { headers: { 'Content-Type': 'application/json' } });
      lateSignal = options.signal;
      return new Promise((resolve) => { resolveLate = resolve; });
    };
    let view;
    try {
      view = await mount(Component, { accessToken: 'A', fetchOnMount: true });
      const button = [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Xem chi tiết'));
      await act(async () => button.click());
      assert.ok(view.host.querySelector('[role="dialog"]'));
      await act(async () => view.host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
      assert.equal(view.host.querySelector('[role="dialog"]'), null);
      assert.equal(view.host.textContent.includes('OLD_RECORD'), false);
      await view.close(); view = null;
      assert.equal(lateSignal.aborted, true);
      await act(async () => resolveLate(fixtureResponse(JSON.stringify(userPage([])))));
    } finally { if (view) await view.close(); globalThis.fetch = previous; }
  });
}

for (const Component of [AdminUsersPage, AdminLogsPage]) {
  test(Component.name + ' clears details on filter change and keeps data hidden after malformed response', async () => {
    const previous = globalThis.fetch;
    let resolveLate;
    let calls = 0;
    globalThis.fetch = async () => {
      if (++calls === 1) return fixtureResponse(JSON.stringify(pageFixture(Component, 'OLD_FILTER')), { headers: { 'Content-Type': 'application/json' } });
      return new Promise((resolve) => { resolveLate = resolve; });
    };
    let view;
    try {
      view = await mount(Component, { accessToken: 'A', fetchOnMount: true });
      await act(async () => [...view.host.querySelectorAll('button')].find((b) => b.textContent.includes('Xem chi tiết')).click());
      await act(async () => {
        const select = view.host.querySelector('select');
        select.value = select.options[1].value;
        select.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      assert.equal(view.host.querySelector('[role="dialog"]'), null);
      assert.equal(view.host.textContent.includes('OLD_FILTER'), false);
      await act(async () => resolveLate(fixtureResponse(JSON.stringify({ malformed: true }))));
      assert.ok(view.host.querySelector('[role="alert"]'));
      assert.equal(view.host.textContent.includes('OLD_FILTER'), false);
      assert.equal(view.host.querySelector('[role="dialog"]'), null);
    } finally { if (view) await view.close(); globalThis.fetch = previous; }
  });
}

test('returning to a previous token never revives its previous successful result', async () => {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    if (++calls === 1) return fixtureResponse(JSON.stringify(userPage([{ id: 'old', fullName: 'PREVIOUS_SESSION' }])));
    return new Promise(() => {});
  };
  let view;
  try {
    view = await mount(AdminUsersPage, { accessToken: 'A', fetchOnMount: true });
    assert.ok(view.host.textContent.includes('PREVIOUS_SESSION'));
    await view.rerender({ accessToken: 'B', fetchOnMount: true });
    await view.rerender({ accessToken: 'A', fetchOnMount: true });
    assert.equal(view.host.textContent.includes('PREVIOUS_SESSION'), false);
  } finally { if (view) await view.close(); globalThis.fetch = previous; }
});

test('audit detail 403 clears list and open detail, without retaining event metadata', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async url => fixtureResponse(JSON.stringify(url.includes('?') ? {
    content: [auditEvent()], page: 0, size: 10, totalElements: 1, totalPages: 1,
  } : { code: 'ACCESS_DENIED' }), { status: url.includes('?') ? 200 : 403, headers: { 'Content-Type': 'application/json' } });
  let view;
  try {
    view = await mount(AdminLogsPage, { accessToken: 'A', fetchOnMount: true });
    await act(async () => [...view.host.querySelectorAll('button')].find(b => b.textContent.includes('Xem chi tiết')).click());
    assert.equal(view.host.querySelector('[role="dialog"]'), null);
    assert.equal(view.host.querySelector('tbody').textContent.includes('VAULT_CREATED'), false);
    assert.ok(view.host.querySelector('[role="alert"]'));
  } finally { if (view) await view.close(); globalThis.fetch = previous; }
});

// Exact PS-109 wire fixtures; IDs and createdAt below are synthetic test-only values.

function wireUser(value, index = 0) {
  const rest = { ...value }; delete rest.id;
  return { ...rest, publicId: value.publicId || (index ? '22222222-2222-4222-8222-222222222222' : userId),
    createdAt: value.createdAt || '2026-10-20T10:00:00Z' };
}
function userPage(users) { return { content: users.map(wireUser), page: 0, size: 10, totalElements: users.length, totalPages: users.length ? 1 : 0 }; }
function fixtureResponse(body, options = {}) { return new Response(body, { ...options, headers: { 'Content-Type': 'application/json', ...options.headers } }); }

test('user detail 403 revokes the displayed list and closes its dialog', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async url => url.includes('?')
    ? fixtureResponse(JSON.stringify(userPage([{ fullName: 'Restricted account', roles: ['ADMIN'], status: 'ACTIVE' }])))
    : fixtureResponse(JSON.stringify({ code: 'ACCESS_DENIED' }), { status: 403 });
  const view = await mount(AdminUsersPage, { accessToken: 'T', fetchOnMount: true, lang: 'en' });
  try {
    assert.match(view.host.textContent, /Restricted account/);
    await act(async () => [...view.host.querySelectorAll('button')].find(button => /view details/i.test(button.textContent)).click());
    assert.equal(view.host.querySelector('[role="dialog"]'), null);
    assert.doesNotMatch(view.host.querySelector('tbody').textContent, /Restricted account/);
    assert.ok(view.host.querySelector('[role="alert"]'));
  } finally { await view.close(); globalThis.fetch = original; }
});
