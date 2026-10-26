import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/register' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const { createRoot } = await import('react-dom/client');
const built = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
  build: { write: false, minify: false, lib: { entry: 'src/pages/auth/RegisterPageHenedo.jsx', formats: ['es'] },
    rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
let code = (Array.isArray(built) ? built[0] : built).output.find(x => x.type === 'chunk' && x.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
const Page = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
const validReceipt = { id: '11111111-1111-4111-8111-111111111111', fullName: 'Synthetic Person',
  email: 'synthetic@example.test', roles: ['ROLE_VAULT_OWNER'], status: 'ACTIVE', createdAt: '2026-10-16T00:00:00Z' };
async function mount(props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Page, props)));
  // Exercise actual controlled React inputs, not a replacement form.
  for (const [id, value] of Object.entries({ fullName: 'Synthetic Person', email: 'synthetic@example.test',
    password: 'SyntheticPass123', confirmPassword: 'SyntheticPass123' })) {
    await act(async () => {
      const input = host.querySelector('#hn-' + id);
      Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set.call(input, value);
      input._valueTracker?.setValue('');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
    });
  }
  await act(async () => host.querySelector('#hn-agreeTerms').click());
  return { host, submit: () => act(async () => host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }))),
    close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('Registration component waits for valid 201 receipt, then navigates to login exactly once', async () => {
  const original = globalThis.fetch; let resolve, count = 0;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  const view = await mount({ onNavigateToLogin: () => count++ });
  try {
    await view.submit();
    assert.equal(count, 0);
    assert.equal(view.host.querySelector('button[type=submit]').disabled, true);
    await act(async () => resolve(new Response(JSON.stringify(validReceipt), { status: 201, headers: { 'Content-Type': 'application/json' } })));
    assert.equal(count, 1);
  } finally { await view.close(); globalThis.fetch = original; }
});
for (const invalid of [false, true]) test('Registration component stays on form for ' + (invalid ? 'invalid success receipt' : 'API error'), async () => {
  const original = globalThis.fetch; let count = 0;
  globalThis.fetch = async () => new Response(JSON.stringify(invalid ? {} : { code: 'EMAIL_ALREADY_EXISTS' }),
    { status: invalid ? 201 : 409, headers: { 'Content-Type': 'application/json' } });
  const view = await mount({ onNavigateToLogin: () => count++ });
  try {
    await view.submit();
    assert.equal(count, 0);
    assert.equal(view.host.querySelector('#hn-email').value, 'synthetic@example.test');
    assert.ok(view.host.querySelector('.henedo-status-box.failure'));
  } finally { await view.close(); globalThis.fetch = original; }
});
test('Registration component does not redirect after unmount while request is pending', async () => {
  const original = globalThis.fetch; let resolve, count = 0;
  globalThis.fetch = () => new Promise(r => { resolve = r; });
  const view = await mount({ onNavigateToLogin: () => count++ });
  try {
    await view.submit(); await view.close();
    await act(async () => resolve(new Response(JSON.stringify(validReceipt), { status: 201, headers: { 'Content-Type': 'application/json' } })));
    assert.equal(count, 0);
  } finally { globalThis.fetch = original; }
});
