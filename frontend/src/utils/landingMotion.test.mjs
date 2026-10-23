import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { observeLandingReveals } from '../pages/landing/landingMotion.js';

function fixture({ reduced = false, supported = true } = {}) {
  const dom = new JSDOM('<main><h2 data-reveal="up">Features</h2><article data-reveal="up"><button>Continue</button></article></main>');
  const root = dom.window.document.querySelector('main');
  let notifyPreference;
  const preference = {
    matches: reduced,
    addEventListener: (_, callback) => { notifyPreference = callback; },
    removeEventListener: () => { notifyPreference = undefined; },
  };
  dom.window.matchMedia = () => preference;
  let observer;
  if (supported) dom.window.IntersectionObserver = class {
    constructor(callback) { observer = this; this.callback = callback; this.pending = new Set(); }
    observe(element) { this.pending.add(element); }
    unobserve(element) { this.pending.delete(element); }
    disconnect() { this.pending.clear(); }
  };
  return { dom, root, elements: [...root.children], observer: () => observer,
    changePreference: matches => notifyPreference?.({ matches }) };
}

test('Below-fold content reveals on entry, once, without concealing it when scrolling back', () => {
  const view = fixture();
  const stop = observeLandingReveals(view.root);
  const [heading, card] = view.elements;
  assert.equal(card.dataset.revealed, 'false');
  view.observer().callback([{ target: heading, isIntersecting: false }]);
  assert.equal(heading.dataset.revealed, 'false');
  view.observer().callback([{ target: heading, isIntersecting: true }]);
  assert.equal(heading.dataset.revealed, 'true');
  assert.equal(view.observer().pending.has(heading), false);
  assert.equal(card.dataset.revealed, 'false');
  view.observer().callback([{ target: heading, isIntersecting: false }]);
  assert.equal(heading.dataset.revealed, 'true');
  stop(); view.dom.window.close();
});

test('Keyboard focus exposes its card immediately; cleanup leaves no pending hidden content', () => {
  const view = fixture();
  const stop = observeLandingReveals(view.root);
  const card = view.elements[1];
  card.querySelector('button').focus();
  assert.equal(card.dataset.revealed, 'true');
  stop();
  assert.equal(view.observer().pending.size, 0);
  assert.equal(view.root.querySelector('.is-reveal-ready'), null);
  view.dom.window.close();
});

test('Reduced motion and unavailable observation both keep all content readable', () => {
  for (const options of [{ reduced: true }, { supported: false }]) {
    const view = fixture(options);
    const stop = observeLandingReveals(view.root);
    assert.ok(view.elements.every(element => element.dataset.revealed === 'true'));
    assert.equal(view.root.querySelector('.is-reveal-ready'), null);
    stop(); view.dom.window.close();
  }
});

test('Turning on reduced motion while browsing reveals all remaining sections', () => {
  const view = fixture();
  const stop = observeLandingReveals(view.root);
  view.changePreference(true);
  assert.ok(view.elements.every(element => element.dataset.revealed === 'true'));
  assert.equal(view.observer().pending.size, 0);
  stop(); view.dom.window.close();
});

test('Restored scroll positions never conceal sections already above the viewport', () => {
  const view = fixture();
  view.elements[0].getBoundingClientRect = () => ({ top: -400, bottom: -100 });
  const stop = observeLandingReveals(view.root);
  assert.equal(view.elements[0].dataset.revealed, 'true');
  assert.equal(view.observer().pending.has(view.elements[0]), false);
  stop(); view.dom.window.close();
});
