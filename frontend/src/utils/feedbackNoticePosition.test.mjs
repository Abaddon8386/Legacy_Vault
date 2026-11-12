import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const css = readFileSync(new URL('../components/common/FeedbackNotice.css', import.meta.url), 'utf8');
const rule = css.match(/\.lv-feedback--floating\s*\{([^}]*)\}/)[1];

test('the floating notice sits top right below the shell header, never over the sidebar', () => {
  assert.match(rule, /position:\s*fixed/);
  assert.match(rule, /inset-inline-end:\s*16px/);
  assert.doesNotMatch(rule, /inset-inline-start/);
  const top = Number(rule.match(/inset-block-start:\s*(\d+)px/)[1]);
  assert.ok(top >= 72, 'starts below the 72px shell header');
});

test('on narrow screens the floating notice moves to the bottom edge', () => {
  const narrow = css.match(/@media \(max-width: 640px\)\s*\{\s*\.lv-feedback--floating\s*\{([^}]*)\}/);
  assert.ok(narrow);
  assert.match(narrow[1], /inset-block:\s*auto 16px/);
});
