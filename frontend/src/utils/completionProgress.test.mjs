import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  canAccessCompletionProgress,
  normalizeSafeIntegerCount,
  evaluateCompletionProgress,
  COMPLETION_PROGRESS_STATUS,
  COMPLETION_MISSING_CONDITIONS,
} from './completionProgressValidation.js';
import { completionProgressI18n } from '../pages/staff/completionProgressI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/staff/completion-progress?preview=true',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
globalThis.Event = dom.window.Event;
globalThis.MouseEvent = dom.window.MouseEvent;
globalThis.KeyboardEvent = dom.window.KeyboardEvent;
if (!dom.window.Element.prototype.scrollIntoView) {
  dom.window.Element.prototype.scrollIntoView = () => {};
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Helper to update input for React in JSDOM
function changeInput(element, value) {
  if (!element) return;
  const prototype = dom.window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) {
    setter.call(element, value);
  } else {
    element.value = value;
  }
  const propsKey = Object.keys(element).find((k) => k.startsWith('__reactProps$'));
  if (propsKey && typeof element[propsKey]?.onChange === 'function') {
    element[propsKey].onChange({ target: element });
  } else {
    element.dispatchEvent(new dom.window.Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new dom.window.Event('change', { bubbles: true, cancelable: true }));
  }
}

async function loadComponentModule(entry, production = false) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    define: {
      'import.meta.env.DEV': String(!production),
      'import.meta.env.PROD': String(production),
    },
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react-dom/client', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

const componentMod = await loadComponentModule('src/pages/staff/CompletionProgressPage.jsx');
const CompletionProgressPage = componentMod.default;

async function mount(Component, props) {
  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);
  await act(async () => {
    root.render(React.createElement(Component, props));
  });
  return {
    host,
    render: async (nextProps) => {
      await act(async () => {
        root.render(React.createElement(Component, nextProps));
      });
    },
    close: async () => {
      await act(async () => {
        root.unmount();
      });
      host.remove();
    },
  };
}

test('PS-55 Strict Safe Integer Counter Validation (normalizeSafeIntegerCount)', async (t) => {
  await t.test('accepts valid non-negative safe integers', () => {
    assert.equal(normalizeSafeIntegerCount(0), 0);
    assert.equal(normalizeSafeIntegerCount(1), 1);
    assert.equal(normalizeSafeIntegerCount(42), 42);
    assert.equal(normalizeSafeIntegerCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  });

  await t.test('strictly rejects non-number types without coercion', () => {
    assert.equal(normalizeSafeIntegerCount(''), null);
    assert.equal(normalizeSafeIntegerCount(' '), null);
    assert.equal(normalizeSafeIntegerCount('0'), null);
    assert.equal(normalizeSafeIntegerCount('42'), null);
    assert.equal(normalizeSafeIntegerCount(false), null);
    assert.equal(normalizeSafeIntegerCount(true), null);
    assert.equal(normalizeSafeIntegerCount(null), null);
    assert.equal(normalizeSafeIntegerCount(undefined), null);
    assert.equal(normalizeSafeIntegerCount({}), null);
    assert.equal(normalizeSafeIntegerCount([]), null);
  });

  await t.test('strictly rejects invalid numbers (NaN, Infinity, negative, floating point)', () => {
    assert.equal(normalizeSafeIntegerCount(NaN), null);
    assert.equal(normalizeSafeIntegerCount(Infinity), null);
    assert.equal(normalizeSafeIntegerCount(-Infinity), null);
    assert.equal(normalizeSafeIntegerCount(-1), null);
    assert.equal(normalizeSafeIntegerCount(-42), null);
    assert.equal(normalizeSafeIntegerCount(1.5), null);
    assert.equal(normalizeSafeIntegerCount(3.14159), null);
  });
});

test('PS-55 Route & Client Role Guard', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessCompletionProgress(null), false);
    assert.equal(canAccessCompletionProgress(undefined), false);
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      false
    );
  });

  await t.test('rejects access when user lacks STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['LEGAL_VERIFIER'] },
      }),
      false
    );
  });

  await t.test('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      true
    );
  });

  await t.test('grants access when user holds multi-roles including STAFF_EXECUTOR', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] },
      }),
      true
    );
  });
});

test('PS-55 LV-CLOSE-001 Dual 100% AND Condition Evaluation', async (t) => {
  await t.test('evaluates to COMPLETED when assets 100% AND beneficiaries 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 4, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isComplete, true);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.COMPLETED);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.is100, true);
    assert.equal(res.missingConditions.length, 0);
  });

  await t.test('evaluates to INCOMPLETE when assets 100% but beneficiaries < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 4, total: 4 },
      { confirmed: 1, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.is100, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE));
  });

  await t.test('evaluates to INCOMPLETE when beneficiaries 100% but assets < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, false);
    assert.equal(res.beneficiaryMetric.is100, true);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE));
  });

  await t.test('evaluates to INCOMPLETE when both metrics < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 1, total: 4 },
      { confirmed: 0, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, false);
    assert.equal(res.beneficiaryMetric.is100, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE));
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE));
  });

  await t.test('conclusion relies on direct count equality (delivered === total), NOT rounded percentage', () => {
    // 999 out of 1000 items is 99.9%, which might round to 100% in some formatters,
    // but count equality strictly marks is100 as false and isComplete as false
    const res = evaluateCompletionProgress(
      { delivered: 999, total: 1000 },
      { confirmed: 10, total: 10 }
    );
    assert.equal(res.assetMetric.is100, false);
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
  });
});

test('PS-55 Missing Count, Zero Count, and Out-of-Bounds Rejection', async (t) => {
  await t.test('0/0 is NEVER treated as complete and evaluates to INDETERMINATE', () => {
    const res = evaluateCompletionProgress(
      { delivered: 0, total: 0 },
      { confirmed: 0, total: 0 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INDETERMINATE);
    assert.equal(res.assetMetric.isVerified, false);
    assert.equal(res.beneficiaryMetric.isVerified, false);
    assert.equal(res.assetMetric.percentage, null);
    assert.equal(res.beneficiaryMetric.percentage, null);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DATA_UNAVAILABLE));
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE));
  });

  await t.test('completed count exceeding total (delivered > total) is rejected as invalid/indeterminate', () => {
    const res = evaluateCompletionProgress(
      { delivered: 5, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INDETERMINATE);
    assert.equal(res.assetMetric.isVerified, false);
    assert.equal(res.assetMetric.percentage, null);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DATA_UNAVAILABLE));
  });

  await t.test('confirmed count exceeding total (confirmed > total) is rejected as invalid/indeterminate', () => {
    const res = evaluateCompletionProgress(
      { delivered: 4, total: 4 },
      { confirmed: 3, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INDETERMINATE);
    assert.equal(res.beneficiaryMetric.isVerified, false);
    assert.equal(res.beneficiaryMetric.percentage, null);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE));
  });

  await t.test('assets 100% (2/2) but beneficiaries missing data evaluates to INDETERMINATE', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: 2 },
      { confirmed: null, total: null }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INDETERMINATE);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.isVerified, false);
    assert.equal(res.beneficiaryMetric.percentage, null);
  });

  await t.test('missing or null total count flags as unverified and blocks completion without showing 0%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: null },
      { confirmed: 1, total: 1 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INDETERMINATE);
    assert.equal(res.assetMetric.isVerified, false);
    assert.equal(res.assetMetric.percentage, null);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DATA_UNAVAILABLE));
  });

  await t.test('calculates independent ratios without blending percentages', () => {
    const res = evaluateCompletionProgress(
      { delivered: 1, total: 2 }, // 50%
      { confirmed: 1, total: 4 }  // 25%
    );
    assert.equal(res.assetMetric.percentage, 50);
    assert.equal(res.beneficiaryMetric.percentage, 25);
    // There is no combined percentage field
    assert.equal(res.combinedPercentage, undefined);
  });
});

test('PS-55 Dynamic Language Switching (VI <-> EN)', () => {
  const vi = completionProgressI18n.vi;
  const en = completionProgressI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  // Missing conditions resolution
  for (const cond of Object.values(COMPLETION_MISSING_CONDITIONS)) {
    assert.ok(vi[cond], `Missing VI translation for ${cond}`);
    assert.ok(en[cond], `Missing EN translation for ${cond}`);
  }
});

test('PS-55 CSS Scoping Verification - No Leakage', () => {
  const cssPath = path.resolve(__dirname, '../pages/staff/CompletionProgressPage.css');
  const css = readFileSync(cssPath, 'utf8');

  // Strip comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = stripped.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('@media') || line.startsWith('}')) continue;

    if (line.includes('{')) {
      const selectorsPart = line.split('{')[0].trim();
      const selectors = selectorsPart.split(',');
      for (const sel of selectors) {
        const s = sel.trim();
        if (!s || s.startsWith('@') || s.startsWith('from') || s.startsWith('to')) continue;
        assert.ok(
          s.startsWith('.lv-completion-progress-view'),
          `Selector "${s}" in CompletionProgressPage.css must start with .lv-completion-progress-view`
        );
      }
    }
  }
});

test('live completion DTO renders real counts and changing session clears the previous verdict', async () => {
  const originalFetch = globalThis.fetch;
  const caseId = '11111111-1111-4111-8111-111111111111';
  const firstSession = '22222222-2222-4222-8222-222222222222';
  const secondSession = '33333333-3333-4333-8333-333333333333';
  const response = data => new Response(JSON.stringify(data), { status: 200, headers: { 'Content-Type': 'application/json' } });
  let releaseSecond;
  globalThis.fetch = async url => String(url).includes(secondSession)
    ? new Promise(resolve => { releaseSecond = data => resolve(response(data)); })
    : response({ assets: { completed: 2, total: 2, pending: 0, complete: true },
      beneficiaries: { completed: 1, total: 1, pending: 0, complete: true }, ready: true });
  let view;
  try {
    view = await mount(CompletionProgressPage, { caseId, sessionId: firstSession, accessToken: 'synthetic-live-token' });
    assert.match(view.host.textContent, /2 \/ 2/);
    assert.match(view.host.textContent, /1 \/ 1/);
    assert.match(view.host.textContent, /Đủ điều kiện hoàn tất hồ sơ/);
    await view.render({ caseId, sessionId: secondSession, accessToken: 'synthetic-live-token' });
    assert.doesNotMatch(view.host.textContent, /Đủ điều kiện hoàn tất hồ sơ/);
    assert.equal(view.host.querySelector('.lv-dual-metrics-grid'), null, 'Do not show stale or placeholder charts while the new session loads');
    assert.match(view.host.textContent, /Chưa có thông tin/);
    await act(async () => releaseSecond({ assets: { completed: 1, total: 2, pending: 1, complete: false },
      beneficiaries: { completed: 0, total: 1, pending: 1, complete: false }, ready: false }));
    assert.match(view.host.textContent, /1 \/ 2/);
    assert.match(view.host.textContent, /0 \/ 1/);
    assert.match(view.host.textContent, /Chưa đủ điều kiện hoàn tất/);
  } finally {
    if (view) await view.close();
    globalThis.fetch = originalFetch;
  }
});

test('PS-55 Component Regression: Case Switching Isolation & Stale Response Discard', async (t) => {
  await t.test('switching case via input wipes case A data, resets metrics to indeterminate, and avoids retaining A progress', async () => {
    const wrapper = await mount(CompletionProgressPage, {
      caseReference: 'CASE-A',
      initialAssetData: { delivered: 4, total: 4 },
      initialBeneficiaryData: { confirmed: 2, total: 2 },
    });

    try {
      // 1. Case A renders as completed (4/4, 2/2, 100%, overall complete)
      assert.ok(wrapper.host.textContent.includes('4 / 4'), 'Should show 4 / 4 for Case A assets');
      assert.ok(wrapper.host.textContent.includes('2 / 2'), 'Should show 2 / 2 for Case A beneficiaries');
      assert.ok(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'), 'Case A should be eligible for completion');

      const caseInput = wrapper.host.querySelector('.lv-progress-input');
      assert.ok(caseInput, 'Case input must exist');
      assert.equal(caseInput.value, 'CASE-A');

      // 2. Switch case A -> B directly via input without clearing to blank first
      await act(async () => {
        changeInput(caseInput, 'CASE-B');
      });

      // VERIFY: Case A data must be wiped immediately!
      assert.equal(wrapper.host.textContent.includes('4 / 4'), false, 'Case A asset ratio must NOT remain');
      assert.equal(wrapper.host.textContent.includes('2 / 2'), false, 'Case A beneficiary ratio must NOT remain');
      assert.equal(wrapper.host.textContent.includes('Đạt 100%'), false, 'Đạt 100% badge must NOT remain');
      assert.equal(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'), false, 'Case A completion verdict must NOT remain');

      // VERIFY: B must show INDETERMINATE ("Chưa có thông tin", "— / —", "—")
      assert.equal(wrapper.host.querySelector('.lv-dual-metrics-grid'), null, 'No placeholder charts without data');
      assert.ok(wrapper.host.textContent.includes('Chưa có thông tin'), 'Should show "Chưa có thông tin" banner/badges');

      // Verify trackbar is indeterminate without aria-valuenow="0"
      const progressTracks = wrapper.host.querySelectorAll('.lv-progress-track--indeterminate');
      assert.equal(progressTracks.length, 0, 'Hide both tracks until data is available');
      for (const track of progressTracks) {
        assert.equal(track.getAttribute('aria-valuenow'), null, 'Indeterminate track must NOT have aria-valuenow=0');
        assert.equal(track.getAttribute('aria-valuetext'), 'Chưa có thông tin');
      }
    } finally {
      await wrapper.close();
    }
  });

  await t.test('switching case via props wipes case A and correctly displays valid case B data', async () => {
    const wrapper = await mount(CompletionProgressPage, {
      caseId: 'CASE-A',
      assetData: { delivered: 4, total: 4 },
      beneficiaryData: { confirmed: 2, total: 2 },
    });

    try {
      assert.ok(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'));
      assert.ok(wrapper.host.textContent.includes('4 / 4'));

      // Switch to B without data yet
      await wrapper.render({
        caseId: 'CASE-B',
        assetData: null,
        beneficiaryData: null,
      });

      assert.equal(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'), false);
      assert.equal(wrapper.host.textContent.includes('4 / 4'), false);
      assert.ok(wrapper.host.textContent.includes('Chưa có thông tin'));
      assert.equal(wrapper.host.querySelector('.lv-dual-metrics-grid'), null);

      // Now valid Case B data arrives (partially complete: 2/4 assets, 1/2 beneficiaries)
      await wrapper.render({
        caseId: 'CASE-B',
        assetData: { delivered: 2, total: 4 },
        beneficiaryData: { confirmed: 1, total: 2 },
      });

      assert.ok(wrapper.host.textContent.includes('2 / 4'), 'Should show Case B asset ratio');
      assert.ok(wrapper.host.textContent.includes('1 / 2'), 'Should show Case B beneficiary ratio');
      assert.ok(wrapper.host.textContent.includes('50%'), 'Should show Case B percentage');
      assert.ok(wrapper.host.textContent.includes('Chưa đủ điều kiện hoàn tất'), 'Should show incomplete banner');
      assert.equal(wrapper.host.textContent.includes('4 / 4'), false, 'Case A data must not linger');
    } finally {
      await wrapper.close();
    }
  });

  await t.test('stale response of case A arriving after switching to case B is completely discarded', async () => {
    let resolveCaseA;
    let resolveCaseB;

    const fakeFetcher = (caseId) => {
      if (caseId === 'CASE-A') {
        return new Promise((resolve) => {
          resolveCaseA = (val) => resolve(val);
        });
      }
      if (caseId === 'CASE-B') {
        return new Promise((resolve) => {
          resolveCaseB = (val) => resolve(val);
        });
      }
      return Promise.resolve(null);
    };

    const wrapper = await mount(CompletionProgressPage, {
      onFetchProgress: fakeFetcher,
    });

    try {
      const caseInput = wrapper.host.querySelector('.lv-progress-input');

      // 1. Trigger fetch for CASE-A
      await act(async () => {
        changeInput(caseInput, 'CASE-A');
      });

      // 2. Before A resolves, user switches to CASE-B!
      await act(async () => {
        changeInput(caseInput, 'CASE-B');
      });

      // 3. Late response for CASE-A returns now!
      await act(async () => {
        resolveCaseA({
          assetData: { delivered: 4, total: 4 },
          beneficiaryData: { confirmed: 2, total: 2 },
        });
      });

      // VERIFY: Case A data must be completely discarded
      assert.equal(wrapper.host.textContent.includes('4 / 4'), false, 'Stale Case A asset data must NOT be accepted');
      assert.equal(wrapper.host.textContent.includes('2 / 2'), false, 'Stale Case A beneficiary data must NOT be accepted');
      assert.equal(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'), false, 'Stale Case A verdict must NOT be accepted');
      assert.ok(wrapper.host.textContent.includes('Chưa có thông tin'), 'Should still show indeterminate for Case B');

      // 4. Case B resolves with 3/3 and 3/3
      await act(async () => {
        resolveCaseB({
          assetData: { delivered: 3, total: 3 },
          beneficiaryData: { confirmed: 3, total: 3 },
        });
      });

      // VERIFY: Case B renders accurately
      assert.ok(wrapper.host.textContent.includes('3 / 3'), 'Case B asset data should render');
      assert.ok(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'), 'Case B complete verdict should render');
    } finally {
      await wrapper.close();
    }
  });
});

test('PS-55 Error Handling: 409 Closed Case and API Errors are NOT swallowed into empty data', async (t) => {
  await t.test('409 BASIS_DOSSIER_INVALID_STATE displays clear closed context banner and link to archive', async () => {
    const err409 = new Error('Dossier is in invalid state');
    err409.status = 409;
    err409.code = 'BASIS_DOSSIER_INVALID_STATE';

    const failFetcher = () => Promise.reject(err409);

    const wrapper = await mount(CompletionProgressPage, {
      caseReference: 'HS-2026-000001',
      sessionId: '14a6bd94-2580-4ef6-bbf3-2c17474ade01',
      onFetchProgress: failFetcher,
      caseItem: { status: 'CLOSED' },
      lang: 'vi',
    });

    try {
      // Must NOT be swallowed into generic "Chưa có thông tin"
      assert.ok(wrapper.host.querySelector('.lv-progress-error-banner--closed'), 'Must render closed error banner');
      assert.ok(wrapper.host.textContent.includes('Hồ sơ xác minh hoặc phiên bàn giao đã đóng'), 'Must display closed case title');
      assert.ok(wrapper.host.textContent.includes('Tiến độ chỉ cập nhật khi phiên đang mở'), 'Must explain real-time constraint');

      // Must have navigation action to close-and-archive
      const archiveLink = wrapper.host.querySelector('a[href*="/staff/close-and-archive"]');
      assert.ok(archiveLink, 'Must provide link to close-and-archive history');
      assert.ok(archiveLink.href.includes('HS-2026-000001'));
      assert.ok(archiveLink.href.includes('14a6bd94-2580-4ef6-bbf3-2c17474ade01'));

      // A failed request must not produce empty, apparently useful progress charts.
      assert.equal(wrapper.host.querySelector('.lv-dual-metrics-grid'), null);
    } finally {
      await wrapper.close();
    }
  });

  await t.test('reload progress button is present and triggers re-fetching', async () => {
    let callCount = 0;
    const trackingFetcher = () => {
      callCount++;
      return Promise.resolve({
        assetData: { delivered: 2, total: 4 },
        beneficiaryData: { confirmed: 1, total: 2 },
      });
    };

    const wrapper = await mount(CompletionProgressPage, {
      caseReference: 'HS-2026-000002',
      sessionId: 'session-002',
      onFetchProgress: trackingFetcher,
      lang: 'vi',
    });

    try {
      assert.equal(callCount, 1, 'Initial fetch should occur once');
      const reloadBtn = wrapper.host.querySelector('.lv-progress-btn-reload');
      assert.ok(reloadBtn, 'Reload button must exist');

      await act(async () => {
        reloadBtn.click();
      });

      assert.equal(callCount, 2, 'Clicking reload must trigger refetch');
    } finally {
      await wrapper.close();
    }
  });
});

test('changing an external session discards old counts and fetches the new session', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  let release;
  const first = '22222222-2222-4222-8222-222222222222';
  const second = '33333333-3333-4333-8333-333333333333';
  const json = value => new Response(JSON.stringify(value), {headers: {'Content-Type': 'application/json'}});
  globalThis.fetch = async url => {
    if (!url.endsWith('/completion-progress')) return json([]);
    calls.push(url);
    if (url.includes(second)) return new Promise(resolve => { release = resolve; });
    return json({assets: {completed: 1, total: 2}, beneficiaries: {completed: 1, total: 2}});
  };
  const props = {caseId: '11111111-1111-4111-8111-111111111111', sessionId: first, accessToken: 'synthetic', lang: 'vi'};
  const wrapper = await mount(CompletionProgressPage, props);
  try {
    assert.ok(wrapper.host.textContent.includes('1 / 2'));
    await wrapper.render({...props, sessionId: second});
    assert.equal(calls.length, 2);
    assert.equal(wrapper.host.textContent.includes('1 / 2'), false);
    await act(async () => release(json({assets: {completed: 3, total: 3}, beneficiaries: {completed: 2, total: 2}})));
    assert.ok(wrapper.host.textContent.includes('3 / 3'));
    assert.ok(wrapper.host.textContent.includes('Đủ điều kiện hoàn tất hồ sơ'));
    assert.equal(wrapper.host.querySelector('.lv-progress-btn-reload').disabled, false);
  } finally { await wrapper.close(); globalThis.fetch = originalFetch; }
});

test('an OPEN workflow conflict is not labelled as a closed case', async () => {
  const error = Object.assign(new Error('Approval requires review'), {status: 409, code: 'BASIS_DOSSIER_INVALID_STATE'});
  const wrapper = await mount(CompletionProgressPage, {
    caseId: '11111111-1111-4111-8111-111111111111', sessionId: 'session-a',
    caseItem: {status: 'OPEN'}, onFetchProgress: () => Promise.reject(error), lang: 'vi',
  });
  try {
    assert.equal(wrapper.host.querySelector('.lv-progress-error-banner--closed'), null);
    assert.ok(wrapper.host.textContent.includes('Approval requires review'));
    const archiveActions = [...wrapper.host.querySelectorAll('a[href*="/staff/close-and-archive"]')].filter(link => !link.closest('.lv-workflow-guide'));
    assert.equal(archiveActions.length, 0, 'History navigation stays available, but no archive action is offered on a failed read');
  } finally { await wrapper.close(); }
});

test('session list failure is visible and retry reloads the list', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async url => {
    if (!url.endsWith('/handover-sessions')) return new Response('{}', {headers: {'Content-Type': 'application/json'}});
    calls++;
    return calls === 1
      ? new Response(JSON.stringify({code: 'SERVER_ERROR', message: 'Temporary session failure'}), {status: 500})
      : new Response('[]', {headers: {'Content-Type': 'application/json'}});
  };
  window.history.replaceState({}, '', '/staff/completion-progress');
  const wrapper = await mount(CompletionProgressPage, {caseId: '11111111-1111-4111-8111-111111111111', accessToken: 'synthetic'});
  try {
    assert.ok(wrapper.host.textContent.includes('Chưa tải được danh sách phiên bàn giao'));
    assert.equal(wrapper.host.textContent.includes('Không tìm thấy phiên bàn giao nào'), false);
    const retry = [...wrapper.host.querySelectorAll('button')].find(button => button.textContent === 'Thử lại');
    assert.ok(retry);
    await act(async () => retry.click());
    assert.equal(calls, 2);
    assert.equal(wrapper.host.textContent.includes('Chưa tải được danh sách phiên bàn giao'), false);
  } finally { await wrapper.close(); globalThis.fetch = originalFetch; }
});

test('direct case links resolve a readable case number and keep UUID input collapsed', async () => {
  const originalFetch = globalThis.fetch;
  const caseId = '11111111-1111-4111-8111-111111111111';
  globalThis.fetch = async url => {
    const data = url.endsWith('/completion-progress')
      ? {assets: {completed: 1, total: 2}, beneficiaries: {completed: 1, total: 2}}
      : url.endsWith('/handover-sessions') ? []
      : {caseId, caseNumber: 'HS-2026-000007', status: 'OPEN', vaultName: 'Kho kiểm thử'};
    return new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
  };
  const wrapper = await mount(CompletionProgressPage, {caseId, sessionId: '22222222-2222-4222-8222-222222222222', accessToken: 'synthetic'});
  try {
    assert.equal(wrapper.host.querySelector('.lv-staff-context-bar__code').textContent, 'HS-2026-000007');
    const technical = wrapper.host.querySelector('.lv-progress-technical');
    assert.equal(technical.open, false);
    assert.equal(technical.querySelector('input').value, caseId);
    assert.ok(wrapper.host.textContent.includes('1 / 2'), 'Real progress still renders when data exists');
  } finally { await wrapper.close(); globalThis.fetch = originalFetch; }
});
