import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createSession, storeSession } from './session.js';

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
