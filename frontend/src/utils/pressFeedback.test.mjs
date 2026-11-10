import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { installPressFeedback } from './pressFeedback.js';

function setup(reduce = false) {
  const dom = new JSDOM('<div class="lv-staff-surfaces"><button id="a">Go</button><button id="b" disabled>No</button><div role="tab" id="t">Tab</div><div class="lv-staff-card" id="c">Card</div></div><button id="out">Out</button>');
  const win = dom.window;
  win.matchMedia = () => ({ matches: reduce });
  const off = installPressFeedback(win.document, win);
  const el = (id) => win.document.getElementById(id);
  const press = (id) => el(id).dispatchEvent(new win.PointerEvent('pointerdown', { bubbles: true, button: 0, clientX: 120, clientY: 45 }));
  return { win, off, press, el, rings: () => win.document.body.querySelectorAll(':scope > .lv-click-ring') };
}

test('a click puts a ring on the page centred on the pointer, outside the control, and removes it afterwards', () => {
  const s = setup();
  s.press('a');
  assert.equal(s.rings().length, 1);
  const ring = s.rings()[0];
  assert.equal(ring.style.left, '120px');
  assert.equal(ring.style.top, '45px');
  assert.equal(s.el('a').querySelector('.lv-click-ring'), null);
  const fill = s.el('a').querySelector(':scope > .lv-ripple');
  assert.ok(fill, 'the fill inside the control starts too');
  assert.equal(s.el('a').classList.contains('lv-rippling'), true);
  ring.dispatchEvent(new s.win.Event('animationend'));
  fill.dispatchEvent(new s.win.Event('animationend'));
  assert.equal(s.rings().length, 0);
  assert.equal(s.el('a').querySelector('.lv-ripple'), null);
  assert.equal(s.el('a').classList.contains('lv-rippling'), false);
  s.off();
});

test('tabs ring and dip, cards only dip, and disabled, outside or reduced-motion clicks do nothing', () => {
  const s = setup();
  s.press('t');
  assert.equal(s.rings().length, 1);
  assert.equal(s.el('t').classList.contains('lv-press'), true);
  s.press('c');
  assert.equal(s.rings().length, 1);
  assert.equal(s.el('c').classList.contains('lv-press'), true);
  s.press('b'); s.press('out');
  assert.equal(s.rings().length, 1);
  s.off();
  const r = setup(true);
  r.press('a');
  assert.equal(r.rings().length, 0);
});
