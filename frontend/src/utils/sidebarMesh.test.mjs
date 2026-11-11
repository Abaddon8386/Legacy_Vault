import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

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

test('sidebarMesh: Keyframe animations only manipulate transform and opacity (no heavy blur filter animations)', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Extract all @keyframes lv-mesh-drift blocks
  const keyframeBlocks = css.matchAll(/@keyframes\s+(lv-mesh-drift-\d+)\s*\{([\s\S]*?)\n\}/g);
  let count = 0;

  for (const block of keyframeBlocks) {
    count++;
    const animName = block[1];
    const animBody = block[2];

    // Ensure filter / blur is NEVER animated
    assert.doesNotMatch(
      animBody,
      /filter\s*:/i,
      `Animation ${animName} must NOT animate filter (causes CPU/GPU repaint thrashing)`
    );

    // Ensure transform and opacity are present
    assert.match(
      animBody,
      /transform\s*:/i,
      `Animation ${animName} should animate transform`
    );
    assert.match(
      animBody,
      /opacity\s*:/i,
      `Animation ${animName} should animate opacity`
    );
  }

  assert.equal(count, 3, 'Must define exactly 3 lv-mesh-drift keyframe animations');
});

test('sidebarMesh: Z-index layering places background behind interactive items and retains brand colors', () => {
  const css = readFileSync(appShellCssPath, 'utf8');

  // Verify container z-index is 0 and pointer-events is none
  assert.match(
    css,
    /\.lv-sidebar-mesh-bg\s*\{[^}]*z-index:\s*0/i,
    '.lv-sidebar-mesh-bg must have z-index: 0'
  );
  assert.match(
    css,
    /\.lv-sidebar-mesh-bg\s*\{[^}]*pointer-events:\s*none/i,
    '.lv-sidebar-mesh-bg must have pointer-events: none'
  );

  // Interactive sections have z-index >= 1
  assert.match(
    css,
    /\.lv-sidebar-brand\s*\{[^}]*z-index:\s*1/i,
    '.lv-sidebar-brand must have z-index: 1'
  );
  assert.match(
    css,
    /\.lv-sidebar-nav\s*\{[^}]*z-index:\s*1/i,
    '.lv-sidebar-nav must have z-index: 1'
  );
  assert.match(
    css,
    /\.lv-sidebar-footer\s*\{[^}]*z-index:\s*110/i,
    '.lv-sidebar-footer must have z-index: 110'
  );

  // Brand colors present in orbs
  assert.match(css, /22,\s*70,\s*57/, 'Orb 1 should use Forest Green RGB(22, 70, 57)');
  assert.match(css, /20,\s*53,\s*43/, 'Orb 2 should use Deep Emerald Teal RGB(20, 53, 43)');
  assert.match(css, /197,\s*160,\s*89/, 'Orb 3 should use Sand Gold RGB(197, 160, 89)');
});
