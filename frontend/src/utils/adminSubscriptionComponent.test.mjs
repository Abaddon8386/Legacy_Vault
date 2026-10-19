import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/admin/subscriptions' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry = 'src/pages/admin/AdminSubscriptionPage.jsx') {
  const result = await build({
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

const Page = await component();

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

test('AdminSubscriptionPage renders header, title, and tabs in both VI and EN', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => [],
  });

  try {
    const viView = await mount(Page, { lang: 'vi' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      assert.ok(viView.host.textContent.includes('Quản lý gói sử dụng'));
      assert.ok(viView.host.textContent.includes('Danh mục gói & Phiên bản'));
      assert.ok(viView.host.textContent.includes('Tra cứu tài khoản'));
      assert.ok(viView.host.textContent.includes('Giao dịch thanh toán'));
    } finally {
      await viView.close();
    }

    const enView = await mount(Page, { lang: 'en' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      assert.ok(enView.host.textContent.includes('Subscription Plan Catalog'));
      assert.ok(enView.host.textContent.includes('Plans & Versions'));
      assert.ok(enView.host.textContent.includes('Account Quota Lookup'));
      assert.ok(enView.host.textContent.includes('Payment Transactions'));
    } finally {
      await enView.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('Tab switching displays account search and transactions notice', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => [],
  });

  try {
    const view = await mount(Page, { lang: 'vi' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      const buttons = view.host.querySelectorAll('.lv-admin-sub-tab-btn');
      assert.equal(buttons.length, 3);

      // Click Accounts tab
      await act(async () => {
        buttons[1].click();
      });
      assert.ok(view.host.querySelector('.lv-admin-sub-search-input'));
      assert.ok(view.host.textContent.includes('Tra cứu'));

      // Click Transactions tab
      await act(async () => {
        buttons[2].click();
      });
      assert.ok(view.host.textContent.includes('PS-80'));
      assert.ok(view.host.textContent.includes('chưa khả dụng'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('AdminSubscriptionPage renders plan cards returned from API', async () => {
  const previousFetch = globalThis.fetch;
  const mockPlans = [
    {
      planCode: 'BASIC',
      nameVi: 'Cơ bản',
      nameEn: 'Basic',
      activeVersion: 2,
      activeStatus: 'PUBLISHED',
      purchasePriceVnd: 0,
      purchasePriceVnd: 0,
      billingModel: 'LIFETIME',
      assetLimit: 5,
      storageLimitBytes: 104857600,
      fileLimitBytes: 10485760,
      totalVersions: 2,
      hasDraft: false,
    },
    {
      planCode: 'STANDARD',
      nameVi: 'Tiêu chuẩn',
      nameEn: 'Standard',
      activeVersion: 2,
      activeStatus: 'PUBLISHED',
      purchasePriceVnd: 499000,
      purchasePriceVnd: 199000,
      billingModel: 'LIFETIME',
      assetLimit: 50,
      storageLimitBytes: 1073741824,
      fileLimitBytes: 10485760,
      totalVersions: 2,
      hasDraft: true,
      draftVersion: 3,
    },
  ];

  globalThis.fetch = async () => ({
    ok: true,
    headers: { get: () => 'application/json' },
    json: async () => mockPlans,
  });

  try {
    const view = await mount(Page, { lang: 'vi' });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
      assert.ok(view.host.textContent.includes('BASIC'));
      assert.ok(view.host.textContent.includes('STANDARD'));
      assert.ok(view.host.textContent.includes('v3 Bản nháp'));
      assert.ok(view.host.textContent.includes('v2 (Đang áp dụng)'));
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('AdminSubscriptionPage triggers onUnauthorized on 401 response', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => ({
    ok: false,
    status: 401,
    headers: { get: () => 'application/json' },
    json: async () => ({ code: 'UNAUTHENTICATED' }),
  });

  let unauthorizedCalled = false;
  try {
    const view = await mount(Page, {
      onUnauthorized: () => { unauthorizedCalled = true; },
    });
    try {
      await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
      assert.equal(unauthorizedCalled, true);
    } finally {
      await view.close();
    }
  } finally {
    globalThis.fetch = previousFetch;
  }
});