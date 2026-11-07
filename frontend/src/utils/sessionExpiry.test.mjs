import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { SESSION_WARNING_MS, sessionExpiryState } from './sessionExpiry.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/staff/cases' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
async function loadComponentModule(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'true', 'import.meta.env.PROD': 'false' },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find((item) => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}
const { SessionExpiryBanner } = await loadComponentModule('src/components/common/SessionExpiryNotice.jsx');

const now = 1_000_000_000_000;
const minute = 60 * 1000;

async function render(props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(SessionExpiryBanner, props)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('no warning while the session still has more than five minutes', () => {
  assert.equal(sessionExpiryState(now + SESSION_WARNING_MS + 1, now), null);
  assert.equal(sessionExpiryState(now + 40 * minute, now), null);
});

test('warns in the last five minutes and counts minutes rounded up', () => {
  assert.deepEqual(sessionExpiryState(now + SESSION_WARNING_MS, now), { minutes: 5, lastMinute: false });
  assert.deepEqual(sessionExpiryState(now + 3 * minute + 10, now), { minutes: 4, lastMinute: false });
  assert.deepEqual(sessionExpiryState(now + 61 * 1000, now), { minutes: 2, lastMinute: false });
});

test('the last minute is flagged and an expired or missing session shows nothing', () => {
  assert.deepEqual(sessionExpiryState(now + 30 * 1000, now), { minutes: 1, lastMinute: true });
  assert.equal(sessionExpiryState(now, now), null);
  assert.equal(sessionExpiryState(now - 1, now), null);
  assert.equal(sessionExpiryState(undefined, now), null);
  assert.equal(sessionExpiryState(Number.NaN, now), null);
});

test('banner renders nothing without a warning', async () => {
  const view = await render({ state: null });
  assert.equal(view.host.innerHTML, '');
  await view.close();
});

test('banner says how long is left and offers sign in and dismiss, in Vietnamese and English', async () => {
  const state = { minutes: 3, lastMinute: false };
  let signIn = 0;
  let dismiss = 0;
  const vi = await render({ state, lang: 'vi', onSignIn: () => { signIn += 1; }, onDismiss: () => { dismiss += 1; } });
  assert.match(vi.host.textContent, /Phiên đăng nhập sắp hết hạn/);
  assert.match(vi.host.textContent, /khoảng 3 phút/);
  assert.equal(vi.host.querySelector('aside').getAttribute('role'), 'status');
  const buttons = [...vi.host.querySelectorAll('button')];
  assert.deepEqual(buttons.map((button) => button.textContent), ['Đăng nhập lại', 'Để sau']);
  await act(async () => buttons[0].click());
  await act(async () => buttons[1].click());
  assert.equal(signIn, 1);
  assert.equal(dismiss, 1);
  await vi.close();
  const en = await render({ state, lang: 'en' });
  assert.match(en.host.textContent, /about 3 minutes/);
  assert.deepEqual([...en.host.querySelectorAll('button')].map((button) => button.textContent), ['Sign in again', 'Later']);
  await en.close();
});

test('in the last minute the banner is an alert and cannot be dismissed', async () => {
  const view = await render({ state: { minutes: 1, lastMinute: true }, lang: 'vi' });
  assert.equal(view.host.querySelector('aside').getAttribute('role'), 'alert');
  assert.match(view.host.textContent, /chưa đến 1 phút/);
  assert.deepEqual([...view.host.querySelectorAll('button')].map((button) => button.textContent), ['Đăng nhập lại']);
  await view.close();
});
