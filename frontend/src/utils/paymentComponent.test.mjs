import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5173/subscription' });
globalThis.window = dom.window; globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement; globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const bundle = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
  build: { write: false, minify: false, lib: { entry: 'src/pages/subscription/PaymentCheckout.jsx', formats: ['es'] },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(bundle) ? bundle[0] : bundle).output.find(x => x.type === 'chunk' && x.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
const Page = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const plan = { code: 'STANDARD', version: 4, priceVnd: 499000, billingModel: 'LIFETIME' };
async function mount(onPaid = () => {}) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => { root.render(React.createElement(Page, { accessToken: 'fixture', lang: 'vi', currentPlan: 'BASIC', onPaid })); });
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
const response = data => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data });
test('unconfigured gateway shows actionable message without creating a payment', async () => {
  const previous = globalThis.fetch; let creates = 0;
  globalThis.fetch = async path => {
    if (path.endsWith('subscription-plans')) return response([plan]);
    if (path.endsWith('payments')) creates++;
    return response({ planCode: 'STANDARD', catalogVersion: 4, amountVnd: 499000, currency: 'VND', billingModel: 'LIFETIME', previousPurchaseCreditVnd: 0, paymentAvailable: false });
  };
  const view = await mount();
  try {
    await act(async () => view.host.querySelector('button').click());
    assert.match(view.host.textContent, /chưa được cấu hình/); assert.equal(creates, 0);
    assert.equal(view.host.querySelector('[role="group"]'), null);
  } finally { await view.close(); globalThis.fetch = previous; }
});
test('quote requires explicit purchase confirmation and displays full target price', async () => {
  const previous = globalThis.fetch; let creates = 0;
  globalThis.fetch = async path => {
    if (path.endsWith('subscription-plans')) return response([plan]);
    if (path.endsWith('payments')) creates++;
    return response({ planCode: 'STANDARD', catalogVersion: 4, amountVnd: 499000, currency: 'VND', billingModel: 'LIFETIME', previousPurchaseCreditVnd: 0, paymentAvailable: true });
  };
  const view = await mount();
  try {
    await act(async () => view.host.querySelector('button').click());
    assert.match(view.host.querySelector('[role="group"]').textContent, /499.000 VND/);
    assert.match(view.host.textContent, /Tiếp tục đến VNPay/); assert.equal(creates, 0);
  } finally { await view.close(); globalThis.fetch = previous; }
});
test('return success flag alone never activates a plan', async () => {
  const previous = globalThis.fetch; let paid = 0;
  window.history.replaceState({}, '', '/subscription?vnp_TxnRef=12345678-1234-1234-1234-123456789abc&vnp_ResponseCode=00');
  globalThis.fetch = async path => response(path.endsWith('subscription-plans') ? [plan]
    : { paymentId: '12345678-1234-1234-1234-123456789abc', status: 'PENDING' });
  const view = await mount(() => paid++);
  try { assert.match(view.host.textContent, /Đang chờ VNPay/); assert.equal(paid, 0); }
  finally { await view.close(); globalThis.fetch = previous; window.history.replaceState({}, '', '/subscription'); }
});
test('verified backend success refreshes once and clears callback query', async () => {
  const previous = globalThis.fetch; let paid = 0;
  window.history.replaceState({}, '', '/subscription?vnp_TxnRef=12345678123412341234123456789abc&vnp_ResponseCode=00');
  globalThis.fetch = async path => response(path.endsWith('subscription-plans') ? [plan]
    : { paymentId: '12345678-1234-1234-1234-123456789abc', status: 'SUCCEEDED' });
  const view = await mount(() => paid++);
  try { assert.equal(paid, 1); assert.equal(window.location.search, ''); }
  finally { await view.close(); globalThis.fetch = previous; }
});
test('double click is serialized and network retry keeps the same idempotency key', async () => {
  const previous = globalThis.fetch; const bodies = [];
  globalThis.fetch = async (path, init) => {
    if (path.endsWith('subscription-plans')) return response([plan]);
    if (path.endsWith('payments')) { bodies.push(init.body); throw new Error('fixture network failure'); }
    return response({ planCode: 'STANDARD', catalogVersion: 4, amountVnd: 499000, currency: 'VND', billingModel: 'LIFETIME', previousPurchaseCreditVnd: 0, paymentAvailable: true });
  };
  const view = await mount();
  try {
    await act(async () => view.host.querySelector('button').click());
    const button = view.host.querySelector('[role="group"] button');
    await act(async () => { button.click(); button.click(); });
    assert.equal(bodies.length, 1);
    await act(async () => button.click());
    assert.equal(bodies.length, 2); assert.equal(bodies[0], bodies[1]);
    assert.ok(JSON.parse(bodies[0]).idempotencyKey);
  } finally { await view.close(); globalThis.fetch = previous; }
});
