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
