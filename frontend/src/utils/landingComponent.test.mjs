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
async function component(production = false, entry = 'src/pages/landing/LandingPage.jsx') {
  const result = await build({ configFile: false, plugins: [react()], logLevel: 'silent',
    define: { 'import.meta.env.DEV': String(!production), 'import.meta.env.PROD': String(production) },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] } } });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}
async function mount(Component, props) {
  const host = document.createElement('div'); document.body.append(host); const root = createRoot(host);
  await act(async () => root.render(React.createElement(Component, props)));
  return { host, close: async () => { await act(async () => root.unmount()); host.remove(); } };
}
test('Landing renders six 3D faces, supports pause and language, and navigates through callbacks', async () => {
  const Landing = await component(false, 'src/pages/landing/LandingPage.jsx');
  let login = 0; let register = 0;
  const view = await mount(Landing, { onLogin: () => login++, onRegister: () => register++ });
  try {
    assert.equal(view.host.querySelectorAll('.lv-landing-face').length, 6);
    assert.match(view.host.querySelector('#plans').textContent, /Các gói đề xuất để tham khảo/);
    await act(async () => view.host.querySelector('.lv-landing-login').click());
    await act(async () => view.host.querySelector('.lv-landing-primary').click());
    assert.equal(login, 1); assert.equal(register, 1);
    const pause = view.host.querySelector('.lv-landing-art-footer button');
    await act(async () => pause.click());
    assert.ok(view.host.querySelector('.lv-landing-float.is-paused'));
    await act(async () => pause.click());
    assert.equal(view.host.querySelector('.lv-landing-float.is-paused'), null);
    await act(async () => view.host.querySelector('.lv-landing-language').click());
    assert.match(view.host.querySelector('h1').textContent, /A lifetime of stories/);
    assert.match(view.host.querySelector('#plans').textContent, /Proposed plans for reference/);
  } finally { await view.close(); }
});
