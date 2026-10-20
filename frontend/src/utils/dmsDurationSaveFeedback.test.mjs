import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import {
  validateDmsDuration,
  validateDmsInterval,
  formatDmsInterval,
  dmsStatusMessages,
  saveDmsConfig,
  mockDmsAdapter,
  isSimulationPermitted,
} from './dmsService.js';

// Setup DOM for component testing
const dom = new JSDOM('<body></body>', { url: 'http://localhost/dms' });
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute('open', ''); };
dom.window.HTMLDialogElement.prototype.close = function () { this.removeAttribute('open'); };

async function buildComponent(entry) {
  const result = await build({
    configFile: false,
    plugins: [react()],
    logLevel: 'silent',
    build: {
      write: false,
      minify: false,
      lib: { entry, formats: ['es'] },
      rollupOptions: { external: ['react', 'react-dom', 'react/jsx-runtime'] },
    },
  });
  let code = (Array.isArray(result) ? result[0] : result).output.find(
    (item) => item.type === 'chunk' && item.isEntry
  ).code;
  for (const name of ['react', 'react-dom', 'react/jsx-runtime']) {
    code = code.replaceAll('from "' + name + '"', 'from "' + import.meta.resolve(name) + '"');
  }
  return (await import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'))).default;
}

const DMSOverviewPage = await buildComponent('src/pages/dms/DMSOverviewPage.jsx');

const json = (value, status = 200) =>
  new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function setInputValue(input, val) {
  const reactPropsKey = Object.keys(input).find((k) => k.startsWith('__reactProps'));
  if (reactPropsKey && input[reactPropsKey]?.onChange) {
    input[reactPropsKey].onChange({ target: { value: val } });
  } else {
    input.value = val;
    input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    input.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  }
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

// ============================================================================
// 1. DURATION VALIDATION TESTS
// ============================================================================

test('validateDmsDuration - rejects empty input', () => {
  const errVi = validateDmsDuration({}, 'vi');
  assert.equal(errVi.check_interval_days, dmsStatusMessages.vi.intervalRequired);

  const errEn = validateDmsDuration({ days: '', hours: '', minutes: '' }, 'en');
  assert.equal(errEn.check_interval_days, dmsStatusMessages.en.intervalRequired);
});

test('validateDmsDuration - rejects zero total duration', () => {
  const errVi = validateDmsDuration({ days: 0, hours: 0, minutes: 0 }, 'vi');
  assert.equal(errVi.duration, dmsStatusMessages.vi.durationZero);

  const errEn = validateDmsDuration({ days: '0', hours: '0', minutes: '0' }, 'en');
  assert.equal(errEn.duration, dmsStatusMessages.en.durationZero);
});

test('validateDmsDuration - rejects negative values and decimals', () => {
  const errNegative = validateDmsDuration({ days: -1, hours: 0, minutes: 0 }, 'vi');
  assert.equal(errNegative.days, dmsStatusMessages.vi.durationPositive);

  const errDecimal = validateDmsDuration({ days: 1, hours: '2.5', minutes: 0 }, 'vi');
  assert.equal(errDecimal.hours, dmsStatusMessages.vi.durationInteger);

  const errText = validateDmsDuration({ days: 1, hours: 0, minutes: 'abc' }, 'en');
  assert.equal(errText.minutes, dmsStatusMessages.en.durationInteger);
});

test('validateDmsDuration - rejects out-of-range units and over 180 days', () => {
  const errHours = validateDmsDuration({ days: 0, hours: 24, minutes: 0 }, 'vi');
  assert.equal(errHours.hours, dmsStatusMessages.vi.hoursRange);

  const errMinutes = validateDmsDuration({ days: 0, hours: 1, minutes: 60 }, 'en');
  assert.equal(errMinutes.minutes, dmsStatusMessages.en.minutesRange);

  const errOver180 = validateDmsDuration({ days: 181, hours: 0, minutes: 0 }, 'vi');
  assert.equal(errOver180.days, dmsStatusMessages.vi.intervalMax);

  const err180WithExtra = validateDmsDuration({ days: 180, hours: 1, minutes: 0 }, 'vi');
  assert.equal(err180WithExtra.duration, dmsStatusMessages.vi.durationMax);
});

test('validateDmsDuration - accepts valid sub-24-hour cycles and multi-day cycles', () => {
  // 12 hours cycle
  assert.deepEqual(validateDmsDuration({ days: 0, hours: 12, minutes: 0 }, 'vi'), {});

  // 30 minutes cycle
  assert.deepEqual(validateDmsDuration({ days: 0, hours: 0, minutes: 30 }, 'en'), {});

  // 45 days 6 hours 15 minutes cycle
  assert.deepEqual(validateDmsDuration({ days: 45, hours: 6, minutes: 15 }, 'vi'), {});

  // Exactly 180 days
  assert.deepEqual(validateDmsDuration({ days: 180, hours: 0, minutes: 0 }, 'en'), {});
});

test('formatDmsInterval - formats correctly for days, hours, and minutes', () => {
  assert.equal(formatDmsInterval({ checkIntervalDays: 30 }, 'vi'), '30 ngày');
  assert.equal(formatDmsInterval({ checkIntervalDays: 1 }, 'en'), '1 day');
  assert.equal(formatDmsInterval({ checkIntervalDays: 0, checkIntervalHours: 12, checkIntervalMinutes: 0 }, 'vi'), '12 giờ');
  assert.equal(formatDmsInterval({ checkIntervalDays: 0, checkIntervalHours: 0, checkIntervalMinutes: 45 }, 'en'), '45 minutes');
  assert.equal(formatDmsInterval({ checkIntervalDays: 2, checkIntervalHours: 4, checkIntervalMinutes: 30 }, 'vi'), '2 ngày 4 giờ 30 phút');
});

// ============================================================================
// 2. LIVE VS MOCK CONTRACT COMPATIBILITY & PS-91 GATING
// ============================================================================

test('saveDmsConfig - Live mode blocks sub-day intervals with BACKEND_SUBDAY_PENDING (PS-91)', async () => {
  await assert.rejects(
    async () => {
      await saveDmsConfig(
        { days: 0, hours: 12, minutes: 0 },
        { isDevPreview: false, accessToken: 'real-token', lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_SUBDAY_PENDING');
      assert.ok(err.message.includes('PS-91'));
      return true;
    }
  );
});

test('saveDmsConfig - Live mode passes whole-day intervals to PUT /dms', async () => {
  const originalFetch = globalThis.fetch;
  let putBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return json({
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'MONITORING',
        checkIntervalDays: 45,
        gracePeriodDays: 1,
        lastCheckInAt: '2026-10-15T00:00:00Z',
        nextCheckAt: '2026-11-29T00:00:00Z',
      });
    }
    return json({});
  };

  try {
    const res = await saveDmsConfig(
      { days: 45, hours: 0, minutes: 0 },
      { isDevPreview: false, accessToken: 'real-token', lang: 'vi' }
    );
    assert.equal(res.checkIntervalDays, 45);
    assert.deepEqual(putBody, { checkIntervalDays: 45 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveDmsConfig - Mock simulation computes exact nextCheckAt for sub-day duration', async () => {
  const before = Date.now();
  const res = await saveDmsConfig(
    { days: 0, hours: 6, minutes: 30 },
    { isDevPreview: true, isTest: true, lang: 'vi' }
  );
  assert.equal(res.checkIntervalDays, 0);
  assert.equal(res.checkIntervalHours, 6);
  assert.equal(res.checkIntervalMinutes, 30);
  assert.equal(res.isSimulation, true);

  const nextCheckMs = new Date(res.nextCheckAt).getTime();
  const expectedMs = before + (6 * 60 + 30) * 60 * 1000;
  // Allow slight delta of < 2000ms
  assert.ok(Math.abs(nextCheckMs - expectedMs) < 2000);
});

test('saveDmsConfig - Production environment strictly blocks simulation', async () => {
  await assert.rejects(
    async () => {
      await saveDmsConfig(
        { days: 30 },
        { isDevPreview: true, testEnv: { PROD: true } }
      );
    },
    // Production will attempt live request, which fails if fetch is not configured
    (err) => {
      assert.ok(err);
      return true;
    }
  );
});

// ============================================================================
// 3. UI INTEGRATION: DURATION INPUTS, SAVE PROGRESS BAR, AND PREVIEW LABELS
// ============================================================================

test('DMS UI - Renders days, hours, and minutes inputs with presets', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json({
    ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'MONITORING',
    checkIntervalDays: 30,
    checkIntervalHours: 0,
    checkIntervalMinutes: 0,
    gracePeriodDays: 1,
    lastCheckInAt: '2026-10-15T00:00:00Z',
    nextCheckAt: '2026-11-14T00:00:00Z',
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'synthetic',
        lang: 'vi',
      }));
    });

    const daysInput = host.querySelector('#dms-interval-input');
    const hoursInput = host.querySelector('#dms-interval-hours-input');
    const minutesInput = host.querySelector('#dms-interval-minutes-input');

    assert.ok(daysInput, 'Days input should be present');
    assert.ok(hoursInput, 'Hours input should be present');
    assert.ok(minutesInput, 'Minutes input should be present');

    assert.equal(daysInput.value, '30');
    assert.equal(hoursInput.value, '0');
    assert.equal(minutesInput.value, '0');

    // Click preset 60 days
    const preset60 = [...host.querySelectorAll('.lv-dms-preset-pill')].find(p => p.textContent.includes('60 ngày'));
    assert.ok(preset60, '60 days preset pill must exist');

    await act(async () => {
      preset60.click();
    });

    assert.equal(daysInput.value, '60');
    assert.equal(hoursInput.value, '0');
    assert.equal(minutesInput.value, '0');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

test('DMS UI - Indeterminate save progress bar appears during pending save and disappears after completion', async () => {
  const originalFetch = globalThis.fetch;
  const deferred = createDeferred();
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === 'PUT') {
      return deferred.promise;
    }
    return json({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      status: 'MONITORING',
      checkIntervalDays: 30,
      gracePeriodDays: 1,
      lastCheckInAt: '2026-10-15T00:00:00Z',
      nextCheckAt: '2026-11-14T00:00:00Z',
    });
  };

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'synthetic',
        lang: 'vi',
      }));
    });

    const daysInput = host.querySelector('#dms-interval-input');
    await act(async () => {
      setInputValue(daysInput, '60');
    });

    // Trigger save
    const form = host.querySelector('form');
    act(() => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Verify indeterminate progress bar and feedback are rendered while pending
    const saveProgress = host.querySelector('.lv-dms-save-feedback-area');
    assert.ok(saveProgress, 'Indeterminate save progress area must appear while request is pending');
    assert.equal(saveProgress.getAttribute('role'), 'status');
    assert.equal(saveProgress.getAttribute('aria-busy'), 'true');
    assert.ok(saveProgress.textContent.includes('Đang lưu cấu hình…'));

    // Submit button should be disabled to prevent duplicate submissions
    const submitBtn = host.querySelector('.lv-dms-submit-btn');
    assert.equal(submitBtn.disabled, true, 'Submit button must be disabled while saving');

    // Resolve request
    await act(async () => {
      deferred.resolve(json({
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'MONITORING',
        checkIntervalDays: 60,
        gracePeriodDays: 1,
        lastCheckInAt: '2026-10-15T00:00:00Z',
        nextCheckAt: '2026-12-14T00:00:00Z',
      }));
    });

    // Progress bar must disappear after completion
    assert.equal(host.querySelector('.lv-dms-save-feedback-area'), null, 'Save progress must be removed after completion');
    assert.equal(submitBtn.disabled, false, 'Submit button must re-enable');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

test('DMS UI - Preserves draft on error and displays PS-91 message when sub-day attempted in live mode', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json({
    ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'MONITORING',
    checkIntervalDays: 30,
    gracePeriodDays: 1,
    lastCheckInAt: '2026-10-15T00:00:00Z',
    nextCheckAt: '2026-11-14T00:00:00Z',
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'real-session-token',
        lang: 'vi',
      }));
    });

    const daysInput = host.querySelector('#dms-interval-input');
    const hoursInput = host.querySelector('#dms-interval-hours-input');

    await act(async () => {
      setInputValue(daysInput, '0');
      setInputValue(hoursInput, '12');
    });

    // Verify sub-day live hint notice is shown
    const notice = host.querySelector('.lv-dms-subday-notice');
    assert.ok(notice, 'Live sub-day hint notice must be displayed');
    assert.ok(notice.textContent.includes('PS-91'));

    // Submit
    const form = host.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Error banner should be displayed and draft preserved
    const bannerError = host.querySelector('.lv-dms-banner-error');
    assert.ok(bannerError, 'Error banner should be shown');
    assert.ok(bannerError.textContent.includes('PS-91'));

    assert.equal(daysInput.value, '0');
    assert.equal(hoursInput.value, '12');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

test('DMS UI - Switching language retains draft duration values', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => json({
    ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    status: 'MONITORING',
    checkIntervalDays: 30,
    gracePeriodDays: 1,
    lastCheckInAt: '2026-10-15T00:00:00Z',
    nextCheckAt: '2026-11-14T00:00:00Z',
  });

  const host = document.createElement('div');
  document.body.append(host);
  const root = createRoot(host);

  try {
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'synthetic',
        lang: 'vi',
      }));
    });

    const daysInput = host.querySelector('#dms-interval-input');
    const hoursInput = host.querySelector('#dms-interval-hours-input');
    const minutesInput = host.querySelector('#dms-interval-minutes-input');

    await act(async () => {
      setInputValue(daysInput, '45');
      setInputValue(hoursInput, '8');
      setInputValue(minutesInput, '30');
    });

    // Switch to English
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'synthetic',
        lang: 'en',
      }));
    });

    assert.equal(host.querySelector('#dms-interval-input').value, '45', 'Days must be preserved across language switch');
    assert.equal(host.querySelector('#dms-interval-hours-input').value, '8', 'Hours must be preserved across language switch');
    assert.equal(host.querySelector('#dms-interval-minutes-input').value, '30', 'Minutes must be preserved across language switch');

    // Switch back to Vietnamese
    await act(async () => {
      root.render(React.createElement(DMSOverviewPage, {
        accessToken: 'synthetic',
        lang: 'vi',
      }));
    });

    assert.equal(host.querySelector('#dms-interval-input').value, '45');
    assert.equal(host.querySelector('#dms-interval-hours-input').value, '8');
    assert.equal(host.querySelector('#dms-interval-minutes-input').value, '30');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});
