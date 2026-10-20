import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/beneficiaries?preview=true' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function compileComponent(production = false, entry = 'src/pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx') {
  const result = await build({
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
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const DevPage = await compileComponent(false);
const vaultId = '11111111-2222-4333-8444-555555555555';

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setNativeInput(element, value) {
  element.value = value;
  const reactPropsKey = Object.keys(element).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && element[reactPropsKey]?.onChange) {
    element[reactPropsKey].onChange({ target: { value } });
  } else {
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
}

// 1. DEV, Unauthenticated, Preview enabled (VI)
test('Preview Guard - DEV unauthenticated with preview enabled shows VI sample label, fixtures and simulated mutations', async () => {
  let writeApiCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    if (options && (options.method === 'POST' || options.method === 'PUT')) {
      writeApiCalled = true;
    }
    return json({ error: 'Should not call real API in preview' }, 500);
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: null,
          lang: 'vi',
          isDevPreview: true,
        })
      );
    });

    // 1. Check sample data banner on page
    const banner = host.querySelector('.lv-tb-preview-banner');
    assert.ok(banner, 'Sample data banner must be rendered on page');
    assert.match(banner.textContent, /Dữ liệu minh họa/, 'Banner must contain VI sample label');
    assert.match(
      banner.textContent,
      /Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống./,
      'Banner must contain VI explanation'
    );

    // 2. Check fixtures loaded
    assert.ok(host.textContent.includes('Nguyễn Văn An'), 'Beneficiary fixture must be rendered');
    assert.ok(host.textContent.includes('Đã sẵn sàng cấu hình'), 'Readiness must be shown');

    // 3. Open Beneficiary dialog and check sample notice inside
    const openBenBtn = host.querySelector('button.lv-tb-btn-primary');
    await act(async () => {
      openBenBtn.click();
    });

    const dialog = host.querySelector('dialog[open]');
    assert.ok(dialog, 'Beneficiary dialog must be open');
    const dialogNotice = dialog.querySelector('.lv-tb-dialog-preview-notice');
    assert.ok(dialogNotice, 'Dialog must contain sample data notice');
    assert.match(dialogNotice.textContent, /Dữ liệu minh họa/);
    assert.match(
      dialogNotice.textContent,
      /Các thay đổi trong chế độ này chỉ dùng để xem thử, không được lưu vào hệ thống./
    );

    // 4. Submit new beneficiary form in preview
    const nameInput = dialog.querySelector('#ben-fullname');
    const phoneInput = dialog.querySelector('#ben-phone');

    await act(async () => {
      setNativeInput(nameInput, 'Nguyen Van Test Preview');
      setNativeInput(phoneInput, '0987654321');
    });

    await act(async () => {
      dialog.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Assert: Write API was NOT called, list updated locally
    assert.equal(writeApiCalled, false, 'Preview submit must never call real write API');
    assert.ok(host.textContent.includes('Nguyen Van Test Preview'), 'Simulated mutation must update list');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 2. DEV, Unauthenticated, Preview enabled (EN)
test('Preview Guard - DEV unauthenticated with preview enabled shows EN sample label and notice in dialog', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json({ error: 'no api' }, 500);

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: null,
          lang: 'en',
          isDevPreview: true,
        })
      );
    });

    const banner = host.querySelector('.lv-tb-preview-banner');
    assert.ok(banner, 'Sample data banner must be rendered on page in EN');
    assert.match(banner.textContent, /Sample data/, 'Banner must contain EN sample label');
    assert.match(
      banner.textContent,
      /Changes in this preview are for demonstration only and are not saved to the system./,
      'Banner must contain EN explanation'
    );

    // Switch to Trustee tab
    const trusteeTab = host.querySelector('#tab-trustee');
    await act(async () => {
      trusteeTab.click();
    });

    // Check Trustee card in EN
    assert.ok(host.textContent.includes('Binh Tran'), 'EN fixture name must be rendered');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 3. DEV, Authenticated - Preview flags are completely ignored, uses real API with token
test('Preview Guard - DEV authenticated ignores preview props/params, hides sample labels and calls real API', async () => {
  let authHeaderSent = null;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    authHeaderSent = options?.headers?.Authorization;
    if (url.includes('configuration-check')) {
      return json({ vaultId, ready: true, beneficiaryCount: 1, issues: [] });
    }
    if (url.includes('beneficiaries')) {
      return json({
        content: [
          {
            id: '33333333-3333-4333-8333-333333333333',
            vaultId,
            fullName: 'Hoang Van Real Beneficiary',
            relationship: 'Brother',
            status: 'DESIGNATED',
            hasAccount: false,
            hasIdentityNumber: false,
            createdAt: '2026-10-15T00:00:00Z',
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      });
    }
    if (url.includes('trustees')) {
      return json({
        content: [],
        page: 0,
        size: 20,
        totalElements: 0,
        totalPages: 0,
      });
    }
    return json({});
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: 'real-jwt-token-123',
          lang: 'vi',
          isDevPreview: true, // Should be ignored when accessToken is present
        })
      );
    });

    // Assert: Sample label MUST NOT be rendered
    assert.equal(host.querySelector('.lv-tb-preview-banner'), null, 'Sample banner must NOT exist when authenticated');

    // Assert: Uses real API with token
    assert.equal(authHeaderSent, 'Bearer real-jwt-token-123', 'Must pass Authorization header');
    assert.ok(host.textContent.includes('Hoang Van Real Beneficiary'), 'Real data must be displayed');
    assert.equal(host.textContent.includes('Nguyễn Văn An'), false, 'Preview fixture must NOT be displayed');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 4. DEV Authenticated - Real API error does NOT fallback to fixtures
test('Preview Guard - DEV authenticated API error displays error and never falls back to fake fixtures', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => {
    return new Response(JSON.stringify({ code: 'ACCESS_DENIED' }), {
      status: 403,
      headers: { 'Content-Type': 'application/json' },
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: 'authenticated-token',
          lang: 'vi',
          isDevPreview: true,
        })
      );
    });

    // Assert: Error state rendered
    assert.ok(host.querySelector('.lv-tb-load-error'), 'Error message must be shown upon API failure');
    assert.equal(host.querySelector('.lv-tb-preview-banner'), null, 'Must NOT show sample banner on error');
    assert.equal(host.textContent.includes('Nguyễn Văn An'), false, 'Must NOT fallback to preview fixtures');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 5. Transition from preview to authenticated session discards preview state and open dialogs
test('Preview Guard - transition from preview to authenticated session discards preview state and dialogs', async () => {
  let isAuth = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (!isAuth) {
      return json({ error: 'not auth' }, 500);
    }
    if (url.includes('configuration-check')) {
      return json({ vaultId, ready: true, beneficiaryCount: 1, issues: [] });
    }
    if (url.includes('beneficiaries')) {
      return json({
        content: [
          {
            id: '44444444-4444-4444-8444-444444444444',
            vaultId,
            fullName: 'Real Logged In User',
            relationship: 'Daughter',
            status: 'DESIGNATED',
            hasAccount: false,
            hasIdentityNumber: false,
            createdAt: '2026-10-18T00:00:00Z',
          },
        ],
        page: 0,
        size: 20,
        totalElements: 1,
        totalPages: 1,
      });
    }
    return json({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    // 1. Mount in preview
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: null,
          lang: 'vi',
          isDevPreview: true,
        })
      );
    });

    assert.ok(host.querySelector('.lv-tb-preview-banner'));

    // Open dialog in preview
    const openBtn = host.querySelector('button.lv-tb-btn-primary');
    await act(async () => {
      openBtn.click();
    });
    assert.ok(host.querySelector('dialog[open]'), 'Dialog should be open in preview');

    // 2. User logs in -> re-render with accessToken
    isAuth = true;
    await act(async () => {
      root.render(
        React.createElement(DevPage, {
          vaultId,
          accessToken: 'new-auth-token',
          lang: 'vi',
          isDevPreview: true,
        })
      );
    });

    // Assert: Preview dialog closed, sample banner removed, real data rendered
    assert.equal(host.querySelector('dialog[open]'), null, 'Open dialog must be closed on login transition');
    assert.equal(host.querySelector('.lv-tb-preview-banner'), null, 'Sample banner must be removed on login');
    assert.ok(host.textContent.includes('Real Logged In User'), 'Real session data must be displayed');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

// 6. Production build rejects preview unconditionally
test('Preview Guard - Production build rejects preview unconditionally and calls real API', async () => {
  const ProdPage = await compileComponent(true);
  let apiCalled = false;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    apiCalled = true;
    return json({ error: 'unauthenticated' }, 401);
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(
        React.createElement(ProdPage, {
          vaultId,
          accessToken: null,
          lang: 'vi',
          isDevPreview: true, // Should be rejected in production
        })
      );
    });

    // Assert: In production, sample banner must NOT exist
    assert.equal(host.querySelector('.lv-tb-preview-banner'), null, 'Production build must NEVER render sample banner');

    // Assert: Real API was called (and failed 401 unauthenticated), no fake fixtures rendered
    assert.equal(apiCalled, true, 'Production build must attempt real API call');
    assert.equal(host.textContent.includes('Nguyễn Văn An'), false, 'Production must NEVER synthesize fake fixtures');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});
