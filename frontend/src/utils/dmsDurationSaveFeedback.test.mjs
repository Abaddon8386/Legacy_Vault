import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act, StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import {
  readDms,
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

test('saveDmsConfig - Live mode sends checkIntervalMinutes for sub-day intervals (PS-91)', async () => {
  const originalFetch = globalThis.fetch;
  let putBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return json({
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'MONITORING',
        checkIntervalDays: null,
        checkIntervalMinutes: 720,
        gracePeriodDays: 1,
        lastCheckInAt: '2026-10-15T00:00:00Z',
        nextCheckAt: '2026-10-15T12:00:00Z',
      });
    }
    return json({});
  };

  try {
    const res = await saveDmsConfig(
      { days: 0, hours: 12, minutes: 0 },
      { isDevPreview: false, accessToken: 'real-token', lang: 'vi' }
    );
    assert.equal(res.checkIntervalDays, null);
    assert.equal(res.checkIntervalHours, 12);
    assert.equal(res.checkIntervalMinutes, 0);
    assert.equal(res.checkIntervalTotalMinutes, 720);
    assert.deepEqual(putBody, { checkIntervalMinutes: 720 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('saveDmsConfig - Live mode sends checkIntervalMinutes for combined days, hours, and minutes', async () => {
  const originalFetch = globalThis.fetch;
  let putBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return json({
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'MONITORING',
        checkIntervalDays: null,
        checkIntervalMinutes: 1590,
        gracePeriodDays: 1,
        lastCheckInAt: '2026-10-15T00:00:00Z',
        nextCheckAt: '2026-10-16T02:30:00Z',
      });
    }
    return json({});
  };

  try {
    const res = await saveDmsConfig(
      { days: 1, hours: 2, minutes: 30 },
      { isDevPreview: false, accessToken: 'real-token', lang: 'vi' }
    );
    assert.equal(res.checkIntervalDays, null);
    assert.equal(res.days, 1);
    assert.equal(res.hours, 2);
    assert.equal(res.minutes, 30);
    assert.equal(res.checkIntervalTotalMinutes, 1590);
    assert.deepEqual(putBody, { checkIntervalMinutes: 1590 });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('formatDmsInterval - formats raw subday minutes', () => {
  const res = formatDmsInterval({
    checkIntervalDays: null,
    checkIntervalMinutes: 90,
  }, 'vi');
  assert.equal(res, '1 giờ 30 phút');
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
    checkIntervalMinutes: 43200,
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

test('DMS UI - Successfully saves sub-day interval in live mode and updates state', async () => {
  const originalFetch = globalThis.fetch;
  let putBody = null;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      putBody = JSON.parse(options.body);
      return json({
        ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        status: 'MONITORING',
        checkIntervalDays: null,
        checkIntervalMinutes: 720,
        gracePeriodDays: 1,
        lastCheckInAt: '2026-10-15T00:00:00Z',
        nextCheckAt: '2026-10-15T12:00:00Z',
      });
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

    // Submit
    const form = host.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Verify PUT body sent checkIntervalMinutes: 720
    assert.deepEqual(putBody, { checkIntervalMinutes: 720 });

    // Success banner displayed and values preserved
    const bannerSuccess = host.querySelector('.lv-dms-banner-success');
    assert.ok(bannerSuccess, 'Success banner should be shown');
    assert.equal(daysInput.value, '0');
    assert.equal(hoursInput.value, '12');
  } finally {
    await act(async () => root.unmount());
    host.remove();
    globalThis.fetch = originalFetch;
  }
});

test('DMS UI - Preserves draft on server error and displays error banner', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url, options = {}) => {
    if (options.method === 'PUT') {
      return json({ code: 'VAULT_NOT_EDITABLE', message: 'Kho không thể sửa' }, 409);
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

    // Submit
    const form = host.querySelector('form');
    await act(async () => {
      form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
    });

    // Error banner should be displayed and draft preserved
    const bannerError = host.querySelector('.lv-dms-banner-error');
    assert.ok(bannerError, 'Error banner should be shown');
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

const receipt = { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'MONITORING', gracePeriodDays: 1, nextCheckAt: '2026-11-14T00:00:00Z' };
test('readDms validates exact minute/day relationship and preserves legacy history', () => {
  for (const total of [1,59,60,90,1440,1590,259200,260640]) {
    const days = total % 1440 === 0 ? total / 1440 : null;
    const result = readDms({...receipt, checkIntervalDays: days, checkIntervalMinutes: total});
    assert.equal(result.checkIntervalTotalMinutes, total);
    assert.equal(result.days*1440+result.hours*60+result.minutes,total);
  }
  assert.equal(readDms({...receipt,checkIntervalDays:181}).checkIntervalTotalMinutes,260640);
  for (const value of ['90',-1,0,1.5,null,undefined,Infinity,Number.MAX_SAFE_INTEGER+1]) {
    assert.throws(()=>readDms({...receipt,checkIntervalDays:30,checkIntervalMinutes:value}),{code:'INVALID_RESPONSE'});
  }
  for (const bad of [
    {checkIntervalDays:30,checkIntervalMinutes:90},
    {checkIntervalDays:null,checkIntervalMinutes:1440},
    {checkIntervalMinutes:90},
    {checkIntervalDays:2,checkIntervalMinutes:1440},
    {checkIntervalDays:0},{checkIntervalDays:'30'},{}
  ]) assert.throws(()=>readDms({...receipt,...bad}),{code:'INVALID_RESPONSE'});
});
test('DMS UI hides obsolete backend warning for subday inputs in both languages', async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async()=>json({...receipt,checkIntervalDays:null,checkIntervalMinutes:90});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {for(const lang of ['vi','en']) {await act(async()=>{root.render(React.createElement(DMSOverviewPage,{accessToken:'synthetic',lang}));});
 assert.equal(host.querySelector('.lv-dms-subday-notice'),null);
 assert.doesNotMatch(host.textContent,/máy chủ chưa hỗ trợ|demo-only pending server support|awaiting backend support/i);
 assert.equal(host.querySelector('#dms-interval-hours-input').value,'1');
 assert.equal(host.querySelector('#dms-interval-minutes-input').value,'30');
 }} finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;}
});

test('DMS UI rejects malformed successful save receipt and keeps draft without success', async()=>{
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(_url,options={})=>json(options.method==='PUT'
   ? {...receipt,checkIntervalDays:30,checkIntervalMinutes:90}
   : {...receipt,checkIntervalDays:30,checkIntervalMinutes:43200});
 const host=document.createElement('div');document.body.append(host);const root=createRoot(host);
 try {
 await act(async()=>root.render(React.createElement(DMSOverviewPage,{accessToken:'synthetic',lang:'vi'})));
 const days=host.querySelector('#dms-interval-input');const hours=host.querySelector('#dms-interval-hours-input');
 await act(async()=>{setInputValue(days,'0');setInputValue(hours,'12');});
 await act(async()=>host.querySelector('form').dispatchEvent(new dom.window.Event('submit',{bubbles:true,cancelable:true})));
 assert.equal(host.querySelector('.lv-dms-banner-success'),null);
 assert.ok(host.querySelector('.lv-dms-banner-error'));
 assert.equal(days.value,'0');assert.equal(hours.value,'12');
 } finally {await act(async()=>root.unmount());host.remove();globalThis.fetch=originalFetch;}
});
