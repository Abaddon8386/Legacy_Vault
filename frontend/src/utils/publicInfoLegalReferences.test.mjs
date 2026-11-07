import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/about?lang=vi' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function component(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: { 'import.meta.env.DEV': 'false', 'import.meta.env.PROD': 'true' },
    build: { write: false, minify: false, lib: { entry, formats: ['es'] }, rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] } },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) code = code.replaceAll(`from "${name}"`, `from "${import.meta.resolve(name)}"`);
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const PublicInfoPage = await component('src/pages/landing/PublicInfoPage.jsx');
const { publicInfoContent } = await import('../pages/landing/publicInfoContent.js');
const OFFICIAL_HOSTS = ['congbao.chinhphu.vn', 'vanban.chinhphu.vn'];

for (const lang of ['vi', 'en']) test(`About ${lang}: the legal section lists the verified legal references with official links`, async () => {
  const section = publicInfoContent[lang].about.sections.find(item => item.id === 'legal');
  assert.equal(section.references.items.length, 7);
  for (const item of section.references.items) {
    const url = new URL(item.href);
    assert.equal(url.protocol, 'https:');
    assert.ok(OFFICIAL_HOSTS.includes(url.hostname), `${url.hostname} is an official government portal`);
    assert.ok(item.name && item.note);
  }
  assert.match(section.references.note, /07\/11\/2026|7 November 2026/, 'the check date is stated');
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(React.createElement(PublicInfoPage, { page: 'about', lang })));
  try {
    const links = [...host.querySelectorAll('.lv-public-info__refs a')];
    assert.equal(links.length, 7);
    for (const link of links) {
      assert.equal(link.getAttribute('target'), '_blank');
      assert.match(link.getAttribute('rel'), /noopener/);
    }
    assert.ok(host.querySelector('#legal .lv-public-info__refs h3'), 'references sit inside the #legal section');
    for (const item of section.references.items) assert.ok(host.textContent.includes(item.note), `${item.name} note is shown`);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
});
