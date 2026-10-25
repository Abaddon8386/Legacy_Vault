import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';

const dom = new JSDOM('<html><body></body></html>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

async function loadComponent(name) {
  const result = await build({
    root: resolve(import.meta.dirname, '../..'), configFile: false,
    plugins: [react()], logLevel: 'silent',
    build: {
      write: false, minify: false,
      lib: { entry: resolve(import.meta.dirname, '../components/common', `${name}.jsx`), formats: ['es'] },
      rollupOptions: { external: ['react', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(item => item.type === 'chunk' && item.isEntry).code;
  for (const dependency of ['react', 'react/jsx-runtime']) {
    code = code.replaceAll(`from "${dependency}"`, `from "${import.meta.resolve(dependency)}"`);
  }
  const module = await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
  return module.default || module[name];
}

const Button = await loadComponent('Button');
const ErrorState = await loadComponent('ErrorState');
const FeedbackNotice = await loadComponent('FeedbackNotice');
const LoadingState = await loadComponent('LoadingState');

async function withView(element, check) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  try {
    await act(async () => root.render(element));
    await check(host);
  } finally {
    await act(async () => root.unmount());
    host.remove();
  }
}

test('busy Button preserves its accessible name and blocks repeat submissions', async () => {
  let calls = 0;
  await withView(React.createElement(Button, { isLoading: true, onClick: () => calls++ }, 'Lưu thay đổi'), async host => {
    const button = host.querySelector('button');
    assert.equal(button.type, 'button');
    assert.equal(button.disabled, true);
    assert.equal(button.getAttribute('aria-busy'), 'true');
    assert.equal(button.textContent, 'Lưu thay đổi');
    await act(async () => button.click());
    assert.equal(calls, 0);
  });
});

test('ErrorState does not offer an action without a handler', async () => {
  await withView(React.createElement(ErrorState, { error: { status: 500 } }), host => {
    assert.ok(host.querySelector('[role="alert"]'));
    assert.equal(host.querySelectorAll('button').length, 0);
  });
});

test('ErrorState fallback names the available retry rather than an unavailable create action', async () => {
  let calls = 0;
  await withView(React.createElement(ErrorState, { error: { status: 404 }, lang: 'en', onRetry: () => calls++ }), async host => {
    const button = host.querySelector('button');
    assert.equal(button.textContent, 'Retry');
    await act(async () => button.click());
    assert.equal(calls, 1);
  });
});

test('ErrorState keeps sign-in and retry actions separate when both are supplied', async () => {
  const calls = [];
  await withView(React.createElement(ErrorState, {
    error: { status: 401 }, lang: 'en',
    onNavigateToLogin: () => calls.push('login'), onRetry: () => calls.push('retry'),
  }), async host => {
    const buttons = host.querySelectorAll('button');
    assert.equal(buttons[0].textContent, 'Sign in again');
    assert.equal(buttons[1].textContent, 'Retry');
    await act(async () => { buttons[0].click(); buttons[1].click(); });
    assert.deepEqual(calls, ['login', 'retry']);
  });
});

test('FeedbackNotice announces errors as alerts, other feedback politely, with unique labels', async () => {
  await withView(React.createElement(React.Fragment, null,
    ...['error', 'warning', 'success', 'info'].map(tone => React.createElement(FeedbackNotice, { key: tone, tone, title: tone }, 'Details')),
  ), host => {
    const notices = [...host.querySelectorAll('.lv-feedback')];
    assert.deepEqual(notices.map(e => e.getAttribute('role')), ['alert', 'status', 'status', 'status']);
    const labels = notices.map(e => e.getAttribute('aria-labelledby'));
    assert.equal(new Set(labels).size, 4);
    labels.forEach(id => assert.ok(document.getElementById(id)));
  });
});

test('LoadingState can describe the current task without vault-specific text', async () => {
  await withView(React.createElement(LoadingState, { message: 'Loading documents…', compact: true, lang: 'en' }), host => {
    assert.equal(host.querySelector('[role="status"]').textContent, 'Loading documents…');
    assert.equal(host.querySelector('.lv-loading-spinner-wrap').getAttribute('aria-hidden'), 'true');
  });
});
