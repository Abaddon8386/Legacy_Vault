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

const connectivityPage = {content:[],page:0,size:10,totalElements:0,totalPages:0};
const connectivityJson = body => new Response(JSON.stringify(body),{status:200,headers:{'Content-Type':'application/json'}});
for (const status of [502,503,504]) test(`Admin HTTP ${status} offers retry rather than claiming the API is unimplemented`,async()=>{
 const previous=globalThis.fetch;let reads=0,expired=0;
 globalThis.fetch=async()=>++reads===1?(status===503
  ?new Response(JSON.stringify({code:'BACKEND_NOT_READY'}),{status,headers:{'Content-Type':'application/json'}})
  :new Response('Temporary gateway failure',{status})):connectivityJson(connectivityPage);
 const view=await mount(AdminLogsPage,{accessToken:'synthetic',fetchOnMount:true,lang:'vi',onUnauthorized(){expired++;}});
 try{
  assert.ok(view.host.querySelector('[role=alert]'));
  const retry=[...view.host.querySelectorAll('button')].find(button=>button.textContent==='Thử lại');assert.ok(retry);
  await act(async()=>retry.click());
  assert.equal(reads,2);assert.equal(expired,0);assert.equal(view.host.querySelector('[role=alert]'),null);
 }finally{await view.close();globalThis.fetch=previous;}
});

test('Admin timeout stops loading, aborts its read and ignores late success before manual retry',async t=>{
 const previous=globalThis.fetch;let reads=0,expired=0,release,signal;
 globalThis.fetch=async(_url,options)=>{reads++;if(reads===1){signal=options.signal;return new Promise(resolve=>{release=resolve;});}return connectivityJson(connectivityPage);};
 t.mock.timers.enable({apis:['setTimeout']});
 const view=await mount(AdminLogsPage,{accessToken:'synthetic',fetchOnMount:true,lang:'vi',onUnauthorized(){expired++;}});
 try{
  await act(async()=>t.mock.timers.tick(19999));assert.equal(signal.aborted,false);
  await act(async()=>t.mock.timers.tick(1));assert.equal(signal.aborted,true);
  assert.match(view.host.querySelector('[role=alert]').textContent,/phản hồi quá lâu/);
  await act(async()=>release(connectivityJson(connectivityPage)));
  assert.match(view.host.querySelector('[role=alert]').textContent,/phản hồi quá lâu/);
  assert.equal(reads,1);assert.equal(expired,0);
  const retry=[...view.host.querySelectorAll('button')].find(button=>button.textContent==='Thử lại');
  await act(async()=>retry.click());assert.equal(reads,2);assert.equal(view.host.querySelector('[role=alert]'),null);
  await act(async()=>t.mock.timers.tick(20000));assert.equal(view.host.querySelector('[role=alert]'),null);
 }finally{await view.close();t.mock.timers.reset();globalThis.fetch=previous;}
});

test('Admin detail timeout has its own retry and late unauthorized response cannot log out the current session',async t=>{
 const previous=globalThis.fetch;let details=0,expired=0,signal,release;
 const event={id:userId,occurredAt:'2026-11-02T08:00:00Z',actor:{kind:'SYSTEM',userId:null},action:'VAULT_CREATED',entityType:'VAULT',vaultId:null};
 globalThis.fetch=async(url,options)=>{
  if(url.includes('?'))return connectivityJson({...connectivityPage,content:[event],totalElements:1,totalPages:1});
  details++;if(details===1){signal=options.signal;return new Promise(resolve=>{release=resolve;});}
  return connectivityJson({event,traceId:null});
 };
 t.mock.timers.enable({apis:['setTimeout']});
 const view=await mount(AdminLogsPage,{accessToken:'synthetic',fetchOnMount:true,lang:'vi',onUnauthorized(){expired++;}});
 try{
  await act(async()=>[...view.host.querySelectorAll('button')].find(button=>button.textContent.includes('Xem chi tiết')).click());
  await act(async()=>t.mock.timers.tick(20000));assert.equal(signal.aborted,true);
  const dialog=view.host.querySelector('[role=dialog]');assert.match(dialog.querySelector('[role=alert]').textContent,/phản hồi quá lâu/);
  await act(async()=>release(new Response('',{status:401})));
  assert.equal(expired,0);assert.equal(details,1);
  await act(async()=>[...dialog.querySelectorAll('button')].find(button=>button.textContent==='Thử lại').click());
  assert.equal(details,2);assert.equal(dialog.querySelector('[role=alert]'),null);
 }finally{await view.close();t.mock.timers.reset();globalThis.fetch=previous;}
});

test('leaving Admin cancels the pending read and its timeout without notifying logout',async t=>{
 const previous=globalThis.fetch;let signal,expired=0,reads=0;
 globalThis.fetch=async(_url,options)=>{signal=options.signal;reads++;return new Promise(()=>{});};
 t.mock.timers.enable({apis:['setTimeout']});
 const view=await mount(AdminLogsPage,{accessToken:'synthetic',fetchOnMount:true,lang:'vi',onUnauthorized(){expired++;}});
 try{
  await view.close();assert.equal(signal.aborted,true);
  await act(async()=>t.mock.timers.tick(20000));assert.equal(expired,0);assert.equal(reads,1);
 }finally{t.mock.timers.reset();globalThis.fetch=previous;}
});

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
        b.getAttribute('aria-label') === 'Xem chi tiết'
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

for (const lang of ['vi', 'en']) test(`AdminUsersPage hides lock and unlock controls but displays account status (${lang})`, async () => {
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
      assert.equal(view.host.querySelector('#admin-lock-policy-notice'), null);
      const label = (button) => button.getAttribute('aria-label');
      const viewLabel = lang === 'en' ? 'View details' : 'Xem chi tiết';
      const lockLabel = lang === 'en' ? 'Lock account' : 'Khóa tài khoản';
      const unlockLabel = lang === 'en' ? 'Unlock account' : 'Mở khóa tài khoản';
      // Row actions are icon buttons named by aria-label; locking is a per-row toggle, never a pair of buttons.
      const [activeRow, lockedRow] = [...view.host.querySelectorAll('tbody tr')];
      const rowButtons = (row) => [...row.querySelectorAll('button')];
      assert.deepEqual(rowButtons(activeRow).map(label), [viewLabel, lockLabel]);
      assert.deepEqual(rowButtons(lockedRow).map(label), [viewLabel, unlockLabel]);
      assert.ok(rowButtons(activeRow).every(button => !button.disabled), 'Active account actions are available');
      assert.ok(rowButtons(lockedRow).every(button => button.textContent.trim() === ''), 'icons only, no text labels');
      assert.equal(view.host.querySelector('.lv-admin-status-locked')?.textContent.trim(), lang === 'en' ? 'Locked' : 'Đã khóa');
      assert.equal(requests, 1);
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
      assert.ok(view.host.textContent.includes('Hệ thống'));
      assert.ok(view.host.textContent.includes(actorId));
      assert.ok(view.host.textContent.includes('DMS_TRIGGERED'));
      assert.ok(view.host.textContent.includes('VAULT_CREATED'));

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

test('AppShell renders all 4 Admin tabs and preserves 13 render sites including Shared with me', async () => {
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
    13,
    'Expected 13 AppShell render sites after personal portal unification including the Shared with me route from develop'
  );
});

// Exact PS-109 wire fixtures; IDs and createdAt below are synthetic test-only values.

function wireUser(value, index = 0) {
  const rest = { ...value }; delete rest.id;
  return { ...rest, publicId: value.publicId || (index ? '22222222-2222-4222-8222-222222222222' : userId),
    createdAt: value.createdAt || '2026-10-20T10:00:00Z' };
}
function userPage(users) { return { content: users.map(wireUser), page: 0, size: 10, totalElements: users.length, totalPages: users.length ? 1 : 0 }; }

for (const lang of ['vi', 'en']) test(`account and owner vault columns filter independently and reset on role changes (${lang})`, async () => {
  const previous = globalThis.fetch;
  const requests = [];
  const row = { publicId: userId, fullName: 'Owner fixture', email: 'owner@example.test', roles: ['ROLE_VAULT_OWNER', 'ROLE_BENEFICIARY'], status: 'LOCKED', vaultStatus: 'IN_PROCESS', createdAt: '2026-10-20T10:00:00Z' };
  globalThis.fetch = async url => {
    const params = new URL(url, 'http://local').searchParams;
    if (!url.includes('/admin/users?')) return connectivityJson(row);
    requests.push(params);
    const page = Number(params.get('page'));
    return connectivityJson({content: [row], page, size: 10, totalElements: 11, totalPages: 2});
  };
  const view = await mount(AdminUsersPage, {lang, accessToken: 'test', fetchOnMount: true});
  const change = async (select, value) => act(async () => {
    select.value = value;
    select.dispatchEvent(new window.Event('change', {bubbles: true}));
  });
  const vaultLabel = lang === 'vi' ? 'Tình trạng kho' : 'Vault status';
  const accountLabel = lang === 'vi' ? 'Trạng thái tài khoản' : 'Account status';
  try {
    assert.equal(view.host.querySelector(`select[aria-label="${vaultLabel}"]`), null);
    assert.equal(view.host.querySelectorAll('thead th').length, 6);
    assert.ok([...view.host.querySelectorAll('thead th')].some(th => th.textContent === accountLabel));
    const role = view.host.querySelectorAll('select')[0];
    const account = view.host.querySelectorAll('select')[1];
    await change(account, 'PENDING');
    await change(role, 'VAULT_OWNER');
    assert.deepEqual([...account.options].map(option => option.value), ['', 'ACTIVE', 'LOCKED']);
    assert.equal(account.value, '');
    assert.equal(requests.at(-1).has('status'), false);
    assert.equal(view.host.querySelectorAll('thead th').length, 7);
    assert.equal(view.host.querySelectorAll('tbody tr')[0].children.length, 7);
    const vault = view.host.querySelector(`select[aria-label="${vaultLabel}"]`);
    assert.deepEqual([...vault.options].map(option => option.value), ['', 'NO_VAULT', 'ACTIVE', 'IN_PROCESS', 'ARCHIVED']);
    assert.match(view.host.querySelector('.lv-admin-vault-in_process').textContent, lang === 'vi' ? /Đang xử lý/ : /In process/);
    await change(account, 'LOCKED');
    await change(vault, 'IN_PROCESS');
    assert.equal(requests.at(-1).get('status'), 'LOCKED');
    assert.equal(requests.at(-1).get('vaultStatus'), 'IN_PROCESS');
    const next = [...view.host.querySelectorAll('button')].find(button => button.textContent === (lang === 'vi' ? 'Trang sau' : 'Next'));
    await act(async () => next.click());
    assert.equal(requests.at(-1).get('page'), '1');
    await change(vault, 'ARCHIVED');
    assert.equal(requests.at(-1).get('page'), '0');
    assert.equal(requests.at(-1).get('vaultStatus'), 'ARCHIVED');
    await act(async () => view.host.querySelector('tbody button').click());
    const dialog = view.host.querySelector('[role=dialog]');
    assert.ok(dialog.textContent.includes(vaultLabel));
    assert.match(dialog.textContent, lang === 'vi' ? /Đã khóa/ : /Locked/);
    await act(async () => dialog.querySelector('button').click());
    await change(role, 'BENEFICIARY');
    assert.equal(view.host.querySelectorAll('thead th').length, 6);
    assert.equal(view.host.querySelector(`select[aria-label="${vaultLabel}"]`), null);
    assert.equal(requests.at(-1).has('vaultStatus'), false);
    assert.equal(requests.at(-1).get('status'), 'LOCKED');
    await change(role, 'VAULT_OWNER');
    assert.equal(view.host.querySelector(`select[aria-label="${vaultLabel}"]`).value, '');
    assert.equal(requests.at(-1).has('vaultStatus'), false);
    const reset = [...view.host.querySelectorAll('button')].find(button => button.textContent === (lang === 'vi' ? 'Xóa bộ lọc' : 'Clear filters'));
    await act(async () => reset.click());
    assert.equal(view.host.querySelectorAll('thead th').length, 6);
    assert.equal(requests.at(-1).has('status'), false);
    assert.equal(requests.at(-1).has('role'), false);
    await change(account, 'DELETED');
    await change(role, 'VAULT_OWNER');
    assert.equal(account.value, '');
    assert.equal(requests.at(-1).has('status'), false);
  } finally { await view.close(); globalThis.fetch = previous; }
});

for (const role of ['BENEFICIARY', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER']) {
  for (const lang of ['vi', 'en']) test(`processing account status is displayed and filtered for ${role} (${lang})`, async () => {
    const previous = globalThis.fetch;
    const requests = [];
    const row = {publicId: userId, fullName: 'Actor', email: 'actor@example.test', roles: ['ROLE_' + role], status: 'ACTIVE', accountStatus: 'IN_PROCESS', createdAt: '2026-10-20T10:00:00Z'};
    globalThis.fetch = async url => {
      requests.push(new URL(url, 'http://local'));
      const otherRole=new URL(url,'http://local').searchParams.get('role')==='ROLE_VAULT_OWNER';
      return connectivityJson(url.includes('/admin/users?') ? {content:otherRole?[]:[row],page:0,size:10,totalElements:otherRole?0:1,totalPages:otherRole?0:1} : row);
    };
    const view = await mount(AdminUsersPage, {lang, accessToken:'test', fetchOnMount:true});
    const change = async (select,value) => act(async () => {select.value=value;select.dispatchEvent(new window.Event('change',{bubbles:true}));});
    try {
      const roleSelect=view.host.querySelectorAll('select')[0];
      const statusSelect=view.host.querySelectorAll('select')[1];
      await change(roleSelect,role);
      assert.deepEqual([...statusSelect.options].map(option=>option.value),['','ACTIVE','LOCKED','IN_PROCESS']);
      assert.equal(view.host.querySelectorAll('thead th').length,6);
      assert.equal(view.host.querySelector('.lv-admin-status-in_process').textContent.trim(),lang==='vi'?'Đang xử lý':'In process');
      await change(statusSelect,'IN_PROCESS');
      assert.equal(requests.at(-1).searchParams.get('role'),'ROLE_'+role);
      assert.equal(requests.at(-1).searchParams.get('status'),'IN_PROCESS');
      assert.equal(requests.at(-1).searchParams.has('vaultStatus'),false);
      await act(async()=>view.host.querySelector('tbody button').click());
      assert.equal(requests.at(-1).searchParams.get('role'),'ROLE_'+role);
      const dialog=view.host.querySelector('[role=dialog]');
      assert.match(dialog.textContent,lang==='vi'?/Đang xử lý/:/In process/);
      await act(async()=>dialog.querySelector('button').click());
      await change(roleSelect,'VAULT_OWNER');
      assert.equal(statusSelect.value,'');
      assert.equal(requests.at(-1).searchParams.has('status'),false);
      assert.equal([...statusSelect.options].some(option=>option.value==='IN_PROCESS'),false);
      assert.equal(view.host.querySelector('[role=alert]'),null);
    } finally {await view.close();globalThis.fetch=previous;}
  });
}
