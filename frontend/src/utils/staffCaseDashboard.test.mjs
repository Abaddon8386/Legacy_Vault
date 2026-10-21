import { existsSync } from 'node:fs';
import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

import {
  isStaffSimulationPermitted,
  fetchStaffCases,
  SYNTHETIC_STAFF_CASES,
} from '../pages/staff/staffCaseService.js';
import { STAFF_CASE_I18N, getStaffCaseTranslations } from '../pages/staff/staffCaseI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/staff/cases?preview=true',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react(), ...(entry === 'src/App.jsx' ? [{
      name: 'ps25-test-auth-views',
      load(id) {
        if (id.replaceAll('\\', '/').endsWith('/pages/auth/LoginPage.jsx')) return `
          import React from 'react';
          export default function Login({onAuthenticated}) {
            return React.createElement('button', {onClick: () => onAuthenticated({
              accessToken: 'synthetic-route-token', tokenType: 'Bearer', expiresInSeconds: 3600,
              user: globalThis.__PS25_AUTH_USER__
            }, {lang: 'vi'})}, 'Test sign in');
          }`;
        if (id.replaceAll('\\', '/').endsWith('/pages/vault/VaultOverviewPage.jsx')) return `
          import React from 'react';
          export default function Vault() { return React.createElement('p', null, 'Owner dashboard marker'); }`;
      }
    }] : [])],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const dashboardMod = await loadComponentModule('src/pages/staff/StaffCaseDashboard.jsx');
const StaffCaseDashboard = dashboardMod.default;

const shellMod = await loadComponentModule('src/components/layout/StaffShell.jsx');
const StaffShell = shellMod.default;

const modalMod = await loadComponentModule('src/pages/staff/StaffCaseDetailModal.jsx');
const StaffCaseDetailModal = modalMod.default;

async function mount(Component, props) {
  // Each mount in this suite represents an independent browser session.
  window.sessionStorage.clear();
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    host,
    render: async (nextProps) => {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
    close: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

// ============================================================================
// 1. SERVICE & BOUNDARY GUARD TESTS
// ============================================================================

test('PS-25 Service: isStaffSimulationPermitted enforces safety boundaries', () => {
  // 1. Preview permitted in DEV without token
  assert.equal(isStaffSimulationPermitted({ isDevPreview: true }), true);
  assert.equal(isStaffSimulationPermitted({ isTest: true }), true);

  // 2. Real session accessToken blocks simulation
  assert.equal(isStaffSimulationPermitted({ isDevPreview: true, accessToken: 'real-jwt-token' }), false);

  // 3. Production build blocks simulation 100% even if isDevPreview is passed
  assert.equal(
    isStaffSimulationPermitted({ isDevPreview: true, testEnv: { PROD: true } }),
    false
  );
});

test('PS-25 service preserves server failures without synthetic fallback', async () => {
  await assert.rejects(fetchStaffCases({ accessToken: 'synthetic', fetchFn: async () => ({
    ok: false, status: 403, headers: { get: () => 'application/json' },
    json: async () => ({ code: 'ACCESS_DENIED' }) }) }), { code: 'ACCESS_DENIED', status: 403 });
});

test('PS-25 Service: Synthetic fixture supports filtering and pagination', async () => {
  // Page 0, Size 5 -> 5 cases
  const resPage1 = await fetchStaffCases({
    page: 0,
    size: 5,
    status: 'ALL',
    isTest: true,
  });
  assert.equal(resPage1.content.length, 5);
  assert.equal(resPage1.totalElements, 8);
  assert.equal(resPage1.totalPages, 2);
  assert.equal(resPage1.isSimulation, true);

  // Page 1, Size 5 -> Remaining 3 cases
  const resPage2 = await fetchStaffCases({
    page: 1,
    size: 5,
    status: 'ALL',
    isTest: true,
  });
  assert.equal(resPage2.content.length, 3);
  assert.equal(resPage2.page, 1);

  // Filter by AWAITING_VERIFICATION
  const resAwaiting = await fetchStaffCases({
    page: 0,
    size: 10,
    status: 'AWAITING_VERIFICATION',
    isTest: true,
  });
  assert.ok(resAwaiting.content.every((c) => c.status === 'AWAITING_VERIFICATION'));
  assert.equal(resAwaiting.totalElements, 4);
});

// ============================================================================
// 2. COMPONENT TESTS: STAFF CASE DASHBOARD
// ============================================================================

test('PS-25 Component: StaffCaseDashboard renders desktop table and mobile cards in preview', async () => {
  const view = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    // Wait for async load effect
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Check title and preview banner
    assert.match(view.host.textContent, /Hồ sơ cần xác minh/);
    assert.match(view.host.textContent, /QUẢN LÝ XÁC MINH DI SẢN/);
    assert.match(view.host.textContent, /DEV Preview/);

    // Desktop table rows
    const rows = view.host.querySelectorAll('.lv-staff-table-row');
    assert.equal(rows.length, 5);

    // Mobile cards
    const cards = view.host.querySelectorAll('.lv-staff-card');
    assert.equal(cards.length, 5);

    // Pagination info
    const paginationText = view.host.querySelector('.lv-staff-pagination-info').textContent;
    assert.match(paginationText, /1–5/);
    assert.match(paginationText, /8/);
  } finally {
    await view.close();
  }
});

test('PS-25 Component: Pagination next/prev and reset to page 0 on size or filter change', async () => {
  const view = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // 1. Next button
    const buttons = [...view.host.querySelectorAll('.lv-staff-nav-btn')];
    const prevBtn = buttons.find((b) => b.textContent.includes('Trước'));
    const nextBtn = buttons.find((b) => b.textContent.includes('Sau'));

    assert.equal(prevBtn.disabled, true);
    assert.equal(nextBtn.disabled, false);

    // Click Next -> Page 2
    await act(async () => {
      nextBtn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    const page2Info = view.host.querySelector('.lv-staff-pagination-info').textContent;
    assert.match(page2Info, /6–8/);
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 3);

    // Next is now disabled on last page
    const buttonsPage2 = [...view.host.querySelectorAll('.lv-staff-nav-btn')];
    const nextBtnPage2 = buttonsPage2.find((b) => b.textContent.includes('Sau'));
    assert.equal(nextBtnPage2.disabled, true);

    // 2. Change size dropdown -> resets to page 0
    const sizeSelect = view.host.querySelector('#staff-page-size-select');
    await act(async () => {
      sizeSelect.value = '10';
      sizeSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });

    const pageResetInfo = view.host.querySelector('.lv-staff-pagination-info').textContent;
    assert.match(pageResetInfo, /1–8/);
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 8);

    // 3. Change filter -> resets to page 0
    const filterSelect = view.host.querySelector('.lv-staff-filter-select');
    await act(async () => {
      filterSelect.value = 'VERIFIED';
      filterSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });

    const filteredRows = view.host.querySelectorAll('.lv-staff-table-row');
    assert.equal(filteredRows.length, 2);
    assert.match(view.host.querySelector('.lv-staff-pagination-info').textContent, /1–2/);
  } finally {
    await view.close();
  }
});

test('PS-25 Component: Clearing a selected filter restores all cases', async () => {
  const view = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Select filter that has cases
    const filterSelect = view.host.querySelector('.lv-staff-filter-select');
    await act(async () => {
      filterSelect.value = 'VERIFIED';
      filterSelect.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      await new Promise((r) => setTimeout(r, 50));
    });

    // Clear button should be visible in toolbar
    const clearBtn = view.host.querySelector('.lv-staff-btn-clear');
    assert.ok(clearBtn, 'Clear button must exist when filter is not ALL');

    await act(async () => {
      clearBtn.click();
      await new Promise((r) => setTimeout(r, 50));
    });

    // Back to ALL (8 cases)
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 5);
  } finally {
    await view.close();
  }
});

test('PS-25 Component: Detail modal opens read-only information with PS-25/PS-26 notice', async () => {
  const view = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    lang: 'vi',
  });

  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Click "Xem hồ sơ" on first desktop row
    const viewBtn = view.host.querySelector('.lv-staff-view-btn');
    assert.ok(viewBtn);

    await act(async () => {
      viewBtn.click();
    });

    // Modal should now be rendered in DOM
    const modal = document.querySelector('.lv-modal');
    assert.ok(modal, 'Modal should be mounted');
    assert.match(modal.textContent, /CASE-2026-0001/);
    assert.match(modal.textContent, /Kho Di Sản Gia Đình Vance/);
    assert.match(modal.textContent, /Trần Đình Trọng/);
    assert.match(modal.textContent, /Lưu ý nghiệp vụ PS-25/);
    assert.match(modal.textContent, /PS-26/);

    // Verify NO illegal buttons exist (no approve, unlock, decrypt, death confirm)
    const modalText = [...modal.querySelectorAll('button')].map(button => button.textContent).join(' ').toLowerCase();
    assert.equal(modalText.includes('xác nhận tử vong'), false);
    assert.equal(modalText.includes('mở khóa kho'), false);
    assert.equal(modalText.includes('bàn giao'), false);
    assert.equal(modalText.includes('phê duyệt pháp lý'), false);

    // Close button
    const closeBtn = modal.querySelector('.lv-case-detail__close-btn');
    await act(async () => {
      closeBtn.click();
    });

    assert.equal(document.querySelector('.lv-modal'), null);
  } finally {
    await view.close();
  }
});

test('PS-25 Component: Live mode displays "Dịch vụ chưa sẵn sàng" and no fake synthetic data', async () => {
  const view = await mount(StaffCaseDashboard, {
    accessToken: 'real-user-token',
    loadCases: async () => { const error = new Error('PS-35'); error.code = 'BACKEND_NOT_READY'; throw error; },
    isDevPreview: false,
    lang: 'vi',
  });

  try {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 50));
    });

    // Must display BACKEND_NOT_READY state card
    assert.match(view.host.textContent, /Dịch vụ tiếp nhận hồ sơ chưa sẵn sàng/);
    assert.match(view.host.textContent, /PS-35/);

    // Must NOT leak synthetic cases
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 0);
    assert.equal(view.host.textContent.includes('CASE-2026-0001'), false);
  } finally {
    await view.close();
  }
});

// ============================================================================
// 3. COMPONENT TESTS: STAFF SHELL & I18N
// ============================================================================

test('PS-25 Shell: StaffShell renders header, role badge, language toggle, and logout', async () => {
  let toggledLang = null;
  let loggedOut = false;
  let refreshed = false;
  let profileOpened = false;

  const view = await mount(StaffShell, {
    lang: 'vi',
    isPreview: true,
    session: { accessToken: 'synthetic-staff-menu', expiresAt: Date.now() + 60000,
      user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Staff User', email: 'staff@example.test', roles: ['STAFF_EXECUTOR'] } },
    onNavigateProfile: () => { profileOpened = true; },
    onToggleLang: (l) => {
      toggledLang = l;
    },
    onLogout: () => {
      loggedOut = true;
    },
    onRefresh: () => {
      refreshed = true;
    },
    children: React.createElement('div', { id: 'test-child' }, 'Workspace Content'),
  });

  try {
    // Role badge
    assert.match(view.host.textContent, /Staff User/);
    assert.match(view.host.textContent, /Cổng Nhân viên/);
    assert.ok(view.host.querySelector('#test-child'));

    // Language toggle
    const langBtn = view.host.querySelector('.lv-shell-lang-toggle button:nth-child(2)');
    await act(async () => {
      langBtn.click();
    });
    assert.equal(toggledLang, 'en');

    // Logout
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    const profileBtn = [...view.host.querySelectorAll('[role="menuitem"]')].find(button => button.textContent.includes('Hồ sơ tài khoản'));
    await act(async () => profileBtn.click());
    assert.equal(profileOpened, true);
    await act(async () => view.host.querySelector('.lv-user-badge-card').click());
    const logoutBtn = view.host.querySelector('.lv-account-menu-item--logout');
    await act(async () => {
      logoutBtn.click();
    });
    assert.equal(loggedOut, true);
  } finally {
    await view.close();
  }
});

test('PS-25 i18n: Complete bilingual translations for VI and EN', () => {
  const vi = getStaffCaseTranslations('vi');
  const en = getStaffCaseTranslations('en');

  assert.equal(vi.portalTitle, 'Cổng Xác Minh Hồ Sơ');
  assert.equal(en.portalTitle, 'Staff Verification Portal');

  assert.equal(vi.title, 'Hồ sơ cần xác minh');
  assert.equal(en.title, 'Verification Cases Queue');

  assert.equal(vi.table.colCaseRef, 'Mã hồ sơ');
  assert.equal(en.table.colCaseRef, 'Case Reference');
});


test('PS-25: loading hides old rows and open detail until the requested page is ready', async () => {
  const requests = [];
  const loadCases = options => new Promise(resolve => requests.push({ options, resolve }));
  const view = await mount(StaffCaseDashboard, { isDevPreview: true, loadCases });
  try {
    const receipt = await fetchStaffCases({ isTest: true });
    await act(async () => requests[0].resolve(receipt));
    await act(async () => view.host.querySelector('.lv-staff-view-btn').click());
    assert.ok(document.querySelector('.lv-modal'));
    await view.render({ isDevPreview: true, loadCases, onRefreshTrigger: 1 });
    assert.ok(view.host.querySelector('.lv-staff-skeleton'));
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 0);
    assert.equal(document.querySelector('.lv-modal'), null);
    await act(async () => requests[1].resolve(receipt));
    const next = [...view.host.querySelectorAll('.lv-staff-nav-btn')].find(b => b.textContent.includes('Sau'));
    await act(async () => next.click());
    assert.ok(view.host.querySelector('.lv-staff-skeleton'));
    assert.equal(view.host.querySelector('.lv-staff-pagination-info'), null);
    await act(async () => requests[2].resolve({ ...receipt, page: 1, content: receipt.content.slice(0, 3) }));
    assert.match(view.host.querySelector('.lv-staff-pagination-info').textContent, /6–8/);
  } finally { await view.close(); }
});

test('PS-25: empty list and no matching filter render their distinct states', async () => {
  const empty = async options => ({ content: [], page: 0, size: options.size, totalElements: 0, totalPages: 1 });
  const view = await mount(StaffCaseDashboard, { isDevPreview: true, loadCases: empty });
  try {
    assert.match(view.host.textContent, /Chưa có hồ sơ cần xác minh/);
    const filter = view.host.querySelector('.lv-staff-filter-select');
    await act(async () => {
      filter.value = 'VERIFIED';
      filter.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
    assert.match(view.host.textContent, /Không tìm thấy hồ sơ phù hợp/);
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 0);
    await act(async () => view.host.querySelector('.lv-staff-btn-clear').click());
    assert.match(view.host.textContent, /Chưa có hồ sơ cần xác minh/);
  } finally { await view.close(); }
});

test('PS-25: failed requests can retry and late responses cannot overwrite current context', async () => {
  const requests = [];
  const loader = options => new Promise((resolve, reject) => requests.push({ options, resolve, reject }));
  const props = { isDevPreview: true, loadCases: loader };
  const view = await mount(StaffCaseDashboard, props);
  try {
    await act(async () => requests[0].reject(new Error('Synthetic failure')));
    assert.match(view.host.textContent, /Không thể tải danh sách hồ sơ/);
    await act(async () => [...view.host.querySelectorAll('button')].find(b => b.textContent.includes('Thử lại')).click());
    assert.ok(view.host.querySelector('.lv-staff-skeleton'));
    await view.render({ ...props, lang: 'en' });
    assert.equal(requests[1].options.signal.aborted, true);
    await act(async () => requests[2].resolve(await fetchStaffCases({ isTest: true })));
    await act(async () => requests[1].resolve({ content: [], totalElements: 0, totalPages: 1, page: 0, size: 5 }));
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 5);
    assert.match(view.host.textContent, /Verification Cases Queue/);
  } finally { await view.close(); }
});

test('PS-25: switching preview to authenticated context removes rows and details', async () => {
  const view = await mount(StaffCaseDashboard, { isDevPreview: true });
  try {
    await act(async () => view.host.querySelector('.lv-staff-view-btn').click());
    await view.render({ accessToken: 'synthetic-staff-token', isDevPreview: true });
    assert.equal(document.querySelector('.lv-modal'), null);
    assert.equal(view.host.querySelectorAll('.lv-staff-table-row').length, 0);
    assert.match(view.host.textContent, /Không thể tải danh sách hồ sơ/);
  } finally { await view.close(); }
});

test('PS-25: actual production compilation blocks preview and test overrides', async () => {
  const compiled = await loadComponentModule('src/pages/staff/staffCaseService.js', true);
  for (const options of [ {isDevPreview: true}, {isTest: true}, {isDevPreview: true, isTest: true, testEnv: {PROD: false}} ]) {
    assert.equal(compiled.isStaffSimulationPermitted(options), false);
    await assert.rejects(compiled.fetchStaffCases({ ...options, fetchFn: async () => { throw new Error('offline'); } }), {code: 'NETWORK_ERROR'});
  }
});


async function setRoute(path) {
  await act(async () => {
    window.history.replaceState({}, '', path);
    window.dispatchEvent(new window.PopStateEvent('popstate'));
  });
}

test('PS-25 App route: anonymous login, Staff access, Owner/Admin/Legal denial and Owner regression', async () => {
  const App = (await loadComponentModule('src/App.jsx')).default;
  const originalFetch = globalThis.fetch;
  try {
    for (const role of ['STAFF_EXECUTOR', 'VAULT_OWNER', 'ADMIN', 'LEGAL_VERIFIER']) {
      await setRoute('/staff/cases');
      globalThis.__PS25_AUTH_USER__ = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Synthetic User', email: 'synthetic@example.test', roles: [role] };
      globalThis.fetch = async url => {
        if (String(url).includes('/staff/verification-cases?')) return new Response(JSON.stringify({content:[],page:0,size:5,totalElements:0,totalPages:0}), {status:200,headers:{'Content-Type':'application/json'}});
        assert.match(String(url), /\/auth\/me$/);
        return new Response(JSON.stringify(globalThis.__PS25_AUTH_USER__), {status: 200, headers: {'Content-Type': 'application/json'}});
      };
      const view = await mount(App, {});
      try {
        assert.match(view.host.textContent, /Test sign in/);
        assert.equal(view.host.querySelector('.lv-staff-table'), null);
        await act(async () => view.host.querySelector('button').click());
        assert.equal(window.location.pathname, role === 'STAFF_EXECUTOR' ? '/staff/cases' : role === 'LEGAL_VERIFIER' ? '/legal/death-verification' : role === 'ADMIN' ? '/admin' : '/vault');
        if (role === 'VAULT_OWNER') assert.match(view.host.textContent, /Owner dashboard marker/);
        await setRoute('/staff/cases?preview=true');
        if (role === 'STAFF_EXECUTOR') {
          assert.match(view.host.textContent, /Chưa có hồ sơ cần xác minh/);
        } else {
          assert.match(view.host.textContent, /Cổng này chỉ dành cho tài khoản/);
        }
        assert.equal(view.host.textContent.includes('CASE-2026-0001'), false);
      } finally { await view.close(); }
    }
  } finally { globalThis.fetch = originalFetch; delete globalThis.__PS25_AUTH_USER__; }
});

test('PS-25 App: DEV preview renders without auth but actual production requires login', async () => {
  for (const production of [false, true]) {
    await setRoute('/staff/cases?preview=true');
    const App = (await loadComponentModule('src/App.jsx', production)).default;
    const view = await mount(App, {});
    try {
      if (production) {
        assert.match(view.host.textContent, /Test sign in/);
        assert.equal(view.host.textContent.includes('CASE-2026-0001'), false);
      } else {
        assert.match(view.host.textContent, /CASE-2026-0001/);
      }
    } finally { await view.close(); }
  }
});


for (const status of [401, 403]) test('PS-25 auth: queue HTTP ' + status + ' localizes feedback and expires only 401', async () => {
  let expired = 0;
  const app = await mount(StaffCaseDashboard, { accessToken: 'synthetic-auth-test', lang: 'en',
    onUnauthorized: () => expired++, loadCases: async () => { throw { status }; } });
  try {
    assert.ok(app.host.textContent.includes(status === 401 ? 'Session expired' : 'Access denied'));
    assert.equal(expired, status === 401 ? 1 : 0);
  } finally { await app.close(); }
});
test('Staff preview unauthorized fixture does not sign out and forbidden is never session expiry', async () => {
  let expired = 0;
  const app = await mount(StaffCaseDashboard, { isDevPreview: true, onUnauthorized: () => expired++,
    loadCases: async () => { throw { status: 401 }; } });
  try { assert.equal(expired, 0); } finally { await app.close(); }
});


test('Integrated Staff routes preserve PS-25 dashboard and PS-31 navigation in both directions', async () => {
  const App = (await loadComponentModule('src/App.jsx')).default;
  await setRoute('/staff/cases?preview=true');
  const view = await mount(App, {});
  try {
    const legalButton = [...view.host.querySelectorAll('button')].find(button => button.textContent.includes('Hồ sơ căn cứ pháp lý'));
    assert.ok(legalButton);
    await act(async () => legalButton.click());
    assert.equal(window.location.pathname, '/staff/legal-documents');
    const casesButton = [...view.host.querySelectorAll('button')].find(button => button.textContent.includes('Hồ sơ xác minh'));
    assert.ok(casesButton);
    await act(async () => casesButton.click());
    assert.equal(window.location.pathname, '/staff/cases');
    assert.ok(view.host.querySelector('.lv-staff-shell'));
  } finally { await view.close(); }
});

test('PS-26 Integration: StaffCaseDashboard transitions to intake view on action click and returns on back', { skip: !existsSync(new URL('../pages/staff/StaffCaseIntakePage.jsx', import.meta.url)) }, async () => {
  const view = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    lang: 'vi',
  });

  // Chờ danh sách dashboard tải xong
  await act(async () => {
    await new Promise((r) => setTimeout(r, 60));
  });

  // Bảng xuất hiện và có nút Tiếp nhận hồ sơ
  const intakeBtn = view.host.querySelector('.lv-staff-intake-btn');
  assert.ok(intakeBtn);

  // Click Tiếp nhận hồ sơ
  await act(async () => {
    intakeBtn.click();
  });

  // View chuyển sang StaffCaseIntakePage
  const intakePage = view.host.querySelector('.lv-intake-page');
  assert.ok(intakePage);
  assert.match(view.host.textContent, /Tiếp nhận hồ sơ tử vong bản cứng/);
  assert.match(view.host.textContent, /CASE-2026-0001/);

  // Bấm nút Quay về danh sách
  const backBtn = view.host.querySelector('.lv-intake-back-btn');
  assert.ok(backBtn);
  await act(async () => {
    backBtn.click();
  });

  // Quay lại dashboard table
  assert.ok(view.host.querySelector('.lv-staff-table'));

  await view.close();
});


test('PS-27 Integration: StaffCaseDashboard transitions between Dashboard, Intake (PS-26), and Verification (PS-27)', { skip: !existsSync(new URL('../pages/staff/StaffCaseVerificationPage.jsx', import.meta.url)) }, async () => {
  const app = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    loadCases: async () => ({
      content: [SYNTHETIC_STAFF_CASES[0]],
      page: 0,
      size: 5,
      totalElements: 1,
      totalPages: 1,
      isSimulation: true,
    }),
  });

  // Dashboard table visible
  const verifyBtn = app.host.querySelector('.lv-staff-verify-btn');
  assert.ok(verifyBtn, 'Must render verify button in table row');

  // Click verify button -> transitions to PS-27 verification page
  await act(async () => {
    verifyBtn.click();
  });

  assert.ok(app.host.querySelector('.lv-verify-page'), 'Must transition to PS-27 verification page');

  // Click back button -> returns to dashboard
  const backBtn = app.host.querySelector('.lv-verify-back-btn');
  await act(async () => {
    backBtn.click();
  });

  assert.ok(app.host.querySelector('.lv-staff-dashboard'), 'Must return to dashboard after clicking back');

  await app.close();
});

test('Live dashboard renders OPEN queue and opens scoped live case instead of preview actions', async () => {
 const previous = globalThis.fetch;
 const id = '12345678-1234-4234-8234-123456789012';
 globalThis.fetch = async (url) => new Response(JSON.stringify(url.endsWith('/'+id) ? {caseId:id,status:'OPEN',vaultName:'Synthetic live vault',ownerName:'Synthetic owner',triggeredAt:'2026-10-17T10:00:00'} : { content: [{ caseId: id, vaultId: id, ownerId: id, vaultName: 'Synthetic live vault', ownerName: 'Synthetic owner', status: 'OPEN', triggeredAt: '2026-10-17T10:00:00', closedAt: null }], page:0,size:5,totalElements:1,totalPages:1 }), {status:200,headers:{'Content-Type':'application/json'}});
 const view = await mount(StaffCaseDashboard, { accessToken:'synthetic', isDevPreview:true });
 try {
  await act(async () => { await new Promise(resolve => setTimeout(resolve,20)); });
  assert.match(view.host.textContent,/Synthetic live vault/);
  assert.match(view.host.textContent,/Đang mở/);
  assert.deepEqual([...view.host.querySelectorAll('.lv-staff-filter-select option')].map(option => option.value),['ALL','OPEN','CANCELLED']);
  assert.equal(view.host.textContent.includes('CASE-2026-0001'),false);
  assert.equal(view.host.querySelector('.lv-staff-preview-banner'),null);
  await act(async () => view.host.querySelector('.lv-staff-view-btn').click());
  assert.match(view.host.textContent,/Tiếp nhận hồ sơ/);
  assert.match(view.host.textContent,/Synthetic live vault/);
  assert.equal(view.host.querySelector('fieldset').disabled,true);
  assert.equal(new URLSearchParams(window.location.search).get('caseId'),id);
  await act(async()=>[...view.host.querySelectorAll('button')].find(b=>b.textContent.includes('Về danh sách')).click());
  assert.equal(new URLSearchParams(window.location.search).has('caseId'),false);
  assert.ok(view.host.querySelector('.lv-staff-dashboard'));
 } finally { await view.close(); globalThis.fetch = previous; }
});
