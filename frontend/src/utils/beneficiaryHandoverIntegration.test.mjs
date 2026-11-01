import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { liveCaseLinkActions } from './caseLinkService.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/shared-with-me' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const Workspace = await component('src/pages/beneficiary/CaseLinkWorkspace.jsx');

function jsonResponse(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

async function mount(props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Workspace, props));
  });
  return {
    host,
    render: async newProps => act(async () => root.render(React.createElement(Workspace, newProps))),
    close: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

test('PS-124: CaseLinkWorkspace with liveCaseLinkActions queries real BE endpoint and displays all statuses', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  const userId = '11111111-1111-4111-8111-111111111111';
  const token = 'real-token-ps124';

  const statusResponse = {
    subjectId: userId,
    cases: [
      { caseId: 'c-1', caseNumber: 'HS-2026-000001', status: 'READY', totalAssets: 2, deliveredAssets: 0 },
      { caseId: 'c-2', caseNumber: 'HS-2026-000002', status: 'SUSPENDED', totalAssets: 3, deliveredAssets: 1 },
      { caseId: 'c-3', caseNumber: 'HS-2026-000003', status: 'AWAITING_LEGAL', totalAssets: 1, deliveredAssets: 0 },
      { caseId: 'c-4', caseNumber: 'HS-2026-000004', status: 'UNCONFIRMED', totalAssets: 4, deliveredAssets: 0 },
    ],
  };

  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('/beneficiary-link-requests')) return jsonResponse([]);
    if (url.includes('/beneficiary-handover-status')) return jsonResponse(statusResponse);
    if (url.includes('/received-assets')) return jsonResponse([]);
    return jsonResponse({});
  };

  try {
    const v = await mount({
      session: { user: { id: userId, roles: ['BENEFICIARY'] }, accessToken: token },
      caseLinkActions: liveCaseLinkActions,
      lang: 'vi',
    });

    const statusCalls = calls.filter(c => c.url.includes('/beneficiary-handover-status'));
    assert.equal(statusCalls.length, 1);
    assert.equal(statusCalls[0].init.headers.Authorization, `Bearer ${token}`);
    assert.equal(statusCalls[0].init.cache, 'no-store');

    // HS-2026-000001: READY - deliveredAssets 0/2. READY does NOT mean delivered!
    assert.match(v.host.textContent, /HS-2026-000001/);
    assert.match(v.host.textContent, /Đã đủ điều kiện về người nhận, chờ bàn giao/);
    assert.match(v.host.textContent, /0\/2/);

    // HS-2026-000002: SUSPENDED
    assert.match(v.host.textContent, /HS-2026-000002/);
    assert.match(v.host.textContent, /Toàn bộ bàn giao đang tạm khóa/);
    assert.match(v.host.textContent, /1\/3/);
    assert.match(v.host.textContent, /Cần có đầy đủ người nhận/);

    // HS-2026-000003: AWAITING_LEGAL
    assert.match(v.host.textContent, /HS-2026-000003/);
    assert.match(v.host.textContent, /Staff đã yêu cầu mở lại, chờ Legal xét/);

    // HS-2026-000004: UNCONFIRMED
    assert.match(v.host.textContent, /HS-2026-000004/);
    assert.match(v.host.textContent, /Chờ Staff ghi nhận đủ người/);

    await v.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PS-124: CaseLinkWorkspace handles zero linked cases and zero delivered assets', async () => {
  const originalFetch = globalThis.fetch;
  const userId = 'user-zero';
  const token = 'token-zero';

  globalThis.fetch = async url => {
    if (url.includes('/beneficiary-link-requests')) return jsonResponse([]);
    if (url.includes('/beneficiary-handover-status')) return jsonResponse({ subjectId: userId, cases: [] });
    if (url.includes('/received-assets')) return jsonResponse([]);
    return jsonResponse({});
  };

  try {
    const v = await mount({
      session: { user: { id: userId, roles: ['BENEFICIARY'] }, accessToken: token },
      caseLinkActions: liveCaseLinkActions,
      lang: 'en',
    });

    assert.match(v.host.textContent, /No shared handover information is available for this account/);
    await v.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PS-124: CaseLinkWorkspace handles permission errors (403/401) honestly without mock fallback', async () => {
  const originalFetch = globalThis.fetch;
  const userId = 'user-err';
  const token = 'token-err';

  globalThis.fetch = async url => {
    if (url.includes('/beneficiary-link-requests')) return jsonResponse([]);
    if (url.includes('/beneficiary-handover-status')) return jsonResponse({ code: 'ACCESS_DENIED' }, 403);
    if (url.includes('/received-assets')) return jsonResponse([]);
    return jsonResponse({});
  };

  try {
    const v = await mount({
      session: { user: { id: userId, roles: ['BENEFICIARY'] }, accessToken: token },
      caseLinkActions: liveCaseLinkActions,
      lang: 'vi',
    });

    assert.match(v.host.textContent, /Không tải được tình hình bàn giao\. Vui lòng thử lại\./);
    assert.doesNotMatch(v.host.textContent, /Bản xem thử|preview-case|HS-2026-000099/);
    await v.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('PS-124: switching account aborts prior in-flight request and ignores delayed response', async () => {
  const originalFetch = globalThis.fetch;
  let delayedResolve;
  let account1Aborted = false;

  globalThis.fetch = async (url, init = {}) => {
    if (url.includes('/beneficiary-link-requests')) return jsonResponse([]);
    if (url.includes('/received-assets')) return jsonResponse([]);
    if (url.includes('/beneficiary-handover-status')) {
      if (init.headers.Authorization === 'Bearer token-account-1') {
        if (init.signal) {
          init.signal.addEventListener('abort', () => { account1Aborted = true; });
        }
        return new Promise(resolve => {
          delayedResolve = () => resolve(jsonResponse({
            subjectId: 'acc-1',
            cases: [{ caseId: 'c-old', caseNumber: 'HS-2026-OLD999', status: 'READY', totalAssets: 1, deliveredAssets: 0 }],
          }));
        });
      }
      if (init.headers.Authorization === 'Bearer token-account-2') {
        return jsonResponse({
          subjectId: 'acc-2',
          cases: [{ caseId: 'c-new', caseNumber: 'HS-2026-NEW111', status: 'SUSPENDED', totalAssets: 3, deliveredAssets: 0 }],
        });
      }
    }
    return jsonResponse({});
  };

  try {
    const v = await mount({
      session: { user: { id: 'acc-1', roles: ['BENEFICIARY'] }, accessToken: 'token-account-1' },
      caseLinkActions: liveCaseLinkActions,
      lang: 'en',
    });

    // Switch account to acc-2 while acc-1 is still pending
    await v.render({
      session: { user: { id: 'acc-2', roles: ['BENEFICIARY'] }, accessToken: 'token-account-2' },
      caseLinkActions: liveCaseLinkActions,
      lang: 'en',
    });

    assert.equal(account1Aborted, true, 'Account 1 fetch signal must be aborted on switch');

    // Late resolve account 1
    if (delayedResolve) delayedResolve();

    // Verify only acc-2 data is visible
    assert.match(v.host.textContent, /HS-2026-NEW111/);
    assert.match(v.host.textContent, /Whole handover temporarily suspended/);
    assert.doesNotMatch(v.host.textContent, /HS-2026-OLD999/);

    await v.close();
  } finally {
    globalThis.fetch = originalFetch;
  }
});
