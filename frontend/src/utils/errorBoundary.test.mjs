import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost:5195/vault' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react/jsx-runtime'] } },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find((i) => i.type === 'chunk' && i.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const ErrorBoundary = await component('src/components/common/ErrorBoundary.jsx');
const h = React.createElement;
let broken = true;
const Child = () => {
  if (broken) throw new Error('secret stack detail');
  return h('p', null, 'ok-content');
};

async function mount(props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  const render = (p) => act(async () => root.render(h(ErrorBoundary, p, h(Child))));
  await render(props);
  return { host, render, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}

test('error boundary shows localized fallback without raw error, retry restores content', async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    broken = true;
    const m = await mount({ lang: 'vi', resetKey: 'a' });
    assert.match(m.host.textContent, /Trang này gặp sự cố/);
    assert.doesNotMatch(m.host.textContent, /secret stack detail/);
    assert.ok([...m.host.querySelectorAll('button')].some((b) => b.textContent === 'Về trang chính'));
    broken = false;
    const retry = [...m.host.querySelectorAll('button')].find((b) => b.textContent === 'Thử lại');
    await act(async () => retry.click());
    assert.match(m.host.textContent, /ok-content/);
    await m.close();

    broken = true;
    const en = await mount({ lang: 'en', resetKey: 'a' });
    assert.match(en.host.textContent, /Try again/);
    await en.close();
  } finally { console.error = origError; }
});

test('error boundary resets when resetKey changes', async () => {
  const origError = console.error;
  console.error = () => {};
  try {
    broken = true;
    const m = await mount({ lang: 'en', resetKey: 'a' });
    assert.match(m.host.textContent, /Something went wrong/);
    broken = false;
    await m.render({ lang: 'en', resetKey: 'b' });
    assert.match(m.host.textContent, /ok-content/);
    await m.close();
  } finally { console.error = origError; }
});
