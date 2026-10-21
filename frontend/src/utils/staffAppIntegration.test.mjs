import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, storeSession } from './session.js';
import { ids, deliveredItem, staffFixture, json } from './staffReviewFixture.mjs';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost/staff/cases',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadApp(production = false) {
  const output = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry: 'src/App.jsx', formats: ['es'] },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      },
    },
  });

  let code = (Array.isArray(output) ? output[0] : output).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;

  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }

  const mod = await import(
    'data:text/javascript;base64,' + Buffer.from(code).toString('base64')
  );
  return mod.default;
}

const DevApp = await loadApp(false);
const ProdApp = await loadApp(true);

const staffUser = {
  id: '11111111-1111-4111-8111-111111111111',
  fullName: 'Thái Staff Executor',
  email: 'staff@legacyvault.test',
  roles: ['STAFF_EXECUTOR'],
};

const makeStaffSession = () =>
  createSession({
    accessToken: 'valid-staff-jwt-token-xyz',
    tokenType: 'Bearer',
    expiresInSeconds: 3600,
    user: staffUser,
  });

test('PS-96/97/98 Integration: Staff route guard redirects non-staff or unauthenticated users in Prod', async () => {
  storeSession(null);
  window.history.replaceState({}, '', '/staff/legal-documents');

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(ProdApp));
    });

    // Should redirect to login or show login form when not authenticated
    assert.ok(
      window.location.pathname.includes('/login') ||
      host.textContent.includes('Đăng nhập') ||
      host.textContent.includes('Sign in')
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Preview mode renders staff screens without authentication in Dev', async () => {
  storeSession(null);
  window.history.replaceState({}, '', '/staff/legal-documents?preview=true');

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    assert.equal(window.location.pathname, '/staff/legal-documents');
    // Staff shell or preview banner should render
    assert.ok(
      host.textContent.includes('Căn cứ pháp lý') ||
      host.textContent.includes('Legal Basis') ||
      host.textContent.includes('DEV Preview') ||
      host.textContent.includes('Hồ sơ')
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Real session requires valid case/session context and does NOT use synthetic fallbacks', async () => {
  const session = makeStaffSession();
  storeSession(session);
  window.history.replaceState({}, '', '/staff/asset-handover');

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(ProdApp));
    });

    assert.equal(window.location.pathname, '/staff/asset-handover');
    // Does NOT auto-fill mock UUID in real mode without preview
    assert.equal(host.textContent.includes('6f1a4c2d-0000-4000-8000-000000000001'), false);
    assert.equal(host.textContent.includes('HDS-2026-001'), false);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Route switching preserves preview flag and context parameters', async () => {
  storeSession(null);
  window.history.replaceState(
    {},
    '',
    '/staff/asset-handover?caseId=CASE-2026-0001&sessionId=HDS-2026-001&preview=true'
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    assert.equal(window.location.pathname, '/staff/asset-handover');
    const searchParams = new URLSearchParams(window.location.search);
    assert.equal(searchParams.get('preview'), 'true');
    assert.equal(searchParams.get('caseId'), 'CASE-2026-0001');
    assert.equal(searchParams.get('sessionId'), 'HDS-2026-001');

    // Tab buttons in Staff Shell should include preserved params in navigation links
    const links = [...host.querySelectorAll('a')];
    const legalDocLink = links.find((a) => a.getAttribute('href')?.includes('/staff/legal-documents'));
    if (legalDocLink) {
      const href = legalDocLink.getAttribute('href');
      assert.ok(href.includes('preview=true'));
      assert.ok(href.includes('caseId=CASE-2026-0001'));
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Completion progress and Close & Archive screens load correctly via App', async () => {
  storeSession(null);
  window.history.replaceState(
    {},
    '',
    '/staff/close-and-archive?caseId=CASE-2026-0001&sessionId=HDS-2026-001&preview=true'
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    assert.equal(window.location.pathname, '/staff/close-and-archive');
    assert.ok(
      host.textContent.includes('Đóng & Lưu trữ') ||
      host.textContent.includes('Close & Archive') ||
      host.textContent.includes('Biên bản') ||
      host.textContent.includes('Lưu trữ') ||
      host.textContent.includes('Phiên bàn giao')
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-97 real App: preapproved counter handover, confirmation, close, receipt, archive and reload', async () => {
  const originalFetch=globalThis.fetch;
  let delivered=false, confirmed=false, completed=false, archived=false;
  const receipts=[],posts=[];
  globalThis.fetch=async(url,init={})=>{
    if(url.endsWith('/auth/me')) return json(staffUser);
    if(init.method==='POST'){
      const body=init.body?JSON.parse(init.body):null;posts.push({url,body});
      if(url.endsWith('/deliveries')){assert.deepEqual(body,{recipientId:ids.recipient,assetIds:[ids.assetId]});delivered=true;return json([deliveredItem],201);}
      if(url.endsWith('/confirmation')){assert.equal(delivered,true);assert.equal(body.receiptReference,'BB-COUNTER-TEST');confirmed=true;return json({beneficiaryId:ids.recipient,status:'CONFIRMED',receiptReference:body.receiptReference});}
      if(url.endsWith('/close')){assert.equal(confirmed,true);completed=true;return json({sessionId:ids.sessionId,status:'COMPLETED'});}
      if(url.endsWith('/receipts')){assert.equal(completed,true);assert.equal(body.recipientId,ids.recipient);assert.deepEqual(body.assetIds,[ids.assetId]);const receipt={receiptId:ids.otherCaseId,sessionId:ids.sessionId,recipientId:ids.recipient,assetIds:[ids.assetId]};receipts.push(receipt);return json(receipt,201);}
      if(url.endsWith('/archive')){assert.equal(receipts.length,1);archived=true;return json({caseId:ids.caseId,sessionId:ids.sessionId,caseStatus:'CLOSED',vaultStatus:'ARCHIVED'});}
      throw Error('Unexpected mutation '+url);
    }
    if(url.endsWith('/eligible-assets'))return json([{assetId:ids.assetId,recipientId:ids.recipient,description:'Counter fixture asset',deliveryStatus:delivered?'DELIVERED':'ELIGIBLE'}]);
    if(url.endsWith('/beneficiary-confirmations'))return json([{sessionId:ids.sessionId,beneficiaryId:ids.recipient,status:confirmed?'CONFIRMED':'PENDING'}]);
    return staffFixture({status:completed?'COMPLETED':'OPEN',closed:archived,deliveries:delivered?[deliveredItem]:[],receipts,ready:confirmed})(url);
  };
  storeSession(makeStaffSession());
  window.history.replaceState({},'', '/staff/asset-handover?caseId='+ids.caseId+'&sessionId='+ids.sessionId);
  const host=document.createElement('div');document.body.append(host);let root=createRoot(host);
  const button=text=>[...host.querySelectorAll('button')].find(b=>b.textContent.includes(text));
  const click=async text=>{const b=button(text);assert.ok(b,'Missing '+text);assert.equal(b.disabled,false,text+' must be enabled');await act(async()=>b.click());};
  const change=async(element,value)=>{await act(async()=>{
    element.value=value;
    const key=Object.keys(element).find(k=>k.startsWith('__reactProps$'));
    element[key].onChange({target:element});
  });};
  try{
    await act(async()=>root.render(React.createElement(ProdApp)));
    assert.ok(host.textContent.includes('gặp trực tiếp'),host.textContent.slice(0,1400));
    await click('Ghi nhận bàn giao');await click('Xác nhận ghi nhận bàn giao');await click('Xác nhận đã nhận tài sản');
    await change(host.querySelector('select'),ids.recipient);
    await change(host.querySelector('input[id*="receipt"]') || [...host.querySelectorAll('input')].at(-1),'BB-COUNTER-TEST');
    await click('Ghi nhận xác nhận');await click('Đóng và lưu trữ hồ sơ');
    await click('Đóng phiên bàn giao');
    await change(host.querySelector('select'),ids.recipient);
    await click('Lập biên bản xác nhận');await click('Đóng & Lưu trữ hồ sơ');
    assert.equal(archived,true);assert.ok(host.querySelector('.lv-ca-archive-banner'));
    await act(async()=>root.unmount());root=createRoot(host);
    await act(async()=>root.render(React.createElement(ProdApp)));
    assert.ok(host.querySelector('.lv-ca-archive-banner'));assert.equal(host.querySelector('.lv-ca-btn-primary'),null);
    assert.deepEqual(posts.map(p=>p.url.split('/').at(-1)),['deliveries','confirmation','close','receipts','archive']);
  }finally{await act(async()=>root.unmount());host.remove();storeSession(null);globalThis.fetch=originalFetch;}
});

test('PS-96/97/98 Integration: Context Bar displays active case and allows switching', async () => {
  storeSession(null);
  window.history.replaceState(
    {},
    '',
    '/staff/legal-documents?caseId=' + ids.caseId + '&sessionId=' + ids.sessionId + '&preview=true'
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // Check ContextBar presence
    const contextBar = host.querySelector('.lv-staff-context-bar');
    assert.ok(contextBar, 'StaffCaseContextBar should be rendered');
    assert.ok(
      contextBar.textContent.includes('Đang xử lý:') ||
      contextBar.textContent.includes('Active case:') ||
      contextBar.textContent.includes('Hồ sơ')
    );

    // Button to change case should be visible
    const changeBtn = host.querySelector('.lv-staff-context-bar__btn-change');
    assert.ok(changeBtn, 'Should have "Đổi hồ sơ" / "Change case" button');
    assert.ok(
      changeBtn.textContent.includes('Đổi hồ sơ') ||
      changeBtn.textContent.includes('Change case')
    );

    // Click change case opens modal
    await act(async () => {
      changeBtn.click();
    });

    const modal = document.querySelector('.lv-staff-selector-modal');
    assert.ok(modal, 'StaffCaseSelectorModal should open on clicking change button');
    assert.ok(
      modal.textContent.includes('Chọn hồ sơ') ||
      modal.textContent.includes('Select case')
    );

    // Close modal
    const closeBtn = modal.querySelector('.lv-staff-selector-modal__close-btn');
    if (closeBtn) {
      await act(async () => {
        closeBtn.click();
      });
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: When no case is selected, Context Bar prompts to select case', async () => {
  storeSession(null);
  window.history.replaceState({}, '', '/staff/legal-documents?preview=true');

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    const contextBar = host.querySelector('.lv-staff-context-bar');
    assert.ok(contextBar, 'StaffCaseContextBar should be rendered even without caseId');
    assert.ok(
      contextBar.textContent.includes('Chọn hồ sơ để tiếp tục') ||
      contextBar.textContent.includes('Select a case to continue')
    );

    const selectBtn = host.querySelector('.lv-staff-context-bar__btn-select');
    assert.ok(selectBtn, 'Should have "Chọn hồ sơ" / "Select case" button');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Switching case resets sessionId and clears previous case context', async () => {
  const originalFetch = globalThis.fetch;
  const session = makeStaffSession();
  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/me')) return json(session.user);
    return json({});
  };
  storeSession(session);
  window.history.replaceState(
    {},
    '',
    '/staff/asset-handover?caseId=' + ids.caseId + '&sessionId=' + ids.sessionId + '&preview=true'
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    assert.equal(new URLSearchParams(window.location.search).get('sessionId'), ids.sessionId);

    // Open selector modal and choose a new case
    const changeBtn = host.querySelector('.lv-staff-context-bar__btn-change');
    assert.ok(changeBtn, 'Change button must exist');

    await act(async () => {
      changeBtn.click();
    });

    const modal = document.querySelector('.lv-staff-selector-modal');
    assert.ok(modal, 'Modal must open');

    // Find a selectable case row
    const caseRows = modal.querySelectorAll('.lv-staff-selector-table tbody tr');
    if (caseRows.length > 0) {
      await act(async () => {
        caseRows[0].click();
      });

      // Verify sessionId is deleted/reset after changing case
      const currentParams = new URLSearchParams(window.location.search);
      assert.equal(currentParams.get('sessionId'), null, 'sessionId MUST be removed when changing case');
    }
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});

test('PS-96/97/98 Integration: Flow across all Staff sections preserves case/session context across sidebar clicks, Back and reload', async () => {
  storeSession(null);
  const targetCaseId = ids.caseId;
  const targetSessionId = ids.sessionId;

  window.history.replaceState(
    {},
    '',
    `/staff/legal-documents?caseId=${targetCaseId}&sessionId=${targetSessionId}&preview=true`
  );

  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // 1. Verify active case context bar exists and has the case id
    const contextBar = host.querySelector('.lv-staff-context-bar');
    assert.ok(contextBar, 'Context bar must render');
    assert.ok(contextBar.textContent.includes('Hồ sơ') || contextBar.textContent.includes('Active case'));

    // 2. Click sidebar xuyên các mục Staff và kiểm tra caseId/sessionId trong URL
    const navButtons = [...host.querySelectorAll('button.lv-nav-item')];
    assert.ok(navButtons.length > 0, 'Sidebar nav buttons should exist');

    // Click Bàn giao tài sản (asset-handover)
    const assetHandoverBtn = navButtons.find(b =>
      b.textContent.includes('Bàn giao tài sản') || b.textContent.includes('Asset Handover')
    );
    if (assetHandoverBtn) {
      await act(async () => {
        assetHandoverBtn.click();
      });
      assert.equal(window.location.pathname, '/staff/asset-handover');
      assert.equal(new URLSearchParams(window.location.search).get('caseId'), targetCaseId);
      assert.equal(new URLSearchParams(window.location.search).get('sessionId'), targetSessionId);
    }

    // Click Đóng và lưu trữ hồ sơ (close-and-archive)
    const closeArchiveBtn = [...host.querySelectorAll('button.lv-nav-item')].find(b =>
      b.textContent.includes('Đóng') || b.textContent.includes('Close')
    );
    if (closeArchiveBtn) {
      await act(async () => {
        closeArchiveBtn.click();
      });
      assert.equal(window.location.pathname, '/staff/close-and-archive');
      assert.equal(new URLSearchParams(window.location.search).get('caseId'), targetCaseId);
      assert.equal(new URLSearchParams(window.location.search).get('sessionId'), targetSessionId);
    }

    // 3. Simulate page reload by unmounting and remounting App at the same URL
    await act(async () => root.unmount());
    root = createRoot(host);
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    const reloadedParams = new URLSearchParams(window.location.search);
    assert.equal(reloadedParams.get('caseId'), targetCaseId, 'Reload preserves caseId');
    assert.equal(reloadedParams.get('sessionId'), targetSessionId, 'Reload preserves sessionId');

    // 4. Simulate Back button qua act(...) đúng chuẩn React 19 để không warning
    await act(async () => {
      window.history.back();
      window.dispatchEvent(new window.PopStateEvent('popstate'));
    });

    const backParams = new URLSearchParams(window.location.search);
    assert.equal(backParams.get('caseId'), targetCaseId, 'Back navigation retains caseId');
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});

test('PS-96/97/98 Integration: Auto-load reads document and asset lists by permission WITHOUT firing automatic mutations or claiming case', async () => {
  const originalFetch = globalThis.fetch;
  const recordedMutations = [];
  const recordedReads = [];

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    const method = (init.method || 'GET').toUpperCase();
    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(method)) {
      recordedMutations.push({ url, method, body: init.body });
      return json({ success: true }, 200);
    }
    recordedReads.push({ url, method });
    if (url.includes('/basis-dossier')) {
      return json({ dossier: { route: 'COURT', status: 'LEGAL_BASIS_PROVIDED', versions: [] } });
    }
    if (url.includes('/eligible-assets')) {
      return json([{ assetId: ids.assetId, recipientId: ids.recipient, description: 'Auto-load item' }]);
    }
    return staffFixture({ status: 'OPEN' })(url);
  };

  storeSession(makeStaffSession());
  window.history.replaceState(
    {},
    '',
    `/staff/legal-documents?caseId=${ids.caseId}&preview=true`
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // Verify GET requests were made to auto-load documents/dossier
    assert.ok(recordedReads.length > 0, 'Auto-load reads must execute');
    const basisDossierRead = recordedReads.find((r) =>
      r.url.includes(`/staff/verification-cases/${ids.caseId}/basis-dossier`)
    );
    assert.ok(basisDossierRead, `Must call GET /staff/verification-cases/${ids.caseId}/basis-dossier`);

    // Crucial rule: Auto-loading must NEVER trigger claim or ANY mutation (upload, forward, claim, delivery, etc.)
    assert.equal(recordedMutations.length, 0, 'Auto-load must NOT perform ANY mutation (POST/PUT/DELETE/PATCH)');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});

test('PS-96/97/98 Integration: Switching account/logout resets case and session context cleanly via app actions', async () => {
  const staff1 = makeStaffSession({
    user: { id: '11111111-1111-4111-8111-111111111111', fullName: 'Staff One', email: 'staff1@test.lv', roles: ['STAFF_EXECUTOR'] },
    accessToken: 'staff-token-111',
  });

  storeSession(staff1);
  window.history.replaceState(
    {},
    '',
    `/staff/asset-handover?caseId=${ids.caseId}&sessionId=${ids.sessionId}&preview=true`
  );

  const host = document.createElement('div');
  document.body.append(host);
  let root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    assert.equal(new URLSearchParams(window.location.search).get('sessionId'), ids.sessionId);

    // Kích hoạt logout qua nút Đăng xuất trên giao diện ứng dụng (hành vi app thật)
    const logoutBtn = [...host.querySelectorAll('button')].find(b =>
      b.textContent.includes('Đăng xuất') || b.textContent.includes('Sign out')
    );
    if (logoutBtn) {
      await act(async () => {
        logoutBtn.click();
      });
    }

    // Sau khi logout qua hành vi app: chuyển về login và dọn sạch context
    assert.ok(window.location.pathname.includes('/login') || host.textContent.includes('Đăng nhập') || host.textContent.includes('Sign in'));
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
  }
});

test('PS-96/97/98 Integration: Late response from previous case is discarded when switching case', async () => {
  let resolveCaseA = null;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (url.includes(ids.caseId)) {
      return new Promise((resolve) => {
        resolveCaseA = () => resolve(json({ dossier: { route: 'NOTARIAL', versions: [{ version: 99, notes: 'Stale A' }] } }));
      });
    }
    if (url.includes(ids.otherCaseId)) {
      return json({ dossier: { route: 'COURT', versions: [{ version: 1, notes: 'Fresh B' }] } });
    }
    return json({});
  };

  storeSession(null);
  window.history.replaceState({}, '', `/staff/legal-documents?caseId=${ids.caseId}&preview=true`);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // Switch to Case B before Case A responds
    const changeBtn = host.querySelector('.lv-staff-context-bar__btn-change');
    if (changeBtn) {
      await act(async () => changeBtn.click());
      const modal = document.querySelector('.lv-staff-selector-modal');
      const rows = modal?.querySelectorAll('.lv-staff-selector-table tbody tr');
      if (rows && rows.length > 0) {
        await act(async () => rows[0].click());
      }
    }

    // Now resolve delayed Case A response
    if (resolveCaseA) {
      await act(async () => resolveCaseA());
    }

    // Must NOT display stale Case A data
    assert.equal(host.textContent.includes('Stale A'), false, 'Late response from Case A must be discarded');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

test('PS-96/97/98 Integration: Finding A - Real token with preview=true and deferred/403 never renders or selects synthetic cases', async () => {
  const originalFetch = globalThis.fetch;
  let resolveGetCases = null;

  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    if (String(url).includes('/staff/verification-cases') && !String(url).includes('/basis-dossier')) {
      return new Promise((resolve) => {
        resolveGetCases = (status = 200, data = []) =>
          resolve(json(data, status));
      });
    }
    return json({});
  };

  const realSession = makeStaffSession({
    accessToken: 'real-staff-bearer-token',
  });
  storeSession(realSession);
  window.history.replaceState(
    {},
    '',
    `/staff/legal-documents?preview=true`
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // Mở selector modal
    const selectBtn = host.querySelector('.lv-staff-context-bar__btn-select') ||
      host.querySelector('.lv-staff-context-bar__btn-change');
    assert.ok(selectBtn, 'Select/change case button must exist');

    await act(async () => {
      selectBtn.click();
    });

    const modal = document.querySelector('.lv-staff-selector-modal');
    assert.ok(modal, 'Modal must open');

    // Trong lúc GET đang pending (deferred): KHÔNG được render mock cases
    const initialRows = modal.querySelectorAll('.lv-staff-selector-table tbody tr');
    assert.equal(initialRows.length, 0, 'Must NOT render synthetic mock rows while real request is pending');

    // Giả lập backend trả về 403 Forbidden
    await act(async () => {
      resolveGetCases(403, { code: 'FORBIDDEN', message: 'Staff role not authorized' });
    });

    // Khi 403: Không render bất kỳ row nào từ SYNTHETIC_STAFF_CASES
    const errorRows = modal.querySelectorAll('.lv-staff-selector-table tbody tr');
    assert.equal(errorRows.length, 0, 'Must NOT fallback to synthetic mock rows on 403 Forbidden');
    assert.ok(
      modal.textContent.includes('Lỗi') || modal.textContent.includes('Error') || modal.textContent.includes('FORBIDDEN') || modal.textContent.includes('quyền') || modal.textContent.includes('authorized'),
      'Must display error message on 403'
    );
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});

test('PS-96/97/98 Integration: Finding B - Upload form blocks submit when allocations is empty; Live token prohibits mock samples', async () => {
  const originalFetch = globalThis.fetch;
  let posted = false;

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    if (init.method === 'POST') {
      posted = true;
      return json({
        id: 'dossier-001',
        caseId: ids.caseId,
        route: 'COURT',
        status: 'LEGAL_BASIS_PROVIDED',
        versions: [],
      }, 201);
    }
    if (url.includes('/basis-dossier')) {
      return json({
        id: 'dossier-001',
        caseId: ids.caseId,
        route: 'COURT',
        status: 'LEGAL_BASIS_PROVIDED',
        versions: [],
      });
    }
    return json({});
  };

  // 1. Kiểm tra với phiên thật (Live token): Không có nút sample, nút add allocation bị khóa chờ BE
  storeSession(makeStaffSession());
  window.history.replaceState({}, '', `/staff/legal-documents?caseId=${ids.caseId}&preview=true`);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    const intakeTabBtn = host.querySelector('#tab-btn-intake');
    assert.ok(intakeTabBtn, 'Intake tab button must exist');
    await act(async () => intakeTabBtn.click());

    // Nút sample tuyệt đối không hiển thị ở phiên có token thật
    const sampleBtn = host.querySelector('.lv-btn-mock-alloc-sample');
    assert.equal(sampleBtn, null, 'Sample allocation button must NEVER exist in live authenticated sessions');

    // Nút submit phải disabled khi chưa có allocation
    const submitBtn = host.querySelector('.lv-btn-submit-version');
    assert.ok(submitBtn, 'Submit button must exist');
    assert.equal(submitBtn.disabled, true, 'Submit button must be disabled when allocations is empty');

    // Nút thêm phân bổ bị disabled và hiển thị blocker notice
    const addAllocBtn = host.querySelector('.lv-btn-add-allocation');
    assert.ok(addAllocBtn, 'Add allocation button must exist');
    assert.equal(addAllocBtn.disabled, true, 'Add allocation button must be disabled in live session pending metadata');
    assert.ok(
      host.textContent.includes('danh mục tài sản') || host.textContent.includes('asset catalog'),
      'Must display business blocker banner when allocations metadata is pending'
    );
    assert.equal(posted, false, 'Must NOT have posted any request');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }

  // 2. Kiểm tra ở chế độ DEV Simulation (không token): Nút sample hiển thị và nạp allocation
  const hostSim = document.createElement('div');
  document.body.append(hostSim);
  const rootSim = createRoot(hostSim);

  try {
    storeSession(null);
    window.history.replaceState({}, '', `/staff/legal-documents?caseId=case-court&preview=true`);

    await act(async () => {
      rootSim.render(React.createElement(DevApp));
    });

    const intakeTabBtn = hostSim.querySelector('#tab-btn-intake');
    assert.ok(intakeTabBtn, 'Intake tab button must exist in simulation');
    await act(async () => intakeTabBtn.click());

    const simSampleBtn = hostSim.querySelector('.lv-btn-mock-alloc-sample');
    assert.ok(simSampleBtn, 'Sample allocation button must exist in anonymous DEV preview simulation');
    await act(async () => simSampleBtn.click());

    const allocRows = hostSim.querySelectorAll('.lv-allocations-table tbody tr');
    assert.ok(allocRows.length > 0, 'Allocation row should be rendered after clicking sample in simulation');
  } finally {
    await act(async () => rootSim.unmount());
    hostSim.remove();
  }
});

test('PS-96/97/98 Integration: Finding C - Deferred forward response from Case A cannot mutate Case B or stick forwarding state', async () => {
  let resolveForwardA = null;
  let forwardPostCount = 0;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    if (init.method === 'POST' && url.includes(`/staff/verification-cases/${ids.caseId}/basis-dossier/versions/1/forward`)) {
      forwardPostCount++;
      return new Promise((resolve) => {
        resolveForwardA = () => resolve(json({
          id: 'dossier-a',
          caseId: ids.caseId,
          route: 'COURT',
          status: 'LEGAL_BASIS_FORWARDED',
          versions: [{ version: 1, forwardStatus: 'FORWARDED', notes: 'Mutated Case A' }],
        }));
      });
    }
    if (url.includes(`/staff/verification-cases/${ids.otherCaseId}/basis-dossier`)) {
      return json({
        id: 'dossier-b',
        caseId: ids.otherCaseId,
        route: 'COURT',
        status: 'LEGAL_BASIS_PROVIDED',
        versions: [{ version: 2, forwardStatus: 'NOT_FORWARDED', notes: 'Untouched Case B' }],
      });
    }
    if (url.includes(`/staff/verification-cases/${ids.caseId}/basis-dossier`)) {
      return json({
        id: 'dossier-a',
        caseId: ids.caseId,
        route: 'COURT',
        status: 'LEGAL_BASIS_PROVIDED',
        versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED', notes: 'Case A V1' }],
      });
    }
    if (url.includes('/staff/verification-cases') && !url.includes('/basis-dossier')) {
      const urlObj = new URL(url, 'http://localhost');
      const sizeParam = Number(urlObj.searchParams.get('size')) || 5;
      return json({
        content: [
          {
            caseId: ids.caseId,
            caseNumber: 'HS-2026-000001',
            vaultId: '00000000-0000-0000-0000-000000000001',
            ownerId: '00000000-0000-0000-0000-000000000002',
            vaultName: 'Vault A',
            ownerName: 'Owner A',
            status: 'OPEN',
            triggeredAt: new Date().toISOString(),
            closedAt: null,
          },
          {
            caseId: ids.otherCaseId,
            caseNumber: 'HS-2026-000002',
            vaultId: '00000000-0000-0000-0000-000000000003',
            ownerId: '00000000-0000-0000-0000-000000000004',
            vaultName: 'Vault B',
            ownerName: 'Owner B',
            status: 'OPEN',
            triggeredAt: new Date().toISOString(),
            closedAt: null,
          },
        ],
        page: 0,
        size: sizeParam,
        totalElements: 2,
        totalPages: 1,
      });
    }
    return json({});
  };

  storeSession(makeStaffSession());
  window.history.replaceState({}, '', `/staff/legal-documents?caseId=${ids.caseId}&preview=true`);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // 1. Nhấn Chuyển Ban Pháp lý cho Case A
    const forwardBtn = host.querySelector('.lv-btn-forward-legal');
    assert.ok(forwardBtn, 'Forward button .lv-btn-forward-legal must exist on Overview tab');
    assert.equal(forwardBtn.disabled, false, 'Forward button must be enabled initially');

    await act(async () => forwardBtn.click());
    assert.equal(forwardPostCount, 1, 'POST forward for Case A must be called exactly once');

    // 2. Chuyển sang Case B trong khi forward Case A vẫn đang in-flight
    const changeBtn = host.querySelector('.lv-staff-context-bar__btn-change');
    assert.ok(changeBtn, 'Change case button must exist on context bar');
    await act(async () => changeBtn.click());

    const modal = document.querySelector('.lv-staff-selector-modal');
    assert.ok(modal, 'Staff selector modal must open');
    const rows = modal.querySelectorAll('.lv-staff-selector-table tbody tr');
    assert.ok(rows.length >= 2, 'Selector modal must contain rows for both cases');

    // Chọn dòng của Case B (hàng thứ 2)
    await act(async () => rows[1].click());

    // Xác nhận đã chuyển sang Case B và hiển thị đúng thông tin của Case B
    assert.ok(
      host.textContent.includes('HS-2026-000002') || host.textContent.includes('CASE-002') || host.textContent.includes(ids.otherCaseId),
      'Context bar must reflect switch to Case B'
    );
    assert.ok(host.textContent.includes('Untouched Case B'), 'Dossier of Case B must be rendered');

    // 3. Response của Case A trả về muộn
    assert.ok(resolveForwardA, 'resolveForwardA must have been captured');
    await act(async () => resolveForwardA());

    // 4. Case B tuyệt đối không hiển thị 'Mutated Case A' hoặc bị đổi trạng thái
    assert.equal(
      host.textContent.includes('Mutated Case A'),
      false,
      'Late forward response from Case A must not contaminate Case B'
    );

    // 5. Nút forward của Case B không bị kẹt disabled (isForwarding phải là false trên Case B)
    const forwardBtnB = host.querySelector('.lv-btn-forward-legal');
    assert.ok(forwardBtnB, 'Forward button for Case B must exist');
    assert.equal(forwardBtnB.disabled, false, 'Forward button on Case B must NOT be stuck in forwarding state');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});

test('PS-96/97/98 Integration: Legacy NOTARIAL route is strictly read-only with no mutations permitted', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    if (url.includes('/basis-dossier')) {
      return json({
        id: 'dossier-notarial',
        caseId: ids.caseId,
        route: 'NOTARIAL',
        status: 'LEGAL_BASIS_PROVIDED',
        versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED', notes: 'Legacy Notarial V1' }],
      });
    }
    return json({});
  };

  storeSession(makeStaffSession());
  window.history.replaceState({}, '', `/staff/legal-documents?caseId=${ids.caseId}&preview=true`);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // 1. Tab Tổng quan: Nút forward tuyệt đối không hiển thị cho hồ sơ NOTARIAL
    const forwardBtn = host.querySelector('.lv-btn-forward-legal');
    assert.equal(forwardBtn, null, 'Forward button must NOT exist for read-only NOTARIAL route');

    // 2. Chuyển sang Tab Tiếp nhận
    const intakeTabBtn = host.querySelector('#tab-btn-intake');
    assert.ok(intakeTabBtn, 'Intake tab button must exist');
    await act(async () => intakeTabBtn.click());

    // 3. Phải hiển thị banner chỉ đọc NOTARIAL
    assert.ok(
      host.textContent.includes('NOTARIAL') || host.textContent.includes('chỉ đọc') || host.textContent.includes('Read-Only'),
      'Must display read-only notice for legacy NOTARIAL route'
    );

    // 4. Nút submit phải bị disabled
    const submitBtn = host.querySelector('.lv-btn-submit-version');
    assert.ok(submitBtn, 'Submit button must exist');
    assert.equal(submitBtn.disabled, true, 'Submit button must be disabled for NOTARIAL route');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});

test('PS-97 Integration: 3-step Scoped Asset Handover enforces recipient filtering, review modal, and batch delivery', async () => {
  const originalFetch = globalThis.fetch;
  let deliveryPostPayload = null;

  const mockEligibleAssets = [
    {
      assetId: '11111111-1111-4111-8111-111111111111',
      assetName: 'Căn hộ Masteri X',
      recipientId: '77777777-7777-4777-8777-777777777777',
      recipientName: 'Trần Văn A',
      description: 'Phân chia 100% căn hộ',
      deliveryStatus: 'PENDING',
    },
    {
      assetId: '22222222-2222-4222-8222-222222222222',
      assetName: 'Tài khoản ngân hàng Y',
      recipientId: '77777777-7777-4777-8777-777777777777',
      recipientName: 'Trần Văn A',
      description: 'Phân chia 100% số dư',
      deliveryStatus: 'PENDING',
    },
    {
      assetId: '33333333-3333-4333-8333-333333333333',
      assetName: 'Xe ô tô Z',
      recipientId: '88888888-8888-4888-8888-888888888888',
      recipientName: 'Nguyễn Thị B',
      description: 'Phân chia quyền sở hữu xe',
      deliveryStatus: 'PENDING',
    },
  ];

  globalThis.fetch = async (url, init = {}) => {
    if (String(url).includes('/auth/me')) return json(staffUser);
    if (url.includes('/eligible-assets')) {
      return json(mockEligibleAssets);
    }
    if (init.method === 'POST' && url.includes('/deliveries')) {
      deliveryPostPayload = JSON.parse(init.body || '{}');
      return json(
        deliveryPostPayload.assetIds.map((aid) => ({
          itemId: ids.otherSessionId,
          sessionId: ids.sessionId,
          assetId: aid,
          recipientId: deliveryPostPayload.recipientId,
          status: 'DELIVERED',
          staffId: ids.otherCaseId,
          deliveredAt: '2026-10-20T08:00:00',
        })),
        201
      );
    }
    return json({});
  };

  storeSession(makeStaffSession());
  window.history.replaceState(
    {},
    '',
    `/staff/asset-handover?caseId=${ids.caseId}&sessionId=${ids.sessionId}&preview=true`
  );

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DevApp));
    });

    // 1. Bước 1: Chọn người nhận Trần Văn A (rec-001)
    const recipientSelect = host.querySelector('.lv-handover-recipient-select');
    assert.ok(recipientSelect, 'Recipient select dropdown must exist');

    await act(async () => {
      recipientSelect.value = '77777777-7777-4777-8777-777777777777';
      recipientSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    // 2. Bước 2: Danh sách tài sản chỉ hiển thị tài sản của Trần Văn A (X và Y), KHÔNG hiển thị xe ô tô Z của B
    assert.ok(host.textContent.includes('Căn hộ Masteri X'), 'Asset X must be rendered for recipient A');
    assert.ok(host.textContent.includes('Tài khoản ngân hàng Y'), 'Asset Y must be rendered for recipient A');
    assert.equal(host.textContent.includes('Xe ô tô Z'), false, 'Asset Z of recipient B must NOT be shown');

    // Nút "Kiểm tra bàn giao" phải bị disabled khi chưa chọn tài sản nào
    const reviewBtn = host.querySelector('.lv-btn-review-handover');
    assert.ok(reviewBtn, 'Review handover button must exist');
    assert.equal(reviewBtn.disabled, true, 'Review button must be disabled before selecting assets');

    // Chọn tài sản X qua checkbox
    const checkboxes = host.querySelectorAll('.lv-handover-table tbody input[type="checkbox"]');
    assert.ok(checkboxes.length >= 2, 'Should have at least 2 asset checkboxes');
    await act(async () => checkboxes[0].click());

    // Sau khi chọn X: Nút review enabled
    assert.equal(reviewBtn.disabled, false, 'Review button must be enabled after selecting an asset');

    // 3. Bước 3: Mở dialog tóm tắt
    await act(async () => reviewBtn.click());

    const reviewModal = host.querySelector('.lv-handover-modal-dialog');
    assert.ok(reviewModal, 'Review modal dialog must open');
    assert.ok(reviewModal.textContent.includes('Trần Văn A'), 'Review modal must display selected recipient name');
    assert.ok(reviewModal.textContent.includes('Căn hộ Masteri X'), 'Review modal must display selected asset X');

    // Thử bấm Hủy: Dialog đóng lại và ZERO POST
    const cancelBtn = reviewModal.querySelector('.lv-btn-cancel-review');
    assert.ok(cancelBtn, 'Cancel review button must exist');
    await act(async () => cancelBtn.click());

    assert.equal(host.querySelector('.lv-handover-modal-dialog'), null, 'Modal must close on cancel');
    assert.equal(deliveryPostPayload, null, 'No POST request should be made when review is cancelled');

    // Mở lại dialog và bấm Xác nhận bàn giao
    await act(async () => reviewBtn.click());
    const confirmBtn = host.querySelector('.lv-btn-confirm-deliver');
    assert.ok(confirmBtn, 'Confirm delivery button must exist in modal');

    await act(async () => confirmBtn.click());

    // 4. Assert POST payload đúng contract BE: recipientId + assetIds[]
    assert.ok(deliveryPostPayload, 'POST request must have been sent');
    assert.equal(deliveryPostPayload.recipientId, '77777777-7777-4777-8777-777777777777');
    assert.deepEqual(deliveryPostPayload.assetIds, ['11111111-1111-4111-8111-111111111111']);

    // 5. Sau khi giao: Chỉ tài sản X chuyển sang DELIVERED; tài sản Y vẫn PENDING
    assert.ok(
      host.textContent.includes('Đã ghi nhận bàn giao thành công') || host.textContent.includes('thành công'),
      'Must display success notification'
    );

    const statusPills = host.querySelectorAll('.lv-handover-table tbody .lv-status-pill');
    assert.ok(statusPills.length >= 2, 'Should render status pills for assets');
    assert.ok(statusPills[0].textContent.includes('Đã bàn giao') || statusPills[0].textContent.includes('Delivered'));
    assert.ok(statusPills[1].textContent.includes('Chờ bàn giao') || statusPills[1].textContent.includes('Pending'));

    // Đổi sang Người nhận B (rec-002): Tài sản Z của B vẫn PENDING
    await act(async () => {
      recipientSelect.value = '88888888-8888-4888-8888-888888888888';
      recipientSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
    });

    assert.ok(host.textContent.includes('Xe ô tô Z'), 'Asset Z must be rendered for recipient B');
    const pillB = host.querySelector('.lv-handover-table tbody .lv-status-pill');
    assert.ok(pillB.textContent.includes('Chờ bàn giao') || pillB.textContent.includes('Pending'), 'Asset Z of recipient B must remain pending');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    storeSession(null);
    globalThis.fetch = originalFetch;
  }
});
