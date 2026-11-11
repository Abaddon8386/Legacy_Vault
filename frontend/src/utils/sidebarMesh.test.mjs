import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compositeOver, contrastRatio } from './auditContrast.mjs';

const appShellJsxPath = resolve('src/components/layout/AppShell.jsx');
const appShellCssPath = resolve('src/components/layout/AppShell.css');

test('sidebarMesh: AppShell JSX renders lv-sidebar-mesh-bg with aria-hidden="true"', () => {
  const jsx = readFileSync(appShellJsxPath, 'utf8');

  // Verify container element and aria-hidden
  assert.match(
    jsx,
    /<div[^>]*className=\{`lv-sidebar-mesh-bg[^`]*`\}[^>]*aria-hidden="true"/,
    'lv-sidebar-mesh-bg must have aria-hidden="true"'
  );

  // Verify orb elements inside
  assert.match(
    jsx,
    /className="lv-sidebar-mesh-orb lv-mesh-orb-1"\s*aria-hidden="true"/,
    'lv-mesh-orb-1 must have aria-hidden="true"'
  );
  assert.match(
    jsx,
    /className="lv-sidebar-mesh-orb lv-mesh-orb-2"\s*aria-hidden="true"/,
    'lv-mesh-orb-2 must have aria-hidden="true"'
  );
  assert.match(
    jsx,
    /className="lv-sidebar-mesh-orb lv-mesh-orb-3"\s*aria-hidden="true"/,
    'lv-mesh-orb-3 must have aria-hidden="true"'
  );
});

test('sidebarMesh: AppShell pauses mesh animation when document tab is hidden', () => {
  const jsx = readFileSync(appShellJsxPath, 'utf8');

  // Verify visibility listener
  assert.match(
    jsx,
    /document\.visibilityState\s*!==\s*'hidden'/,
    'AppShell must track document visibility'
  );
  assert.match(
    jsx,
    /addEventListener\('visibilitychange'/i,
    'AppShell must listen to visibilitychange events'
  );
  assert.match(
    jsx,
    /\${!isTabVisible \? 'is-paused' : ''}/,
    'AppShell must add is-paused class when tab is hidden'
  );

  const css = readFileSync(appShellCssPath, 'utf8');
  assert.match(
    css,
    /\.lv-sidebar-mesh-bg\.is-paused\s+\.lv-sidebar-mesh-orb\s*\{[^}]*animation-play-state:\s*paused\s*!important/i,
    'CSS must pause animation when is-paused is applied'
  );
});

test('sidebarMesh: CSS strictly disables animation under prefers-reduced-motion: reduce', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Verify prefers-reduced-motion media query
  const reducedMotionMatch = css.match(
    /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.lv-sidebar-mesh-orb\s*\{([^}]+)\}/
  );
  assert.ok(
    reducedMotionMatch,
    'CSS must contain @media (prefers-reduced-motion: reduce) for .lv-sidebar-mesh-orb'
  );

  const rules = reducedMotionMatch[1];
  assert.match(rules, /animation:\s*none\s*!important/i, 'Reduced-motion must set animation: none !important');
  assert.match(rules, /transition:\s*none\s*!important/i, 'Reduced-motion must set transition: none !important');
  assert.match(rules, /transform:\s*none\s*!important/i, 'Reduced-motion must set transform: none !important');
});

test('sidebarMesh: Animation cycle is 40-60s per orb and phase-shifted', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Check animation durations for each orb
  const orb1Match = css.match(/\.lv-mesh-orb-1\s*\{[^}]*animation:\s*lv-mesh-drift-1\s+(\d+)s/);
  const orb2Match = css.match(/\.lv-mesh-orb-2\s*\{[^}]*animation:\s*lv-mesh-drift-2\s+(\d+)s/);
  const orb3Match = css.match(/\.lv-mesh-orb-3\s*\{[^}]*animation:\s*lv-mesh-drift-3\s+(\d+)s/);

  assert.ok(orb1Match, 'Orb 1 must define animation in seconds');
  assert.ok(orb2Match, 'Orb 2 must define animation in seconds');
  assert.ok(orb3Match, 'Orb 3 must define animation in seconds');

  const d1 = parseInt(orb1Match[1], 10);
  const d2 = parseInt(orb2Match[1], 10);
  const d3 = parseInt(orb3Match[1], 10);

  assert.ok(d1 >= 40 && d1 <= 60, `Orb 1 duration (${d1}s) must be in 40-60s range`);
  assert.ok(d2 >= 40 && d2 <= 60, `Orb 2 duration (${d2}s) must be in 40-60s range`);
  assert.ok(d3 >= 40 && d3 <= 60, `Orb 3 duration (${d3}s) must be in 40-60s range`);
  assert.notEqual(d1, d2, 'Durations must be phase-shifted');
  assert.notEqual(d2, d3, 'Durations must be phase-shifted');
});

test('sidebarMesh: Displacement amplitudes are <= 10-15% of 260px sidebar (<= 39px)', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  const translateMatches = css.matchAll(/translate3d\(\s*(-?\d+)px\s*,\s*(-?\d+)px\s*,\s*0\)/g);
  let count = 0;
  for (const match of translateMatches) {
    count++;
    const x = Math.abs(parseInt(match[1], 10));
    const y = Math.abs(parseInt(match[2], 10));
    assert.ok(x <= 39, `X translation (${x}px) must be <= 15% of 260px (<= 39px)`);
    assert.ok(y <= 45, `Y translation (${y}px) must be subtle`);
  }
  assert.ok(count >= 6, 'Must check all keyframe translations');
});

test('sidebarMesh: Gold orb opacity is strictly <= 0.12', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Match gold background stop inside .lv-mesh-orb-3
  const orb3Block = css.match(/\.lv-mesh-orb-3\s*\{([^}]+)\}/);
  assert.ok(orb3Block, 'Must find .lv-mesh-orb-3 CSS rule');

  const goldStopMatch = orb3Block[1].match(/rgba\(\s*197,\s*160,\s*89,\s*([\d.]+)\)/);
  assert.ok(goldStopMatch, 'Must define sand gold rgba stop inside .lv-mesh-orb-3');
  const goldAlpha = parseFloat(goldStopMatch[1]);

  assert.ok(
    goldAlpha <= 0.12,
    `Gold stop alpha (${goldAlpha}) must be <= 0.12`
  );
});

test('sidebarMesh: All interactive text and headings meet WCAG AA (>= 4.5:1) on brightest mesh spot', () => {
  // Brightest composited spot from base #0c2b22 + Forest green + subtle gold
  const bg = { r: 12, g: 43, b: 34, a: 1 };
  const afterOrb1 = compositeOver({ r: 20, g: 60, b: 48, a: 0.5 }, bg);
  const brightest = compositeOver({ r: 197, g: 160, b: 89, a: 0.07 }, afterOrb1);

  const targets = [
    { name: 'Active menu text (#ffffff)', color: '#ffffff' },
    { name: 'Regular menu text (rgba(255, 255, 255, 0.72))', color: 'rgba(255, 255, 255, 0.72)' },
    { name: 'Group title (--lv-accent-gold #c5a059)', color: '#c5a059' },
    { name: 'Brand logo & title (#ffffff)', color: '#ffffff' },
    { name: 'User name (#ffffff)', color: '#ffffff' },
  ];

  for (const target of targets) {
    const ratio = contrastRatio(target.color, brightest);
    assert.ok(
      ratio >= 4.5,
      `Expected ${target.name} to have contrast >= 4.5:1 on brightest mesh spot, got ${ratio.toFixed(2)}:1`
    );
  }
});
