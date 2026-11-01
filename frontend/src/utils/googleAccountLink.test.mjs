import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

import { linkGoogleAccount } from './googleLinkService.js';
import { getAuthMessage } from './loginService.js';

// Setup browser DOM environment for testing components
const dom = new JSDOM('<html><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/account',
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponentModule(entry, envVars = {}) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': 'true',
      'import.meta.env.PROD': 'false',
      ...envVars,
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: {
        external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'],
      },
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

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return {
    host,
    update: async (nextProps) => {
      await act(async () => root.render(React.createElement(Component, nextProps)));
    },
    unmount: async () => {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

// ---------------------------------------------------------------------------
// 1. SERVICE UNIT TESTS: POST /api/v1/auth/google/link Contract & Validations
// ---------------------------------------------------------------------------

test('PS-85 Service: Rejects missing or empty credentials without network call', async () => {
  let called = false;
  const mockFetch = () => { called = true; return Promise.resolve(); };

  await assert.rejects(
    () => linkGoogleAccount({ credential: '', accessToken: 'test-token' }, { fetchFn: mockFetch }),
    (err) => {
      assert.equal(err.code, 'INVALID_GOOGLE_CREDENTIAL');
      assert.equal(err.status, 400);
      return true;
    }
  );

  await assert.rejects(
    () => linkGoogleAccount({ credential: '   ', accessToken: 'test-token' }, { fetchFn: mockFetch }),
    (err) => {
      assert.equal(err.code, 'INVALID_GOOGLE_CREDENTIAL');
      return true;
    }
  );

  assert.equal(called, false, 'Fetch must never be called when credential is empty');
});

test('PS-85 Service: Rejects missing or empty Bearer token without network call', async () => {
  let called = false;
  const mockFetch = () => { called = true; return Promise.resolve(); };

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'google-token-123', accessToken: '' }, { fetchFn: mockFetch }),
    (err) => {
      assert.equal(err.code, 'UNAUTHENTICATED');
      assert.equal(err.status, 401);
      return true;
    }
  );

  assert.equal(called, false, 'Fetch must never be called when accessToken is missing');
});

test('PS-85 Service: Sends POST /api/v1/auth/google/link with Bearer token and { credential }', async () => {
  let capturedUrl = '';
  let capturedOptions = null;

  const mockFetch = (url, options) => {
    capturedUrl = url;
    capturedOptions = options;
    return Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ linked: true }),
    });
  };

  const result = await linkGoogleAccount(
    { credential: 'google-id-token-xyz', accessToken: 'vault-jwt-abc' },
    { fetchFn: mockFetch, lang: 'vi' }
  );

  assert.ok(capturedUrl.endsWith('/auth/google/link'), `URL must be /auth/google/link, got ${capturedUrl}`);
  assert.equal(capturedUrl.includes('/auth/google/link'), true);
  assert.equal(capturedOptions.method, 'POST');
  assert.equal(capturedOptions.headers.Authorization, 'Bearer vault-jwt-abc');
  assert.equal(capturedOptions.headers.Accept, 'application/json');
  assert.equal(capturedOptions.headers['Accept-Language'], 'vi');
  assert.deepEqual(JSON.parse(capturedOptions.body), { credential: 'google-id-token-xyz' });

  assert.deepEqual(result, {
    linked: true,
    code: 'GOOGLE_LINK_SUCCESS',
    message: getAuthMessage('GOOGLE_LINK_SUCCESS', 'vi'),
  });
});

test('PS-85 Service: Rejects response when linked is not true (receipt validation)', async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ linked: false }),
    });

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'token', accessToken: 'jwt' }, { fetchFn: mockFetch }),
    (err) => {
      assert.equal(err.code, 'INVALID_AUTH_RESPONSE');
      return true;
    }
  );
});

test('PS-85 Service: Maps 409 GOOGLE_IDENTITY_ALREADY_LINKED accurately', async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 409,
      headers: { get: () => 'application/json' },
      json: async () => ({
        code: 'GOOGLE_IDENTITY_ALREADY_LINKED',
        message: 'Tài khoản Google này đã được liên kết với một tài khoản LegacyVault.',
      }),
    });

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'token', accessToken: 'jwt' }, { fetchFn: mockFetch, lang: 'vi' }),
    (err) => {
      assert.equal(err.code, 'GOOGLE_IDENTITY_ALREADY_LINKED');
      assert.equal(err.status, 409);
      assert.equal(err.message, 'Tài khoản Google này đã được liên kết với một tài khoản LegacyVault.');
      return true;
    }
  );
});

test('PS-85 Service: Maps 401 INVALID_GOOGLE_CREDENTIAL accurately', async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 401,
      headers: { get: () => 'application/json' },
      json: async () => ({
        code: 'INVALID_GOOGLE_CREDENTIAL',
        message: 'Thông tin xác thực từ Google không hợp lệ hoặc đã hết hạn.',
      }),
    });

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'token', accessToken: 'jwt' }, { fetchFn: mockFetch, lang: 'vi' }),
    (err) => {
      assert.equal(err.code, 'INVALID_GOOGLE_CREDENTIAL');
      assert.equal(err.status, 401);
      return true;
    }
  );
});

test('PS-85 Service: Maps 503 GOOGLE_SIGNIN_UNAVAILABLE or unready backend accurately', async () => {
  const mockFetch = () =>
    Promise.resolve({
      ok: false,
      status: 404,
      headers: { get: () => 'text/html' },
      text: async () => '<html>Vite SPA Fallback</html>',
    });

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'token', accessToken: 'jwt' }, { fetchFn: mockFetch, lang: 'vi' }),
    (err) => {
      assert.equal(err.code, 'GOOGLE_SIGNIN_UNAVAILABLE');
      return true;
    }
  );
});

test('PS-85 Service: Propagates network error cleanly', async () => {
  const mockFetch = () => Promise.reject(new Error('Failed to fetch'));

  await assert.rejects(
    () => linkGoogleAccount({ credential: 'token', accessToken: 'jwt' }, { fetchFn: mockFetch, lang: 'vi' }),
    (err) => {
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});

test('PS-85 Security: Credential and Bearer token are never logged or stored', async () => {
  const originalLog = console.log;
  const originalError = console.error;
  let loggedData = '';

  console.log = (...args) => { loggedData += JSON.stringify(args); };
  console.error = (...args) => { loggedData += JSON.stringify(args); };

  try {
    const mockFetch = () =>
      Promise.resolve({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ linked: true }),
      });

    await linkGoogleAccount(
      { credential: 'SECRET_GOOGLE_CREDENTIAL_999', accessToken: 'SECRET_BEARER_TOKEN_888' },
      { fetchFn: mockFetch }
    );

    assert.equal(loggedData.includes('SECRET_GOOGLE_CREDENTIAL_999'), false);
    assert.equal(loggedData.includes('SECRET_BEARER_TOKEN_888'), false);
  } finally {
    console.log = originalLog;
    console.error = originalError;
  }
});

// ---------------------------------------------------------------------------
// 2. COMPONENT INTEGRATION TESTS: AccountProfilePage Google Account Linking UI
// ---------------------------------------------------------------------------

const testUser = {
  id: 'a0000000-0000-0000-0000-000000000001',
  fullName: 'Trần Văn An',
  email: 'an.tran@legacyvault.test',
  roles: ['VAULT_OWNER'],
};
const testSession = {
  accessToken: 'valid-jwt-token-001',
  expiresAt: Date.now() + 3600000,
  user: testUser,
};

test('AccountProfilePage - Renders Google Account Linking section without API or Client ID in UI', async () => {
  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' }
  );

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'vi',
  });

  try {
    const card = view.host.querySelector('.lv-profile-google-card');
    assert.ok(card, 'Google linking card must be rendered in profile');

    const title = card.querySelector('#google-link-heading');
    assert.ok(title, 'Title element must exist');
    assert.match(title.textContent, /Liên kết Google/);

    // Initial state must state that link status has not been checked
    const statusBadge = card.querySelector('.lv-profile-google-badge--unlinked');
    assert.ok(statusBadge, 'Should show unlinked status badge initially');
    assert.match(statusBadge.textContent, /Chưa kiểm tra trạng thái liên kết/);
    assert.doesNotMatch(statusBadge.textContent, /Chưa liên kết trong phiên này/);

    const limitation = card.querySelector('.lv-profile-google-limitation');
    assert.ok(limitation, 'Limitation note must be visible');
    assert.match(limitation.textContent, /Trạng thái liên kết hiển thị theo phiên làm việc hiện tại/);

    // Fallback notice when unconfigured
    const notice = card.querySelector('.lv-google-unavailable-notice');
    assert.ok(notice, 'Notice for unavailable linking must be displayed');
    assert.match(notice.textContent, /Liên kết Google chưa khả dụng\. Vui lòng thử lại sau\./);

    // STRICT: Neither "API" nor "Client ID" appears in user-facing UI
    assert.doesNotMatch(card.textContent, /\bAPI\b/, 'Must not expose technical term API to user');
    assert.doesNotMatch(card.textContent, /Client ID/i, 'Must not expose technical term Client ID to user');
  } finally {
    await view.unmount();
  }
});

test('AccountProfilePage - English localization renders properly without API or Client ID', async () => {
  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' }
  );

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'en',
  });

  try {
    const card = view.host.querySelector('.lv-profile-google-card');
    assert.ok(card);

    const title = card.querySelector('#google-link-heading');
    assert.match(title.textContent, /Link Google/);

    const statusBadge = card.querySelector('.lv-profile-google-badge--unlinked');
    assert.match(statusBadge.textContent, /Link status has not been checked/);
    assert.doesNotMatch(statusBadge.textContent, /Not linked in this session/);

    const limitation = card.querySelector('.lv-profile-google-limitation');
    assert.match(limitation.textContent, /Linked status is displayed for the current active session/);

    const notice = card.querySelector('.lv-google-unavailable-notice');
    assert.ok(notice);
    assert.match(notice.textContent, /Google linking is currently unavailable\. Please try again later\./);

    assert.doesNotMatch(card.textContent, /\bAPI\b/);
    assert.doesNotMatch(card.textContent, /Client ID/i);
  } finally {
    await view.unmount();
  }
});

test('AccountProfilePage - In-flight protection and anti-duplicate submit guard', async () => {
  let fetchCallCount = 0;
  let resolveNetwork;
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (url, options) => {
    if (url.includes('/auth/google/link')) {
      fetchCallCount++;
      return new Promise((resolve) => {
        resolveNetwork = resolve;
      });
    }
    return originalFetch ? originalFetch(url, options) : Promise.reject(new Error('Unknown URL'));
  };

  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"mock-client-id.apps.googleusercontent.com"' }
  );

  // Setup Google Identity Services mock in window
  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => {
          gisCallback = cfg.callback;
        },
        renderButton: (container) => {
          const btn = document.createElement('button');
          btn.className = 'gsi-rendered-btn';
          container.appendChild(btn);
        },
      },
    },
  };

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'vi',
  });

  try {
    assert.ok(gisCallback, 'GIS callback should have been initialized');

    // Trigger first link attempt
    await act(async () => {
      gisCallback({ credential: 'valid-google-cred-1' });
    });

    assert.equal(fetchCallCount, 1, 'First link attempt should trigger network fetch');

    // Trigger duplicate attempt while first is in-flight
    await act(async () => {
      gisCallback({ credential: 'duplicate-google-cred-2' });
    });

    assert.equal(fetchCallCount, 1, 'Duplicate attempt while in-flight MUST be blocked');

    // Resolve network request successfully
    await act(async () => {
      resolveNetwork({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ linked: true }),
      });
    });

    // Check UI updated to linked
    const linkedBadge = view.host.querySelector('.lv-profile-google-badge--linked');
    assert.ok(linkedBadge, 'Should display linked status badge after successful response');
    assert.match(linkedBadge.textContent, /Đã liên kết thành công/);

    const feedback = view.host.querySelector('.lv-profile-feedback--success');
    assert.ok(feedback, 'Success feedback should be displayed');
    assert.match(feedback.textContent, /Liên kết tài khoản Google thành công/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
    await view.unmount();
  }
});

test('AccountProfilePage - A linking -> switch to B -> B can immediately start linking without stuck loading', async () => {
  let resolveNetworkA;
  let resolveNetworkB;
  let fetchCallCount = 0;
  let capturedBearerHeaders = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (url, options) => {
    if (url.includes('/auth/google/link')) {
      fetchCallCount++;
      capturedBearerHeaders.push(options?.headers?.Authorization);
      if (fetchCallCount === 1) {
        return new Promise((resolve) => { resolveNetworkA = resolve; });
      }
      return new Promise((resolve) => { resolveNetworkB = resolve; });
    }
    return Promise.reject(new Error('Unknown URL'));
  };

  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"mock-client-id.apps.googleusercontent.com"' }
  );

  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => { gisCallback = cfg.callback; },
        renderButton: () => {},
      },
    },
  };

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'vi',
  });

  try {
    // 1. User A starts link request
    await act(async () => {
      gisCallback({ credential: 'user-a-credential' });
    });
    assert.equal(fetchCallCount, 1);
    assert.equal(capturedBearerHeaders[0], 'Bearer valid-jwt-token-001');

    // Verify indicator is spinning for User A
    assert.ok(view.host.querySelector('.lv-profile-google-linking-indicator'));

    // 2. Switch session to User B while A's request is still in-flight
    const userB = { ...testUser, id: 'b0000000-0000-0000-0000-000000000002', email: 'user.b@test' };
    const sessionB = { accessToken: 'token-user-b-999', expiresAt: Date.now() + 3600000, user: userB };

    await view.update({ session: sessionB, lang: 'vi' });

    // CRITICAL: User B must NOT be stuck in "Đang liên kết"!
    const indicatorAfterSwitch = view.host.querySelector('.lv-profile-google-linking-indicator');
    assert.equal(indicatorAfterSwitch, null, 'User B must not be stuck with linking indicator');

    // 3. User B immediately starts linking
    await act(async () => {
      gisCallback({ credential: 'user-b-credential' });
    });

    assert.equal(fetchCallCount, 2, 'User B must be able to start linking immediately');
    assert.equal(capturedBearerHeaders[1], 'Bearer token-user-b-999');

    // 4. User A's response arrives late
    await act(async () => {
      resolveNetworkA({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ linked: true }),
      });
    });

    // User A's late response must NOT clear User B's linking state or reset User B's status
    const card = view.host.querySelector('.lv-profile-google-card');
    assert.ok(
      card.querySelector('.lv-profile-google-linking-indicator'),
      'User B must still be actively linking even after A resolves'
    );

    // 5. User B's response arrives
    await act(async () => {
      resolveNetworkB({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ linked: true }),
      });
    });

    // User B now receives success
    assert.equal(card.querySelector('.lv-profile-google-linking-indicator'), null);
    const linkedBadge = card.querySelector('.lv-profile-google-badge--linked');
    assert.ok(linkedBadge, 'User B is now successfully linked');
    assert.match(linkedBadge.textContent, /Đã liên kết thành công/);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
    await view.unmount();
  }
});

test('AccountProfilePage - Token change for same user resets in-flight state without stuck loading', async () => {
  let resolveNetworkToken1;
  let fetchCallCount = 0;
  let capturedBearers = [];
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (url, options) => {
    if (url.includes('/auth/google/link')) {
      fetchCallCount++;
      capturedBearers.push(options?.headers?.Authorization);
      return new Promise((resolve) => { resolveNetworkToken1 = resolve; });
    }
    return Promise.reject(new Error('Unknown URL'));
  };

  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"mock-client-id.apps.googleusercontent.com"' }
  );

  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => { gisCallback = cfg.callback; },
        renderButton: () => {},
      },
    },
  };

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'vi',
  });

  try {
    // 1. User starts link request with Token 1
    await act(async () => {
      gisCallback({ credential: 'token-1-google-cred' });
    });
    assert.equal(fetchCallCount, 1);
    assert.equal(capturedBearers[0], 'Bearer valid-jwt-token-001');

    // 2. Same user gets a new access token (e.g. refreshed session)
    const refreshedSession = {
      ...testSession,
      accessToken: 'refreshed-jwt-token-002',
    };
    await view.update({ session: refreshedSession, lang: 'vi' });

    // CRITICAL: UI must NOT be stuck in "Đang liên kết"
    assert.equal(
      view.host.querySelector('.lv-profile-google-linking-indicator'),
      null,
      'Indicator must be gone after token change'
    );

    // 3. Late response for Token 1 arrives
    await act(async () => {
      resolveNetworkToken1({
        ok: true,
        status: 200,
        headers: { get: () => 'application/json' },
        json: async () => ({ linked: true }),
      });
    });

    // Late response for old token is discarded
    const card = view.host.querySelector('.lv-profile-google-card');
    assert.equal(card.querySelector('.lv-profile-feedback--success'), null);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
    await view.unmount();
  }
});

test('AccountProfilePage - Displays truthful error on 409 GOOGLE_IDENTITY_ALREADY_LINKED', async () => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = (url) => {
    if (url.includes('/auth/google/link')) {
      return Promise.resolve({
        ok: false,
        status: 409,
        headers: { get: () => 'application/json' },
        json: async () => ({
          code: 'GOOGLE_IDENTITY_ALREADY_LINKED',
          message: 'Tài khoản Google này đã được liên kết với một tài khoản LegacyVault.',
        }),
      });
    }
    return Promise.reject(new Error('Unknown URL'));
  };

  const { default: AccountProfilePage } = await loadComponentModule(
    'src/pages/account/AccountProfilePage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"mock-client-id.apps.googleusercontent.com"' }
  );

  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => { gisCallback = cfg.callback; },
        renderButton: () => {},
      },
    },
  };

  const view = await mount(AccountProfilePage, {
    session: testSession,
    lang: 'vi',
  });

  try {
    await act(async () => {
      gisCallback({ credential: 'already-linked-google-cred' });
    });

    const errorFeedback = view.host.querySelector('.lv-profile-feedback--error');
    assert.ok(errorFeedback, 'Error feedback must be rendered');
    assert.match(errorFeedback.textContent, /đã được liên kết với một tài khoản LegacyVault/);

    const linkedBadge = view.host.querySelector('.lv-profile-google-badge--linked');
    assert.equal(linkedBadge, null, 'Status must not be linked on error');
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
    await view.unmount();
  }
});

test('GoogleSignInButton - SDK load failure handles error without infinite loop or re-render loop', async () => {
  let errorCallCount = 0;
  let renderCount = 0;

  const { default: GoogleSignInButton } = await loadComponentModule(
    'src/components/auth/GoogleSignInButton.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"mock-configured-id.apps.googleusercontent.com"' }
  );

  // Setup parent harness that updates internal state when onError fires
  function Harness({ lang = 'vi' }) {
    renderCount++;
    const [, setErr] = useState(null);
    return React.createElement(GoogleSignInButton, {
      lang,
      onError: (e) => {
        errorCallCount++;
        setErr(e); // state update causes re-render of Harness and GoogleSignInButton
      },
    });
  }

  // Ensure window.google is NOT defined to trigger SDK failure
  const savedGoogle = globalThis.window.google;
  delete globalThis.window.google;

  const view = await mount(Harness, { lang: 'vi' });

  try {
    // In JSDOM, trigger script load failure by dispatching error event on the injected script
    const scriptSelector = 'script[src="https://accounts.google.com/gsi/client"]';
    const script = document.querySelector(scriptSelector);
    if (script) {
      await act(async () => {
        script.dispatchEvent(new globalThis.window.Event('error'));
      });
    }

    // Wait a tick for promise rejection & state updates to process
    await new Promise((r) => setTimeout(r, 50));

    // onError must be called exactly once and NOT looped
    assert.equal(errorCallCount, 1, 'onError must be invoked exactly once');
    assert.ok(renderCount <= 3, `renderCount must be bounded, got ${renderCount}`);

    // Check notice distinguishes SDK/connection error from unconfigured notice
    const notice = view.host.querySelector('.lv-google-unavailable-notice');
    assert.ok(notice, 'Notice should be displayed');
    assert.match(notice.textContent, /Không thể kết nối đến dịch vụ Google/);
    assert.doesNotMatch(notice.textContent, /chưa cấu hình/i);
    assert.doesNotMatch(notice.textContent, /Client ID/i);
  } finally {
    globalThis.window.google = savedGoogle;
    await view.unmount();
  }
});

test('PS-85 Audit & Verification Notice: Mock tests are not evidence of live Google integration', () => {
  // Explicitly note the architectural boundary
  const verificationNotice =
    'Mock tests verify contract conformance, safety guards, and UI responsiveness. Live Google verification still requires configured VITE_GOOGLE_CLIENT_ID and network access to Google Identity Services.';
  assert.ok(verificationNotice.includes('Live Google verification still requires configured VITE_GOOGLE_CLIENT_ID'));
});


for (const mode of ['same-session-object', 'different-user', 'different-token']) {
 test(`Google linking context regression: ${mode}`, async () => {
  const oldFetch=globalThis.fetch, callbacks=[], calls=[];
  let finish;
  window.google={accounts:{id:{initialize:cfg=>callbacks.push(cfg.callback),renderButton:container=>{container.appendChild(document.createElement('button'));}}}};
  globalThis.fetch=async(url,options)=>{
   if(url.endsWith('/auth/email-verification'))return new Response(JSON.stringify({verified:false,verifiedAt:null,requestAvailable:false,lastRequestState:null}),{headers:{'Content-Type':'application/json'}});
   calls.push(options);
   return new Promise(resolve=>{finish=()=>resolve(new Response(JSON.stringify({linked:true}),{status:200,headers:{'Content-Type':'application/json'}}));});
  };
  const {default:Page}=await loadComponentModule('src/pages/account/AccountProfilePage.jsx',{'import.meta.env.VITE_GOOGLE_CLIENT_ID':'"synthetic-client.apps.googleusercontent.com"'});
  const view=await mount(Page,{session:testSession,lang:'vi'});
  try {
   const oldCallback=callbacks.at(-1);
   if(mode==='same-session-object') {
    await act(async()=>oldCallback({credential:'synthetic-old'}));
    await view.update({session:{...testSession,user:{...testUser,fullName:'Refreshed name'}},lang:'vi'});
    assert.equal(calls[0].signal.aborted,false,'Same identity refresh must preserve link request');
    await act(async()=>finish());
    assert.ok(view.host.querySelector('.lv-profile-google-badge--linked'));
    assert.equal(view.host.querySelector('.lv-profile-google-linking-indicator')===null,true);
   } else {
    const next={...testSession,accessToken:'synthetic-next',user:mode==='different-user'?{...testUser,id:'b0000000-0000-0000-0000-000000000002'}:testUser};
    await view.update({session:next,lang:'vi'});
    assert.notEqual(callbacks.at(-1),oldCallback,'GIS must be remounted for a new identity/token');
    await act(async()=>oldCallback({credential:'synthetic-late-popup'}));
    assert.equal(calls.length,0,'Old popup must not send credentials under the new session');
    await act(async()=>callbacks.at(-1)({credential:'synthetic-current-popup'}));
    assert.equal(calls.length,1);
    assert.equal(calls[0].headers.Authorization,'Bearer synthetic-next');
    await act(async()=>finish());
    assert.ok(view.host.querySelector('.lv-profile-google-badge--linked'));
   }
  } finally {await view.unmount();globalThis.fetch=oldFetch;delete window.google;}
 });
}
