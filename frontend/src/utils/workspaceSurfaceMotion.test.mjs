import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import { trackOwnerSurface } from '../components/layout/ownerSurfaceMotion.js';

const dom = new JSDOM('<body></body>', { url: 'http://localhost/' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
window.matchMedia = () => ({ matches: false });
const built = await build({ configFile: false, logLevel: 'silent', build: {
  write: false, minify: false,
  lib: { entry: 'src/components/layout/AppShell.jsx', formats: ['es'] },
  rollupOptions: { external: ['react', 'react/jsx-runtime'] },
} });
let code = (Array.isArray(built) ? built[0] : built).output.find(item => item.type === 'chunk' && item.isEntry).code;
for (const name of ['react', 'react/jsx-runtime']) code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
const AppShell = (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;

function cardAt(root, className = 'lv-surface-card') {
  const card = document.createElement('section');
  card.className = className;
  card.innerHTML = '<button>Open record</button>';
  card.getBoundingClientRect = () => ({ left: 100, top: 200 });
  root.append(card);
  return card;
}
function pointer(target, pointerType = 'mouse') {
  const event = new window.MouseEvent('pointermove', { bubbles: true, clientX: 143, clientY: 267 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  target.dispatchEvent(event);
}

// Exercise the real shell handler, including cards added after the initial render.
test('all workspace roles delegate pointer motion to their own asynchronously added cards', async () => {
  for (const [role, tabs, scope, marker] of [
    ['OWNER', ['vault', 'assets', 'dms', 'wills', 'beneficiaries', 'subscription', 'shared-with-me'], 'lv-owner-surfaces', 'lv-owner-card'],
    ['STAFF', ['cases', 'legal-documents'], 'lv-staff-surfaces', 'lv-staff-glow'],
    ['LEGAL', ['death-verification', 'will-document-verification', 'basis-route-selection', 'dossier-review', 'approval-review', 'controlled-unlock'], 'lv-legal-surfaces', 'lv-surface-card'],
    ['ADMIN', ['admin-home', 'admin-users', 'admin-subscriptions', 'admin-logs'], 'lv-admin-surfaces', 'lv-surface-card'],
  ]) {
    for (const currentTab of tabs) {
      const host = document.createElement('div'); document.body.append(host);
      const root = createRoot(host);
      try {
        await act(async () => root.render(React.createElement(AppShell, { role, currentTab, lang: 'en' })));
        const main = host.querySelector('#main-content');
        assert.ok(main.classList.contains(scope), role + ': ' + currentTab);
        const card = cardAt(main, marker);
        pointer(card.querySelector('button'));
        assert.equal(card.style.getPropertyValue('--surface-x'), '43px');
        assert.equal(card.style.getPropertyValue('--surface-y'), '67px');
        card.querySelector('button').focus();
        assert.equal(document.activeElement, card.querySelector('button'));
      } finally {
        await act(async () => root.unmount()); host.remove();
      }
    }
  }
});

test('touch and reduced-motion users do not trigger spotlight updates', () => {
  for (const scope of ['lv-owner-surfaces', 'lv-staff-surfaces', 'lv-legal-surfaces', 'lv-admin-surfaces']) {
    const root = document.createElement('main'); root.className = scope;
    const card = cardAt(root);
    const event = { currentTarget: root, target: card.querySelector('button'), pointerType: 'touch', clientX: 143, clientY: 267 };
    trackOwnerSurface(event);
    assert.equal(card.style.cssText, '');
    window.matchMedia = () => ({ matches: true });
    try {
      trackOwnerSurface({ ...event, pointerType: 'mouse' });
      assert.equal(card.style.cssText, '');
    } finally { window.matchMedia = () => ({ matches: false }); }
  }
});

test('unscoped roots, plain content and cards outside the current workspace remain untouched', () => {
  const root = document.createElement('main');
  const card = cardAt(root);
  const event = { currentTarget: root, target: card, pointerType: 'mouse', clientX: 143, clientY: 267 };
  trackOwnerSurface(event);
  assert.equal(card.style.cssText, '');
  root.className = 'lv-legal-surfaces';
  trackOwnerSurface({ ...event, target: root });
  const otherRoot = document.createElement('main');
  const outsideCard = cardAt(otherRoot);
  trackOwnerSurface({ ...event, target: outsideCard });
  assert.equal(outsideCard.style.cssText, '');
  assert.equal(card.style.cssText, '');
});
