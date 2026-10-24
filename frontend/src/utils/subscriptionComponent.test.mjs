import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/subscription?preview=true&scenario=active_basic' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function component(production = false, entry = 'src/pages/subscription/SubscriptionPage.jsx') {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': String(!production), 'import.meta.env.PROD': String(production) },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
const Page = await component();
const liveSubscription = { planCode: 'BASIC', status: 'ACTIVE', expiresAt: null,
  assetsUsed: 3, maxAssets: 5, storageUsedBytes: 0, maxStorageBytes: 104857600,
  vaultsCreatedLifetime: 1, maxVaultsLifetime: 1 };
const liveCatalog = [{code:'STANDARD',version:7,priceVnd:499000,billingModel:'LIFETIME'},
  {code:'EXTENDED',version:7,priceVnd:999000,billingModel:'LIFETIME'}];
const reply = data => ({ ok:true,status:200,headers:{get:()=> 'application/json'},json:async()=>data });
async function waitData() { await act(async () => { await new Promise(resolve => setTimeout(resolve, 340)); }); }
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('Subscription component displays scenario quotas and hides local-only plan picker', async () => {
  const view = await mount(Page, { isDevPreview: true });
  try {
    await waitData();
    assert.ok(view.host.textContent.includes('3 / 5'));
    assert.ok(view.host.textContent.includes('100 MB'));
    assert.equal(view.host.querySelector('#demo-plan-select'), null);
  } finally { await view.close(); }
});
test('Demo controls never render for live or production even with preview prop', async () => {
  const live = await mount(Page, { isDevPreview: true, accessToken: 'synthetic' });
  try { assert.equal(Boolean(live.host.querySelector('#demo-plan-select')), false); } finally { await live.close(); }
  const Production = await component(true);
  const prod = await mount(Production, { isDevPreview: true });
  try { assert.equal(Boolean(prod.host.querySelector('#demo-plan-select')), false); } finally { await prod.close(); }
});

test('Live policy-pending component hides proposed plans and quotas in both locales', async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 409, headers: { get: () => 'application/json' },
    json: async () => ({ code: 'SUBSCRIPTION_POLICY_PENDING' }) });
  try {
    for (const lang of ['vi', 'en']) {
      const view = await mount(Page, { accessToken: 'synthetic', lang });
      try {
        await act(async () => { await new Promise(resolve => setTimeout(resolve, 10)); });
        assert.match(view.host.textContent, lang === 'en' ? /Subscription policy pending/ : /Chính sách gói đang được thống nhất/);
        assert.equal(view.host.querySelector('.lv-sub-current-card'), null);
        assert.equal(view.host.querySelector('.lv-sub-plan-price'), null);
        assert.ok(!view.host.textContent.includes('SUBSCRIPTION_POLICY_PENDING'));
      } finally { await view.close(); }
    }
  } finally { globalThis.fetch = previous; }
});

test('Owner chooses the exact plan from its card, confirms in a dialog, and cancellation never creates payment', async () => {
  const previous = globalThis.fetch;
  let quoteBody; let creates = 0;
  globalThis.fetch = async (path, init) => {
    if (path.endsWith('/subscriptions/me')) return reply(liveSubscription);
    if (path.endsWith('/subscription-plans')) return reply(liveCatalog);
    if (path.endsWith('/payments')) { creates++; throw new Error('Unexpected payment creation'); }
    quoteBody = JSON.parse(init.body);
    return reply({planCode:quoteBody.planCode,catalogVersion:7,amountVnd:999000,currency:'VND',billingModel:'LIFETIME',previousPurchaseCreditVnd:0,paymentAvailable:true});
  };
  const view = await mount(Page, {accessToken:'fixture'});
  try {
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    const cards = [...view.host.querySelectorAll('.lv-plan-card')];
    assert.equal(cards[0].querySelector('button'),null);
    assert.equal(view.host.querySelector('.lv-payment-checkout'),null);
    const extended = cards.find(card=>card.textContent.includes('Mở rộng'));
    await act(async()=>extended.querySelector('button').click());
    assert.deepEqual(quoteBody,{planCode:'EXTENDED',catalogVersion:7});
    const dialog = view.host.querySelector('[role="dialog"]');
    assert.ok(dialog);
    assert.match(dialog.textContent,/Mở rộng:.*999.000 VND/);
    assert.equal(creates,0);
    await act(async()=>dialog.querySelector('[aria-label="Đóng"]').click());
    assert.equal(view.host.querySelector('[role="dialog"]'),null);
    assert.equal(creates,0);
  } finally { await view.close(); globalThis.fetch=previous; }
});

test('Catalog failure disables card purchases and offers retry instead of assuming local prices', async () => {
  const previous = globalThis.fetch; let catalogCalls=0;
  globalThis.fetch=async path=>{
    if(path.endsWith('/subscriptions/me')) return reply(liveSubscription);
    if(++catalogCalls===1) throw new Error('Offline');
    return reply(liveCatalog);
  };
  const view=await mount(Page,{accessToken:'fixture',lang:'en'});
  try {
    await act(async()=>{await new Promise(resolve=>setTimeout(resolve,20));});
    assert.ok([...view.host.querySelectorAll('.lv-plan-select-btn')].every(button=>button.disabled));
    assert.match(view.host.querySelector('[role="alert"]').textContent,/Unable to load current prices/);
    await act(async()=>view.host.querySelector('[role="alert"] button').click());
    assert.ok([...view.host.querySelectorAll('.lv-plan-select-btn')].every(button=>!button.disabled));
    assert.equal(catalogCalls,2);
  } finally { await view.close(); globalThis.fetch=previous; }
});
