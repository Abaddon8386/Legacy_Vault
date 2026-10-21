import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/shared-with-me' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
dom.window.HTMLElement.prototype.attachEvent = () => {};
dom.window.HTMLElement.prototype.detachEvent = () => {};
dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function change(host, selector, value) {
  const field = host.querySelector(selector);
  assert.ok(field, 'Field must exist: ' + selector);
  const key = Object.keys(field).find(k => k.startsWith('__reactProps$'));
  assert.ok(key, 'React internal props key must exist on ' + selector);
  await act(async () => {
    field[key].onChange({ target: { value } });
  });
}

async function submit(host) {
  const form = host.querySelector('form');
  assert.ok(form, 'Form must exist');
  const key = Object.keys(form).find(k => k.startsWith('__reactProps$'));
  await act(async () => {
    if (key && form[key]?.onSubmit) {
      form[key].onSubmit({ preventDefault: () => {} });
    } else {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    }
  });
}

async function loadComponentModule(entry, production = false) {
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

const { default: SharedWithMePage } = await loadComponentModule('src/pages/beneficiary/SharedWithMePage.jsx');
const { default: AppShell } = await loadComponentModule('src/components/layout/AppShell.jsx');

function submitTwiceInOneBatch(host) {
  const form = host.querySelector('form');
  assert.ok(form);
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
  form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
}

test('redeem lock is synchronous before React commits; one adapter call for repeated submit', async () => {
  let calls = 0, finish;
  const v = await mount(SharedWithMePage, {
    session: { user: { id: 'user-a' }, accessToken: 'fixture-token' },
    invitationActions: { accept: () => { calls++; return new Promise(resolve => { finish = resolve; }); } },
  });
  try {
    await change(v.host, '.lv-shared-input', 'FIXTURE-CODE');
    await act(async () => submitTwiceInOneBatch(v.host));
    assert.equal(calls, 1);
    assert.equal(v.host.querySelector('.lv-shared-btn-primary').disabled, true);
    await act(async () => finish());
    assert.ok(v.host.querySelector('.lv-shared-feedback--success'));
  } finally { await v.close(); }
});

test('a failed redeem releases its lock for an explicit retry, never auto-retries', async () => {
  let calls = 0, reject, finish;
  const v = await mount(SharedWithMePage, {
    session: { user: { id: 'user-a' }, accessToken: 'fixture-token' },
    invitationActions: { accept: () => {
      calls++;
      return new Promise((resolve, fail) => { reject = fail; finish = resolve; });
    } },
  });
  try {
    await change(v.host, '.lv-shared-input', 'FIXTURE-CODE');
    await submit(v.host);
    await act(async () => reject(new Error('Fixture rejected before link')));
    assert.equal(calls, 1);
    assert.equal(v.host.querySelector('.lv-shared-btn-primary').disabled, false);
    await act(async () => submitTwiceInOneBatch(v.host));
    assert.equal(calls, 2);
    await act(async () => finish());
    assert.ok(v.host.querySelector('.lv-shared-feedback--success'));
  } finally { await v.close(); }
});

test('old context completion cannot unlock the pending redeem in the next context', async () => {
  const requests = [];
  const accept = (data, options) => new Promise(resolve => requests.push({ resolve, signal: options.signal }));
  const props = token => ({ session: { user: { id: token }, accessToken: token }, invitationActions: { accept } });
  const v = await mount(SharedWithMePage, props('fixture-a'));
  try {
    await change(v.host, '.lv-shared-input', 'CODE-A'); await submit(v.host);
    await v.render(props('fixture-b'));
    assert.equal(requests[0].signal.aborted, true);
    await change(v.host, '.lv-shared-input', 'CODE-B'); await submit(v.host);
    await act(async () => requests[0].resolve());
    assert.equal(v.host.querySelector('.lv-shared-btn-primary').disabled, true);
    await act(async () => submitTwiceInOneBatch(v.host));
    assert.equal(requests.length, 2, 'old finally must not open the new lock');
    await act(async () => requests[1].resolve());
    assert.ok(v.host.querySelector('.lv-shared-feedback--success'));
  } finally { await v.close(); }
});
const { default: App } = await loadComponentModule('src/App.jsx', true);
const { default: DevApp } = await loadComponentModule('src/App.jsx', false);

async function mount(Component, props = {}, children = null) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Component, props, children));
  });
  return {
    host,
    root,
    render: async (newProps, newChildren = null) => {
      await act(async () => {
        root.render(React.createElement(Component, newProps, newChildren));
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

test('SharedWithMePage - renders header and honest counter guidance without fake contacts', async () => {
  const v = await mount(SharedWithMePage, { lang: 'vi', isDevPreview: true, previewScenario: 'waiting' });
  try {
    const heading = v.host.querySelector('#shared-heading');
    assert.ok(heading, 'Page heading must exist');
    assert.equal(heading.textContent.trim(), 'Được chia sẻ với tôi');

    const counterText = v.host.querySelector('.lv-shared-counter-text');
    assert.ok(counterText, 'Counter guidance must exist');
    assert.match(counterText.textContent, /Đến quầy để được hỗ trợ/);

    const allText = v.host.textContent;
    assert.ok(!allText.includes('090') && !allText.includes('1900') && !allText.includes('hotline'), 'No fake phone numbers');
    assert.ok(!allText.includes('support@') && !allText.includes('contact@'), 'No fake emails');

    await v.render({ lang: 'en', isDevPreview: true, previewScenario: 'waiting' });
    assert.equal(v.host.querySelector('#shared-heading').textContent.trim(), 'Shared with me');
    assert.match(v.host.querySelector('.lv-shared-counter-text').textContent, /Visit the counter for assistance/);
  } finally {
    await v.close();
  }
});

test('SharedWithMePage - invitation linking form calls invitationActions and displays feedback', async () => {
  let acceptedCode = null;
  const mockInvitationActions = {
    accept: async ({ code }) => {
      acceptedCode = code;
      return { success: true, linked: true };
    },
  };

  const v = await mount(SharedWithMePage, { lang: 'vi', invitationActions: mockInvitationActions });
  try {
    const input = v.host.querySelector('.lv-shared-input');
    const submitBtn = v.host.querySelector('.lv-shared-btn-primary');
    assert.ok(input, 'Invitation input must exist');
    assert.ok(submitBtn, 'Submit button must exist');
    assert.ok(submitBtn.disabled, 'Submit button must be disabled when input is empty');

    await change(v.host, '.lv-shared-input', 'INV-1234-ABCD');
    assert.equal(submitBtn.disabled, false, 'Submit button should be enabled after input');

    await submit(v.host);
    assert.equal(acceptedCode, 'INV-1234-ABCD');
    const successFeedback = v.host.querySelector('.lv-shared-feedback--success');
    assert.ok(successFeedback, 'Success feedback must be rendered');
    assert.match(successFeedback.textContent, /Liên kết hồ sơ thành công/);
  } finally {
    await v.close();
  }
});

test('SharedWithMePage - honest error when invitation redemption API is not wired', async () => {
  const v = await mount(SharedWithMePage, { lang: 'vi' });
  try {
    await change(v.host, '.lv-shared-input', 'INV-9999');
    await submit(v.host);

    const errorFeedback = v.host.querySelector('.lv-shared-feedback--error');
    assert.ok(errorFeedback, 'Error feedback must be rendered');
    assert.match(errorFeedback.textContent, /chưa khả dụng/);
  } finally {
    await v.close();
  }
});

test('AppShell - Navigation registry includes Shared with me for OWNER and BENEFICIARY', async () => {
  let navigatedTo = null;

  // 1. Owner layout: has personal vault tabs + Shared with me
  const v = await mount(AppShell, {
    role: 'OWNER',
    currentTab: 'shared-with-me',
    lang: 'vi',
    isAuthenticated: true,
    session: { user: { id: 'usr-owner-1', email: 'owner@example.com', roles: ['VAULT_OWNER'] }, accessToken: 'token' },
    onNavigateTab: (tab) => { navigatedTo = tab; },
  }, React.createElement('div', null, 'Content'));

  try {
    const navButtons = [...v.host.querySelectorAll('button, a')];
    const sharedTab = navButtons.find(b => b.textContent.includes('Được chia sẻ với tôi'));
    assert.ok(sharedTab, 'Shared with me tab must exist in OWNER sidebar');

    const vaultTab = navButtons.find(b => b.textContent.includes('Kho di sản'));
    assert.ok(vaultTab, 'Vault tab must still exist in OWNER sidebar');

    await act(async () => { vaultTab.click(); });
    assert.equal(navigatedTo, 'vault', 'Navigating from Shared with me to Vault must work without changing role');

    const breadcrumb = v.host.querySelector('.lv-header-breadcrumbs');
    assert.ok(breadcrumb, 'Header breadcrumbs must exist');
    assert.match(breadcrumb.textContent, /Được chia sẻ với tôi/);

    // 2. Beneficiary layout: only Shared with me
    await v.render({
      role: 'BENEFICIARY',
      currentTab: 'shared-with-me',
      lang: 'en',
      isAuthenticated: true,
      session: { user: { id: 'usr-bene-1', email: 'bene@example.com', roles: ['BENEFICIARY'] }, accessToken: 'token' },
      onNavigateTab: (tab) => { navigatedTo = tab; },
    }, React.createElement('div', null, 'Bene Content'));

    const enSharedTab = [...v.host.querySelectorAll('button, a')].find(b => b.textContent.includes('Shared with me'));
    assert.ok(enSharedTab, 'Shared with me tab must exist in BENEFICIARY sidebar in EN');
    const enBreadcrumb = v.host.querySelector('.lv-header-breadcrumbs');
    assert.match(enBreadcrumb.textContent, /Shared with me/);
  } finally {
    await v.close();
  }
});

test('SharedWithMePage - Embedded ReceivedAssets displays received delivered items cleanly', async () => {
  const subject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const deliveredItem = {
    itemId: '11111111-1111-4111-8111-111111111111',
    title: 'Gói tài khoản đầu tư chứng khoán',
    sourceLabel: 'Hồ sơ phân bổ tòa án số QĐ-01/2026',
    deliveryStatus: 'DELIVERED',
    deliveredAt: '2026-10-20T08:00:00Z',
    sessionStatus: 'COMPLETED',
    vaultStatus: 'ARCHIVED',
    caseStatus: 'CLOSED',
  };

  const mockReceivedActions = {
    list: async ({ page, size }) => ({
      subjectId: subject,
      page,
      size,
      total: 1,
      accountState: 'RECEIVED',
      items: [deliveredItem],
    }),
    detail: async () => ({ ...deliveredItem, images: [] }),
    content: async () => ({ subjectId: subject, itemId: deliveredItem.itemId, text: 'Secret passphrase' }),
    image: async () => new Blob(['data'], { type: 'image/png' }),
  };

  const v = await mount(SharedWithMePage, {
    lang: 'vi',
    receivedAssetActions: mockReceivedActions,
    user: { id: subject, email: 'bene@example.com' },
    session: { accessToken: 'token', user: { id: subject } },
  });

  try {
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    const list = v.host.querySelector('.lv-received-list');
    assert.ok(list, 'Delivered asset list must be rendered');
    assert.match(list.textContent, /Gói tài khoản đầu tư chứng khoán/);
    assert.match(list.textContent, /Đã nhận/);

    const allButtons = [...v.host.querySelectorAll('button')].map(b => b.textContent.trim());
    assert.ok(!allButtons.some(t => t.includes('Xóa') || t.includes('Delete')), 'No delete button');
    assert.ok(!allButtons.some(t => t.includes('Chỉnh sửa') || t.includes('Edit')), 'No edit asset button');
    assert.ok(!allButtons.some(t => t.includes('Tự nhận') || t.includes('Claim')), 'No self-claim button');
  } finally {
    await v.close();
  }
});

test('SharedWithMePage - unavailable service is honest pending banner, not empty list', async () => {
  const v = await mount(SharedWithMePage, {
    lang: 'vi',
    user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', email: 'bene@example.com' },
    session: { accessToken: 'live-token', user: { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' } },
  });

  try {
    const pendingBlock = v.host.querySelector('.lv-received-pending');
    assert.ok(pendingBlock, 'Pending banner must be shown when adapter is missing');
    assert.match(pendingBlock.textContent, /Thông tin tài sản đã nhận chưa khả dụng/);
    assert.match(pendingBlock.textContent, /chưa được kết nối/);
    assert.equal(v.host.querySelector('.lv-received-list'), null, 'No empty list container');
  } finally {
    await v.close();
  }
});

test('SharedWithMePage - partial state renders only delivered items', async () => {
  const subject = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
  const deliveredItem = {
    itemId: '11111111-1111-4111-8111-111111111111',
    title: 'Phần tài sản đã giao',
    sourceLabel: 'Quyết định bàn giao số 01',
    deliveryStatus: 'DELIVERED',
    deliveredAt: '2026-10-20T08:00:00Z',
    sessionStatus: 'OPEN',
    vaultStatus: 'HANDOVER_IN_PROGRESS',
    caseStatus: 'OPEN',
  };
  const partialActions = {
    list: async ({ page, size }) => ({
      subjectId: subject,
      page,
      size,
      total: 1,
      accountState: 'PARTIAL',
      items: [deliveredItem],
    }),
    detail: async () => ({ ...deliveredItem, images: [] }),
    content: async () => ({ subjectId: subject, itemId: deliveredItem.itemId, text: 'Secret' }),
    image: async () => new Blob(['x'], { type: 'image/png' }),
  };

  const v = await mount(SharedWithMePage, {
    lang: 'vi',
    receivedAssetActions: partialActions,
    user: { id: subject, email: 'bene@example.com' },
    session: { accessToken: 'token', user: { id: subject } },
  });

  try {
    await act(async () => {
      await new Promise(r => setTimeout(r, 60));
    });

    assert.match(v.host.textContent, /Đã nhận một phần/);
    assert.ok(v.host.querySelector('.lv-received-list'), 'Partial state renders received delivered items only');
  } finally {
    await v.close();
  }
});

// --- PS-105 REGRESSION TESTS ---

test('Regression Finding 1: Existing Bene landing Shared with me button must navigate actual App to /shared-with-me', async () => {
  window.history.replaceState({}, '', '/beneficiary');
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Regression Bene', email: 'bene@example.test', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'fixture-token', user, expiresAt: Date.now() + 3600000 };
  window.sessionStorage.setItem('legacyvault.session.v1', JSON.stringify(session));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const v = await mount(App, {});
  try {
    const btn = [...v.host.querySelectorAll('button')].find(x => x.textContent.trim() === 'Được chia sẻ với tôi');
    assert.ok(btn, 'Button "Được chia sẻ với tôi" must exist on Bene landing');
    await act(async () => btn.click());
    assert.equal(window.location.pathname, '/shared-with-me', 'Clicking Shared with me tab in Bene landing must reach /shared-with-me');
  } finally {
    await v.close();
    globalThis.fetch = oldFetch;
    window.sessionStorage.clear();
  }
});

test('Regression Finding 1 (Owner flow): Owner can navigate from vault to Shared with me and back to vault', async () => {
  window.history.replaceState({}, '', '/vault');
  const user = { id: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', fullName: 'Owner User', email: 'owner@example.test', roles: ['VAULT_OWNER'] };
  const session = { accessToken: 'fixture-owner-token', user, expiresAt: Date.now() + 3600000 };
  window.sessionStorage.setItem('legacyvault.session.v1', JSON.stringify(session));
  const oldFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify(user), { status: 200, headers: { 'Content-Type': 'application/json' } });
  const v = await mount(App, {});
  try {
    const sharedTab = [...v.host.querySelectorAll('button')].find(x => x.textContent.trim() === 'Được chia sẻ với tôi');
    assert.ok(sharedTab, 'Owner sidebar must have Shared with me tab');
    await act(async () => sharedTab.click());
    assert.equal(window.location.pathname, '/shared-with-me', 'Owner clicking Shared with me must reach /shared-with-me');

    const vaultTab = [...v.host.querySelectorAll('button')].find(x => x.textContent.includes('Kho di sản') || x.textContent.includes('Heritage Vault'));
    assert.ok(vaultTab, 'Sidebar must have Vault tab');
    await act(async () => vaultTab.click());
    assert.equal(window.location.pathname, '/vault', 'Owner clicking Vault tab must return to /vault');
  } finally {
    await v.close();
    globalThis.fetch = oldFetch;
    window.sessionStorage.clear();
  }
});

test('Regression Finding 2: Redeem form must forward current session access token to invitationActions adapter', async () => {
  let capturedOptions;
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Bene User', email: 'bene@example.test', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'fixture-token-abc', user, expiresAt: Date.now() + 3600000 };
  const v = await mount(SharedWithMePage, {
    user,
    session,
    invitationActions: {
      accept: async (data, opts) => {
        capturedOptions = opts;
        return { success: true };
      },
    },
  });
  try {
    await change(v.host, '.lv-shared-input', 'INV-FIXTURE-CODE');
    await submit(v.host);
    assert.equal(capturedOptions?.accessToken, session.accessToken, 'Access token must be forwarded to accept options');
  } finally {
    await v.close();
  }
});

test('Regression Finding 2 (Auth error & failure handling): 401 triggers onUnauthorized, does not show success', async () => {
  let unauthorizedCalled = false;
  const user = { id: 'usr-1', email: 'test@example.com', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'expired-token', user };
  const v = await mount(SharedWithMePage, {
    user,
    session,
    onUnauthorized: () => { unauthorizedCalled = true; },
    invitationActions: {
      accept: async () => {
        const err = new Error('Unauthorized');
        err.status = 401;
        throw err;
      },
    },
  });
  try {
    await change(v.host, '.lv-shared-input', 'INV-EXP');
    await submit(v.host);
    assert.equal(unauthorizedCalled, true, 'onUnauthorized must be triggered on 401 error');
    assert.equal(v.host.querySelector('.lv-shared-feedback--success'), null, 'Success banner must NOT be shown on error');
    assert.ok(v.host.querySelector('.lv-shared-feedback--error'), 'Error banner must be rendered');
  } finally {
    await v.close();
  }
});

test('Regression Finding 3: Navigating away / unmounting must abort pending redeem request', async () => {
  let capturedSignal, resolvePending;
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Bene User', email: 'bene@example.test', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'fixture-token-abc', user, expiresAt: Date.now() + 3600000 };
  const v = await mount(SharedWithMePage, {
    user,
    session,
    invitationActions: {
      accept: (data, opts) => {
        capturedSignal = opts.signal;
        return new Promise(r => { resolvePending = r; });
      },
    },
  });
  await change(v.host, '.lv-shared-input', 'INV-FIXTURE-CODE');
  await submit(v.host);
  await v.close();
  try {
    assert.equal(capturedSignal?.aborted, true, 'Pending signal must be aborted when unmounted');
  } finally {
    await act(async () => { resolvePending?.(); });
  }
});

test('Regression Finding 3 (Context guard): Changing account/token clears input and disables stale response', async () => {
  let resolveFirst;
  const user1 = { id: 'usr-1', email: 'u1@example.com' };
  const session1 = { accessToken: 'tok-1', user: user1 };
  const user2 = { id: 'usr-2', email: 'u2@example.com' };
  const session2 = { accessToken: 'tok-2', user: user2 };

  let acceptCount = 0;
  const v = await mount(SharedWithMePage, {
    user: user1,
    session: session1,
    invitationActions: {
      accept: (data, opts) => {
        acceptCount++;
        return new Promise(r => { resolveFirst = r; });
      },
    },
  });

  try {
    await change(v.host, '.lv-shared-input', 'CODE-FIRST');
    await submit(v.host);
    assert.equal(acceptCount, 1);

    // Switch account / session while request is pending
    await v.render({
      user: user2,
      session: session2,
      invitationActions: {
        accept: async () => ({ success: true }),
      },
    });

    const inputAfterSwitch = v.host.querySelector('.lv-shared-input');
    assert.equal(inputAfterSwitch.value, '', 'Input code must be cleared when context/principal changes');

    // Resolve stale request from previous account
    await act(async () => { resolveFirst?.({ success: true }); });

    // Success feedback from previous session must NOT appear in new context
    assert.equal(v.host.querySelector('.lv-shared-feedback--success'), null, 'Stale response must not show in new session');
  } finally {
    await v.close();
  }
});

test('Regression Finding 3 (Language switch): Language switch in same context retains input code', async () => {
  const user = { id: 'usr-1', email: 'u1@example.com' };
  const session = { accessToken: 'tok-1', user };
  const v = await mount(SharedWithMePage, {
    user,
    session,
    lang: 'vi',
    invitationActions: { accept: async () => ({}) },
  });

  try {
    await change(v.host, '.lv-shared-input', 'TYPING-CODE');
    await v.render({
      user,
      session,
      lang: 'en',
      invitationActions: { accept: async () => ({}) },
    });
    assert.equal(v.host.querySelector('.lv-shared-input').value, 'TYPING-CODE', 'Draft code must not be cleared on language change');
  } finally {
    await v.close();
  }
});

test('Regression Finding 4: Successful link must reload received records for newly linked deliveries', async () => {
  let listCalls = 0;
  const user = { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', fullName: 'Bene User', email: 'bene@example.test', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'fixture-token-abc', user, expiresAt: Date.now() + 3600000 };
  const actions = {
    list: async ({ page, size }) => {
      listCalls++;
      return { subjectId: user.id, page, size, total: 0, accountState: 'UNLINKED', items: [] };
    },
    detail: async () => {},
    content: async () => {},
    image: async () => {},
  };
  const v = await mount(SharedWithMePage, {
    user,
    session,
    receivedAssetActions: actions,
    invitationActions: {
      accept: async () => ({ success: true }),
    },
  });
  try {
    const beforeCount = listCalls;
    assert.ok(beforeCount > 0, 'Initial list call must have executed');
    await change(v.host, '.lv-shared-input', 'INV-FIXTURE-CODE');
    await submit(v.host);
    assert.ok(listCalls > beforeCount, 'Newly linked records must be reloaded after successful link');
  } finally {
    await v.close();
  }
});

test('Regression Finding 4 (Retry read after link error): Read error after link allows retry without re-redeeming code', async () => {
  let acceptCalls = 0;
  let listCalls = 0;
  let failList = true;
  const user = { id: 'usr-retry', email: 'retry@example.test', roles: ['BENEFICIARY'] };
  const session = { accessToken: 'token-retry', user };

  const actions = {
    list: async () => {
      listCalls++;
      if (failList && listCalls > 1) {
        throw new Error('Network error loading assets');
      }
      return { subjectId: user.id, page: 0, size: 5, total: 0, accountState: 'AWAITING_HANDOVER', items: [] };
    },
    detail: async () => {},
    content: async () => {},
    image: async () => {},
  };

  const v = await mount(SharedWithMePage, {
    user,
    session,
    receivedAssetActions: actions,
    invitationActions: {
      accept: async () => {
        acceptCalls++;
        return { success: true };
      },
    },
  });

  try {
    assert.equal(listCalls, 1);
    await change(v.host, '.lv-shared-input', 'INV-RETRY-READ');
    await submit(v.host);

    assert.equal(acceptCalls, 1, 'Accept should be called exactly once');
    assert.equal(listCalls, 2, 'List should be called on reload after link');

    // List failed, retry button should be present in ReceivedAssets
    const retryBtn = [...v.host.querySelectorAll('button')].find(b => b.textContent.includes('Thử lại') || b.textContent.includes('Retry'));
    assert.ok(retryBtn, 'Retry read button must exist when read reload fails');

    failList = false;
    await act(async () => { retryBtn.click(); });

    assert.equal(listCalls, 3, 'List should be called again on retry');
    assert.equal(acceptCalls, 1, 'Accept MUST NOT be called again on read retry');
  } finally {
    await v.close();
  }
});


test('Actual App DEV preview: defaults to unlinked with 0 items when no scenario specified', async () => {
  window.sessionStorage.clear();
  window.localStorage.clear();
  window.history.replaceState({}, '', '/shared-with-me?preview=true');

  const v = await mount(DevApp, {});
  try {
    await act(async () => new Promise(r => setTimeout(r, 150)));
    assert.match(v.host.textContent, /Hồ sơ chưa được liên kết/);
    assert.doesNotMatch(v.host.textContent, /Kỷ vật gia đình/);
    assert.doesNotMatch(v.host.textContent, /Tài liệu cá nhân/);
    assert.doesNotMatch(v.host.textContent, /Family keepsake/);
    assert.equal(v.host.querySelectorAll('.lv-received-item').length, 0);
  } finally {
    await v.close();
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
});

test('Actual App DEV preview: shows demo items only when scenario=received or scenario=partial is explicit', async () => {
  window.sessionStorage.clear();
  window.localStorage.clear();

  // 1. Explicit scenario=received
  window.history.replaceState({}, '', '/shared-with-me?preview=true&scenario=received');
  const v1 = await mount(DevApp, {});
  try {
    await act(async () => new Promise(r => setTimeout(r, 150)));
    assert.match(v1.host.textContent, /Kỷ vật gia đình/);
    assert.match(v1.host.textContent, /Tài liệu cá nhân/);
    assert.match(v1.host.textContent, /Dữ liệu minh họa/);
    assert.equal(v1.host.querySelectorAll('.lv-received-item').length, 2);
  } finally {
    await v1.close();
  }

  // 2. Explicit scenario=partial
  window.history.replaceState({}, '', '/shared-with-me?preview=true&scenario=partial');
  const v2 = await mount(DevApp, {});
  try {
    await act(async () => new Promise(r => setTimeout(r, 150)));
    assert.match(v2.host.textContent, /Đã nhận một phần/);
    assert.match(v2.host.textContent, /Kỷ vật gia đình/);
    assert.doesNotMatch(v2.host.textContent, /Tài liệu cá nhân/);
    assert.equal(v2.host.querySelectorAll('.lv-received-item').length, 1);
  } finally {
    await v2.close();
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
});

test('Actual App DEV preview: tab navigation preserves active preview scenario without reverting to received', async () => {
  window.sessionStorage.clear();
  window.localStorage.clear();

  // Start with explicit partial scenario
  window.history.replaceState({}, '', '/shared-with-me?preview=true&scenario=partial');
  const v = await mount(DevApp, {});
  try {
    await act(async () => new Promise(r => setTimeout(r, 150)));
    assert.match(v.host.textContent, /Đã nhận một phần/);

    // Click navigation tab 'shared-with-me'
    const sharedTab = [...v.host.querySelectorAll('button, a')].find(b => b.textContent.includes('Được chia sẻ với tôi'));
    if (sharedTab) {
      await act(async () => { sharedTab.click(); });
      await act(async () => new Promise(r => setTimeout(r, 100)));
      assert.ok(window.location.search.includes('scenario=partial'), 'Navigation must preserve scenario=partial in URL');
      assert.match(v.host.textContent, /Đã nhận một phần/);
      assert.doesNotMatch(v.host.textContent, /Tài liệu cá nhân/);
    }
  } finally {
    await v.close();
    window.sessionStorage.clear();
    window.localStorage.clear();
  }
});
