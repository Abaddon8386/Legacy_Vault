import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5173/login' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.HTMLInputElement = dom.window.HTMLInputElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');


async function loadComponent(entry, envVars = {}) {
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

test('GoogleSignInButton - Renders disabled fallback with friendly message when Client ID is unconfigured', async () => {
  const GoogleSignInButton = await loadComponent(
    'src/components/auth/GoogleSignInButton.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' }
  );

  const view = await mount(GoogleSignInButton, {
    lang: 'vi',
  });

  try {
    const btn = view.host.querySelector('.lv-google-btn-custom');
    assert.ok(btn, 'Custom Google button should be rendered');
    assert.match(btn.textContent, /Tiếp tục với Google/);
    assert.equal(btn.disabled, true, 'Button must be disabled when unconfigured');
    assert.doesNotMatch(btn.textContent, /Chưa cấu hình/, 'Must not show Chưa cấu hình badge');
    assert.doesNotMatch(btn.textContent, /Setup required/, 'Must not show Setup required badge');
    assert.doesNotMatch(btn.getAttribute('title') || '', /VITE_GOOGLE_CLIENT_ID/, 'Tooltip must not expose VITE_GOOGLE_CLIENT_ID');

    const notice = view.host.querySelector('.lv-google-unavailable-notice');
    assert.ok(notice, 'Unavailable notice should be rendered');
    assert.match(notice.textContent, /Đăng nhập Google hiện chưa khả dụng/);
  } finally {
    await view.close();
  }
});

test('GoogleSignInButton - GIS initialized with auto_select=false and renders official button when configured', async () => {
  let initConfig = null;
  let renderConfig = null;

  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => {
          initConfig = cfg;
        },
        renderButton: (el, cfg) => {
          renderConfig = cfg;
          const dummy = document.createElement('div');
          dummy.className = 'gsi-rendered-btn';
          dummy.textContent = 'Google Rendered Button';
          el.appendChild(dummy);
        },
      },
    },
  };

  const GoogleSignInButton = await loadComponent(
    'src/components/auth/GoogleSignInButton.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"test-google-client-id.apps.googleusercontent.com"' }
  );

  let credentialPayload = null;
  const view = await mount(GoogleSignInButton, {
    lang: 'en',
    onCredentialReceived: (res) => {
      credentialPayload = res;
    },
  });

  try {
    assert.ok(initConfig, 'GIS initialize should be called');
    assert.equal(initConfig.client_id, 'test-google-client-id.apps.googleusercontent.com');
    assert.equal(initConfig.auto_select, false, 'Auto-select must be false per requirement');
    assert.equal(initConfig.cancel_on_tap_outside, true);

    assert.ok(renderConfig, 'GIS renderButton should be called');
    assert.equal(renderConfig.type, 'standard');
    assert.equal(renderConfig.theme, 'outline');
    assert.equal(renderConfig.text, 'continue_with');
    assert.equal(renderConfig.locale, 'en');

    // Simulate GIS returning valid credential
    await act(async () => {
      initConfig.callback({ credential: 'mock.gis.jwt.credential' });
    });
    assert.ok(credentialPayload);
    assert.equal(credentialPayload.credential, 'mock.gis.jwt.credential');
    assert.equal(view.host.querySelector('.lv-google-unavailable-notice'), null, 'Notice should NOT be present when configured');
  } finally {
    await view.close();
    delete globalThis.window.google;
  }
});

test('LoginPage - Renders divider and Google sign-in button', async () => {
  const LoginPage = await loadComponent(
    'src/pages/auth/LoginPage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' }
  );

  const view = await mount(LoginPage, {});
  try {
    const divider = view.host.querySelector('.hn-login-divider');
    assert.ok(divider, 'Divider should be rendered between email form and Google button');
    assert.match(divider.textContent, /Hoặc/);

    const googleBtn = view.host.querySelector('#hn-login-google-btn');
    assert.ok(googleBtn, 'Google button should be present on login page');
  } finally {
    await view.close();
  }
});

test('LoginPage - Successful Google Sign-In triggers onAuthenticated with validated session', async () => {
  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => {
          gisCallback = cfg.callback;
        },
        renderButton: (el) => {
          el.innerHTML = '<button id="mock-gsi">Sign In With Google</button>';
        },
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/auth/google')) {
      return new Response(
        JSON.stringify({
          accessToken: 'google-bearer-token-1234',
          tokenType: 'Bearer',
          expiresInSeconds: 3600,
          user: {
            id: '22222222-2222-4222-8222-222222222222',
            fullName: 'Nguyen Google User',
            email: 'nguyen.google@gmail.com',
            roles: ['VAULT_OWNER'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const LoginPage = await loadComponent(
    'src/pages/auth/LoginPage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"google-client-id-abc"' }
  );

  let authenticatedResult = null;
  const view = await mount(LoginPage, {
    onAuthenticated: async (res) => {
      authenticatedResult = res;
    },
  });

  try {
    assert.ok(typeof gisCallback === 'function');
    await act(async () => {
      await gisCallback({ credential: 'valid-google-id-token-abc' });
    });

    assert.ok(authenticatedResult, 'onAuthenticated must be called on successful Google auth');
    assert.equal(authenticatedResult.accessToken, 'google-bearer-token-1234');
    assert.equal(authenticatedResult.user.email, 'nguyen.google@gmail.com');
    assert.deepEqual(authenticatedResult.user.roles, ['VAULT_OWNER']);
  } finally {
    await view.close();
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
  }
});

test('LoginPage - Displays polite localized message when backend Google endpoint is not ready', async () => {
  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => {
          gisCallback = cfg.callback;
        },
        renderButton: () => {},
      },
    },
  };

  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () =>
    new Response('<!DOCTYPE html><html><body>Unimplemented backend route</body></html>', {
      status: 404,
      headers: { 'Content-Type': 'text/html' },
    });

  const LoginPage = await loadComponent(
    'src/pages/auth/LoginPage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"google-client-id-abc"' }
  );

  const view = await mount(LoginPage, {});

  try {
    await act(async () => {
      await gisCallback({ credential: 'valid-google-token' });
    });

    const statusBox = view.host.querySelector('.hn-login-status-box.failure');
    assert.ok(statusBox, 'Failure status box should be rendered');
    assert.match(
      statusBox.textContent,
      /Đăng nhập Google hiện chưa khả dụng/
    );
  } finally {
    await view.close();
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
  }
});

test('LoginPage - Stale response is discarded after unmount and does not trigger onAuthenticated', async () => {
  let gisCallback = null;
  globalThis.window.google = {
    accounts: {
      id: {
        initialize: (cfg) => {
          gisCallback = cfg.callback;
        },
        renderButton: () => {},
      },
    },
  };

  const originalFetch = globalThis.fetch;
  let resolveDelayedFetch;
  globalThis.fetch = (url, init) =>
    new Promise((resolve, reject) => {
      resolveDelayedFetch = () => {
        if (init.signal?.aborted) {
          const err = new Error('The user aborted a request.');
          err.name = 'AbortError';
          reject(err);
        } else {
          resolve(
            new Response(
              JSON.stringify({
                accessToken: 'delayed-token',
                tokenType: 'Bearer',
                expiresInSeconds: 3600,
                user: {
                  id: '33333333-3333-4333-8333-333333333333',
                  fullName: 'Delayed User',
                  email: 'delayed@example.test',
                  roles: ['VAULT_OWNER'],
                },
              }),
              { status: 200, headers: { 'Content-Type': 'application/json' } }
            )
          );
        }
      };
    });

  const LoginPage = await loadComponent(
    'src/pages/auth/LoginPage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '"google-client-id-abc"' }
  );

  let authenticatedCalled = false;
  const view = await mount(LoginPage, {
    onAuthenticated: async () => {
      authenticatedCalled = true;
    },
  });

  try {
    // Start Google authentication
    let callbackPromise;
    act(() => {
      callbackPromise = gisCallback({ credential: 'delayed-token' });
    });

    // Unmount view before fetch resolves
    await view.close();

    // Now resolve fetch
    await act(async () => {
      resolveDelayedFetch();
      try {
        await callbackPromise;
      } catch {
        // AbortError expected
      }
    });

    assert.equal(
      authenticatedCalled,
      false,
      'onAuthenticated must not be called after unmount (stale response discarded)'
    );
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.window.google;
  }
});

test('LoginPage - Email and password login flow remains intact without regression', async () => {
  const originalFetch = globalThis.fetch;
  let loginRequested = false;

  globalThis.fetch = async (url, init) => {
    if (url.includes('/auth/login')) {
      loginRequested = true;
      return new Response(
        JSON.stringify({
          accessToken: 'email-pass-token',
          tokenType: 'Bearer',
          expiresInSeconds: 3600,
          user: {
            id: '44444444-4444-4444-8444-444444444444',
            fullName: 'Password User',
            email: 'user@legacyvault.vn',
            roles: ['VAULT_OWNER'],
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  const LoginPage = await loadComponent(
    'src/pages/auth/LoginPage.jsx',
    { 'import.meta.env.VITE_GOOGLE_CLIENT_ID': '""' }
  );

  let authenticatedResult = null;
  const view = await mount(LoginPage, {
    onAuthenticated: async (res) => {
      authenticatedResult = res;
    },
  });

  try {
    const emailInput = view.host.querySelector('#hn-login-email');
    const passwordInput = view.host.querySelector('#hn-login-password');

    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
        emailInput,
        'user@legacyvault.vn'
      );
      emailInput._valueTracker?.setValue?.('');
      emailInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });

    await act(async () => {
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(
        passwordInput,
        'ValidPassword123'
      );
      passwordInput._valueTracker?.setValue?.('');
      passwordInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      passwordInput.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });


    await act(async () => {
      view.host.querySelector('button[type="submit"]').click();
    });


    const errMsg = view.host.querySelector('.hn-login-error-msg');
    assert.equal(errMsg?.textContent || '', '');
    assert.equal(loginRequested, true, 'Regular login request must be sent to backend');

    assert.ok(authenticatedResult, 'onAuthenticated must be called for email/password login');
    assert.equal(authenticatedResult.accessToken, 'email-pass-token');
  } finally {
    await view.close();
    globalThis.fetch = originalFetch;
  }
});
