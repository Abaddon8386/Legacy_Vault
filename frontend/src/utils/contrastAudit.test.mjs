import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseColor,
  relativeLuminance,
  compositeOver,
  contrastRatio,
  evaluateContrast,
} from './auditContrast.mjs';

test('auditContrast: relative luminance and parsing conforms to WCAG 2.1 specs', () => {
  // Pure black is 0, pure white is 1
  assert.equal(relativeLuminance('#000000'), 0);
  assert.equal(relativeLuminance('#ffffff'), 1);

  // sRGB components
  const parsed = parseColor('#164639');
  assert.deepEqual(parsed, { r: 22, g: 70, b: 57, a: 1 });

  // Compositing with opacity
  const comp = compositeOver('rgba(0, 0, 0, 0.5)', '#ffffff');
  assert.deepEqual(comp, { r: 128, g: 128, b: 128, a: 1 });
});

test('auditContrast: core design tokens meet WCAG AA requirements (>= 4.5:1)', () => {
  const backgrounds = [
    { name: 'Warm Cream Canvas (#f7f5f0)', hex: '#f7f5f0' },
    { name: 'White Surface (#ffffff)', hex: '#ffffff' },
  ];

  const textTokens = [
    { name: 'Primary Ink (--lv-text-ink)', hex: '#1f2421' },
    { name: 'Forest Heading (--lv-text-heading)', hex: '#164639' },
    { name: 'Body Text (--lv-text-body)', hex: '#2b302c' },
    { name: 'Accessible Muted Text (--lv-text-muted)', hex: '#4d5d54' },
    { name: 'Accessible Light/Hint Text (--lv-text-light)', hex: '#526359' },
    { name: 'Accessible Dark Gold Accent Text/Icon', hex: '#8c6820' },
  ];

  for (const bg of backgrounds) {
    for (const fg of textTokens) {
      const evaluation = evaluateContrast(fg.hex, bg.hex);
      assert.ok(
        evaluation.passes,
        `Expected ${fg.name} (${fg.hex}) on ${bg.name} to have contrast >= 4.5:1, got ${evaluation.ratio}:1`
      );
      assert.ok(
        evaluation.ratio >= 4.5,
        `Expected ratio >= 4.5, got ${evaluation.ratio}`
      );
    }
  }
});

test('auditContrast: Sand Gold #c5a059 is restricted to decorative/borders or dark surfaces', () => {
  // #c5a059 on cream fails AA for normal text
  const lightEvaluation = evaluateContrast('#c5a059', '#f7f5f0');
  assert.equal(lightEvaluation.passes, false, 'Gold on cream canvas must fail AA if used as normal text');

  // #c5a059 on dark banner #183e33 passes AA
  const darkBannerEvaluation = evaluateContrast('#c5a059', '#183e33');
  assert.equal(darkBannerEvaluation.passes, true, 'Gold on dark banner #183e33 passes AA');
  assert.ok(darkBannerEvaluation.ratio >= 4.5);
});

test('auditContrast: Legal workspace banner elements meet WCAG AA on dark surface #183e33', () => {
  const bannerBg = '#183e33';
  const bannerElements = [
    { name: 'Banner Title (white)', hex: '#ffffff', minRatio: 4.5 },
    { name: 'Banner Subtitle / Label (#d5e6dd)', hex: '#d5e6dd', minRatio: 4.5 },
    { name: 'Banner Read-only Pill (#e2c887)', hex: '#e2c887', minRatio: 4.5 },
  ];

  for (const elem of bannerElements) {
    const res = evaluateContrast(elem.hex, bannerBg);
    assert.ok(
      res.passes,
      `Expected ${elem.name} (${elem.hex}) on ${bannerBg} to pass AA, got ${res.ratio}:1`
    );
  }
});

test('auditContrast: Status badge text colors meet WCAG AA on their respective tints', () => {
  const statusPairs = [
    { name: 'Success / Approved', fg: '#0f5f35', bg: '#dcf3e4' },
    { name: 'Warning / Awaiting', fg: '#76541b', bg: '#fff8e8' },
    { name: 'Error / Danger', fg: '#a12525', bg: '#fff1f0' },
    { name: 'Info / Notice', fg: '#35566a', bg: '#eff5f8' },
    { name: 'Neutral Closed', fg: '#45564d', bg: '#f2f2ed' },
  ];

  for (const pair of statusPairs) {
    const res = evaluateContrast(pair.fg, pair.bg);
    assert.ok(
      res.passes,
      `Expected ${pair.name} status text (${pair.fg} on ${pair.bg}) to pass AA (>= 4.5:1), got ${res.ratio}:1`
    );
  }
});
