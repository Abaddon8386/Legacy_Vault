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
  canAccessBeneficiaryConfirmation,
  validateBeneficiaryConfirmationForm,
  computeBeneficiaryConfirmationStatus,
  BENEFICIARY_CONFIRMATION_ERROR_KEYS,
  BENEFICIARY_CONFIRM_STATUS,
} from './beneficiaryConfirmationValidation.js';
import { beneficiaryConfirmationI18n } from '../pages/staff/beneficiaryConfirmationI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/staff/beneficiary-confirmation?preview=true',
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

// Helper cập nhật input/select cho React trong JSDOM
function changeInput(element, value) {
  if (!element) return;
  const isSelect = element.tagName === 'SELECT';
  const prototype = isSelect
    ? dom.window.HTMLSelectElement.prototype
    : dom.window.HTMLInputElement.prototype;
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
    element.dispatchEvent(new dom.window.Event(isSelect ? 'change' : 'input', { bubbles: true, cancelable: true }));
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

const componentMod = await loadComponentModule('src/pages/staff/BeneficiaryConfirmationPage.jsx');
const BeneficiaryConfirmationPage = componentMod.default;

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

test('PS-54 Route & Client Role Guard', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessBeneficiaryConfirmation(null), false);
    assert.equal(canAccessBeneficiaryConfirmation(undefined), false);
    assert.equal(
      canAccessBeneficiaryConfirmation({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      false
    );
  });

  await t.test('rejects access when user lacks STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessBeneficiaryConfirmation({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
    assert.equal(
      canAccessBeneficiaryConfirmation({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['LEGAL_VERIFIER'] },
      }),
      false
    );
  });

  await t.test('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessBeneficiaryConfirmation({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      true
    );
  });

  await t.test('grants access when user holds multi-roles including STAFF_EXECUTOR', () => {
    assert.equal(
      canAccessBeneficiaryConfirmation({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] },
      }),
      true
    );
  });
});

test('PS-54 AC-aligned Form Validation with Receipt / Reference', async (t) => {
  await t.test('accepts valid beneficiaryId and receiptReference', () => {
    const res = validateBeneficiaryConfirmationForm({
      beneficiaryId: 'ben-01',
      receiptReference: 'REC-2026-0891',
    });
    assert.equal(res.isValid, true);
    assert.equal(Object.keys(res.errors).length, 0);
  });

  await t.test('fails when beneficiaryId is missing or whitespace-only', () => {
    const resEmpty = validateBeneficiaryConfirmationForm({
      beneficiaryId: '',
      receiptReference: 'REC-2026-0891',
    });
    assert.equal(resEmpty.isValid, false);
    assert.equal(resEmpty.errors.beneficiaryId, BENEFICIARY_CONFIRMATION_ERROR_KEYS.BENEFICIARY_REQUIRED);

    const resWhitespace = validateBeneficiaryConfirmationForm({
      beneficiaryId: '   ',
      receiptReference: 'REC-2026-0891',
    });
    assert.equal(resWhitespace.isValid, false);
    assert.equal(resWhitespace.errors.beneficiaryId, BENEFICIARY_CONFIRMATION_ERROR_KEYS.BENEFICIARY_REQUIRED);
  });

  await t.test('fails when receiptReference is missing or whitespace-only', () => {
    const resEmpty = validateBeneficiaryConfirmationForm({
      beneficiaryId: 'ben-01',
      receiptReference: '',
    });
    assert.equal(resEmpty.isValid, false);
    assert.equal(resEmpty.errors.receiptReference, BENEFICIARY_CONFIRMATION_ERROR_KEYS.RECEIPT_REFERENCE_REQUIRED);

    const resWhitespace = validateBeneficiaryConfirmationForm({
      beneficiaryId: 'ben-01',
      receiptReference: '   ',
    });
    assert.equal(resWhitespace.isValid, false);
    assert.equal(resWhitespace.errors.receiptReference, BENEFICIARY_CONFIRMATION_ERROR_KEYS.RECEIPT_REFERENCE_REQUIRED);
  });

  await t.test('fails when beneficiary is already confirmed', () => {
    const res = validateBeneficiaryConfirmationForm({
      beneficiaryId: 'ben-01',
      receiptReference: 'REC-2026-0891',
      currentStatus: BENEFICIARY_CONFIRM_STATUS.CONFIRMED,
    });
    assert.equal(res.isValid, false);
    assert.equal(res.errors.currentStatus, BENEFICIARY_CONFIRMATION_ERROR_KEYS.ALREADY_CONFIRMED);
  });
});

test('PS-54 Independent Confirmation Rule & Missing Data Distinction', async (t) => {
  await t.test('asset delivery DELIVERED does NOT automatically confirm beneficiary', () => {
    const result = computeBeneficiaryConfirmationStatus('DELIVERED', BENEFICIARY_CONFIRM_STATUS.PENDING);
    assert.equal(result, BENEFICIARY_CONFIRM_STATUS.PENDING);
  });

  await t.test('missing confirmation data returns null, NOT fabricated PENDING', () => {
    assert.equal(computeBeneficiaryConfirmationStatus('DELIVERED', null), null);
    assert.equal(computeBeneficiaryConfirmationStatus('DELIVERED', undefined), null);
    assert.equal(computeBeneficiaryConfirmationStatus('PENDING', null), null);
    assert.equal(computeBeneficiaryConfirmationStatus('PENDING', undefined), null);
  });

  await t.test('confirmed beneficiary preserves CONFIRMED status regardless of delivery status', () => {
    assert.equal(computeBeneficiaryConfirmationStatus('DELIVERED', BENEFICIARY_CONFIRM_STATUS.CONFIRMED), BENEFICIARY_CONFIRM_STATUS.CONFIRMED);
    assert.equal(computeBeneficiaryConfirmationStatus('PENDING', BENEFICIARY_CONFIRM_STATUS.CONFIRMED), BENEFICIARY_CONFIRM_STATUS.CONFIRMED);
  });
});

test('PS-54 Dynamic Language Switching (VI <-> EN)', () => {
  const vi = beneficiaryConfirmationI18n.vi;
  const en = beneficiaryConfirmationI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  // Validate error key translation
  assert.ok(vi[BENEFICIARY_CONFIRMATION_ERROR_KEYS.BENEFICIARY_REQUIRED]);
  assert.ok(en[BENEFICIARY_CONFIRMATION_ERROR_KEYS.BENEFICIARY_REQUIRED]);
  assert.ok(vi[BENEFICIARY_CONFIRMATION_ERROR_KEYS.RECEIPT_REFERENCE_REQUIRED]);
  assert.ok(en[BENEFICIARY_CONFIRMATION_ERROR_KEYS.RECEIPT_REFERENCE_REQUIRED]);
  assert.ok(vi[BENEFICIARY_CONFIRMATION_ERROR_KEYS.ALREADY_CONFIRMED]);
  assert.ok(en[BENEFICIARY_CONFIRMATION_ERROR_KEYS.ALREADY_CONFIRMED]);

  // Validate unavailable notice without internal details
  assert.equal(vi.unavailableNotice, 'Chức năng hiện chưa khả dụng');
  assert.equal(en.unavailableNotice, 'This function is currently unavailable.');

  // Validate unknown status
  assert.equal(vi.statusUnknown, 'Chưa có thông tin');
  assert.equal(en.statusUnknown, 'Information not available');
});

test('PS-54 CSS Scoping Verification - No Leakage', () => {
  const cssPath = path.resolve(__dirname, '../pages/staff/BeneficiaryConfirmationPage.css');
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
          s.startsWith('.lv-beneficiary-confirmation-view'),
          `Selector "${s}" in BeneficiaryConfirmationPage.css must start with .lv-beneficiary-confirmation-view`
        );
      }
    }
  }
});

test('PS-54 Component Regression: Case Switching Isolation & Stale Response Discard', async (t) => {
  const FIXTURE_CASE_A = [
    {
      id: 'ben-a-01',
      fullName: 'Nguyen Van A',
      relationship: 'Con trai',
      deliveryStatus: 'DELIVERED',
      confirmationStatus: BENEFICIARY_CONFIRM_STATUS.PENDING,
      receiptReference: 'REC-A-001',
    },
  ];

  const FIXTURE_CASE_B = [
    {
      id: 'ben-b-01',
      fullName: 'Tran Thi B',
      relationship: 'Vợ',
      deliveryStatus: 'PENDING',
      confirmationStatus: BENEFICIARY_CONFIRM_STATUS.PENDING,
      receiptReference: 'REC-B-002',
    },
  ];

  await t.test('switching case via input wipes case A data, selections, receipts, errors and locks recording until B has data', async () => {
    const wrapper = await mount(BeneficiaryConfirmationPage, {
      caseReference: 'CASE-A',
      initialBeneficiaries: FIXTURE_CASE_A,
    });

    try {
      // 1. Case A renders with data
      assert.ok(wrapper.host.textContent.includes('Nguyen Van A'));
      assert.ok(wrapper.host.textContent.includes('REC-A-001'));

      const caseInput = wrapper.host.querySelector('.lv-confirm-case-bar input');
      const benSelect = wrapper.host.querySelector('.lv-confirm-select');
      const receiptInput = wrapper.host.querySelector('.lv-confirm-input[placeholder*="BN-2026"]');
      const submitBtn = wrapper.host.querySelector('.lv-btn-record-submit');

      assert.ok(caseInput, 'Case input must exist');
      assert.equal(caseInput.value, 'CASE-A');

      // Select beneficiary and type receipt
      await act(async () => {
        changeInput(benSelect, 'ben-a-01');
        changeInput(receiptInput, 'REC-TYPED-123');
      });

      assert.equal(benSelect.value, 'ben-a-01');
      assert.equal(receiptInput.value, 'REC-TYPED-123');

      // 2. Switch case A -> B via input without clearing to whitespace first
      await act(async () => {
        changeInput(caseInput, 'CASE-B');
      });

      // VERIFY: All of Case A's data must disappear immediately
      assert.equal(wrapper.host.textContent.includes('Nguyen Van A'), false, 'Case A beneficiary must NOT remain');
      assert.equal(wrapper.host.textContent.includes('REC-A-001'), false, 'Case A receipt must NOT remain');
      assert.equal(benSelect.value, '', 'Selected beneficiary must be reset');
      assert.equal(benSelect.disabled, true, 'Beneficiary select must be disabled when B has no data');
      assert.equal(receiptInput.value, '', 'Receipt input must be reset');
      assert.equal(receiptInput.disabled, true, 'Receipt input must be disabled when B has no data');
      assert.equal(submitBtn.disabled, true, 'Submit button must be disabled/locked');

      // Notice displays "Chưa có thông tin"
      assert.ok(
        wrapper.host.textContent.includes('Chưa có thông tin'),
        'Must display "Chưa có thông tin" when Case B has no data'
      );
    } finally {
      await wrapper.close();
    }
  });

  await t.test('switching case via props wipes case A and correctly displays valid case B data', async () => {
    const wrapper = await mount(BeneficiaryConfirmationPage, {
      caseId: 'CASE-A',
      beneficiaries: FIXTURE_CASE_A,
    });

    try {
      assert.ok(wrapper.host.textContent.includes('Nguyen Van A'));

      // Switch to B without data yet
      await wrapper.render({
        caseId: 'CASE-B',
        beneficiaries: null,
      });

      assert.equal(wrapper.host.textContent.includes('Nguyen Van A'), false);
      assert.ok(wrapper.host.textContent.includes('Chưa có thông tin'));

      const submitBtn = wrapper.host.querySelector('.lv-btn-record-submit');
      assert.equal(submitBtn.disabled, true);

      // Now valid B data arrives
      await wrapper.render({
        caseId: 'CASE-B',
        beneficiaries: FIXTURE_CASE_B,
      });

      assert.ok(wrapper.host.textContent.includes('Tran Thi B'));
      assert.equal(wrapper.host.textContent.includes('Nguyen Van A'), false);
      assert.ok(wrapper.host.textContent.includes('REC-B-002'));
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
          resolveCaseA = () => resolve(FIXTURE_CASE_A);
        });
      }
      if (caseId === 'CASE-B') {
        return new Promise((resolve) => {
          resolveCaseB = () => resolve(FIXTURE_CASE_B);
        });
      }
      return Promise.resolve([]);
    };

    const wrapper = await mount(BeneficiaryConfirmationPage, {
      onFetchBeneficiaries: fakeFetcher,
    });

    try {
      const caseInput = wrapper.host.querySelector('.lv-confirm-case-bar input');

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
        resolveCaseA();
      });

      // VERIFY: Case A's data MUST NOT be accepted into state or DOM
      assert.equal(wrapper.host.textContent.includes('Nguyen Van A'), false, 'Stale response from Case A must be discarded');

      // 4. Case B resolves
      await act(async () => {
        resolveCaseB();
      });

      // VERIFY: Case B's data is rendered
      assert.ok(wrapper.host.textContent.includes('Tran Thi B'), 'Case B data should render');
      assert.equal(wrapper.host.textContent.includes('Nguyen Van A'), false, 'Case A data must still be absent');
    } finally {
      await wrapper.close();
    }
  });
});

test('live confirmation DTOs are joined to recipient names and delivery metadata', async () => {
  const originalFetch = globalThis.fetch;
  const caseId = '11111111-1111-4111-8111-111111111111';
  const sessionId = '22222222-2222-4222-8222-222222222222';
  const recipients = [
    {beneficiaryId: '33333333-3333-4333-8333-333333333333', fullName: 'Nguyễn Gia Linh', relationship: 'Con gái'},
    {beneficiaryId: '44444444-4444-4444-8444-444444444444', fullName: 'Nguyễn Gia Bảo', relationship: 'Con trai'},
  ];
  globalThis.fetch = async url => {
    const data = url.endsWith('/beneficiaries') ? recipients
      : url.endsWith('/eligible-assets') ? recipients.map(person => ({recipientId: person.beneficiaryId, deliveryStatus: 'DELIVERED'}))
      : recipients.map(person => ({beneficiaryId: person.beneficiaryId, sessionId, status: 'PENDING'}));
    return new Response(JSON.stringify(data), {headers: {'Content-Type': 'application/json'}});
  };
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const wrapper = await mount(BeneficiaryConfirmationPage, {caseId, sessionId, accessToken: 'synthetic', lang: 'vi'});
  try {
    const options = [...wrapper.host.querySelectorAll('select option')].map(option => option.textContent);
    assert.ok(options.some(label => label.includes('Nguyễn Gia Linh')));
    assert.ok(options.some(label => label.includes('Nguyễn Gia Bảo')));
    assert.equal(options.filter(label => label.includes('Chưa có thông tin')).length, 0);
    assert.ok(wrapper.host.textContent.includes('Con gái'));
    await act(async () => {
      changeInput(wrapper.host.querySelector('.lv-confirm-select'), recipients[0].beneficiaryId);
      changeInput(wrapper.host.querySelector('input[placeholder*="BN-"]'), 'BN-DEMO-001');
    });
    assert.equal(wrapper.host.querySelector('.lv-btn-record-submit').disabled, false);
  } finally { await wrapper.close(); globalThis.fetch = originalFetch; }
});

test('closed archived case offers history instead of an unusable confirmation form', async () => {
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const wrapper = await mount(BeneficiaryConfirmationPage, {
    caseId: 'CASE-CLOSED', sessionId: 'SESSION-CLOSED', lang: 'vi',
    caseItem: {caseId: 'CASE-CLOSED', status: 'CLOSED', vaultStatus: 'ARCHIVED'},
  });
  try {
    assert.ok(wrapper.host.textContent.includes('Hồ sơ đã đóng'));
    assert.equal(wrapper.host.querySelector('.lv-btn-record-submit'), null);
    assert.ok(wrapper.host.querySelector('a[href*="close-and-archive"]'));
  } finally { await wrapper.close(); }
});

test('missing confirmation data shows a readable error and retry recovers selection', async () => {
  let attempts = 0;
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const wrapper = await mount(BeneficiaryConfirmationPage, {
    caseId: 'CASE-A', lang: 'vi',
    onFetchBeneficiaries: async () => {
      attempts += 1;
      if (attempts === 1) throw Object.assign(new Error('RESOURCE_NOT_FOUND'), {status: 404});
      return [{beneficiaryId: 'BEN-A', fullName: 'Nguyen Van A', confirmationStatus: 'PENDING'}];
    },
  });
  try {
    assert.equal(wrapper.host.textContent.includes('RESOURCE_NOT_FOUND'), false);
    assert.ok(wrapper.host.textContent.includes('Không tải được'));
    assert.equal(wrapper.host.querySelector('.lv-btn-record-submit'), null);
    const retry = [...wrapper.host.querySelectorAll('button')].find(button => button.textContent === 'Thử lại');
    await act(async () => retry.click());
    assert.ok(wrapper.host.textContent.includes('Nguyen Van A'));
    assert.equal(wrapper.host.querySelector('.lv-confirm-select').disabled, false);
  } finally { await wrapper.close(); }
});

test('never shows simultaneous session load error and missing session business card', async () => {
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const originalFetch = globalThis.fetch;
  const mockCaseUuid = '06eb6e23-1ae4-4db7-93ec-35110ad011f3';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/handover-sessions')) {
      return {
        ok: false,
        status: 500,
        json: async () => ({ code: 'INTERNAL_ERROR', message: 'Database connection failed' }),
      };
    }
    return { ok: true, status: 200, json: async () => ({ content: [] }) };
  };

  try {
    const wrapper = await mount(BeneficiaryConfirmationPage, {
      caseId: 'HS-2026-000002',
      caseItem: { caseId: mockCaseUuid, caseNumber: 'HS-2026-000002', status: 'OPEN' },
      accessToken: 'valid-mock-token',
      lang: 'vi',
    });

    try {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 20));
      });

      // Must show session load error
      assert.ok(wrapper.host.textContent.includes('Không tải được danh sách phiên bàn giao'));
      // Must have retry button
      const retryBtn = [...wrapper.host.querySelectorAll('button')].find(b => b.textContent.includes('Thử lại'));
      assert.ok(retryBtn, 'Retry button must exist for session load failure');
      // Crucial requirement: MUST NOT show "Chưa có thông tin phiên bàn giao" business card when fetch failed
      assert.equal(
        wrapper.host.textContent.includes('Chưa có thông tin phiên bàn giao'),
        false,
        'Must never show "Chưa có thông tin phiên bàn giao" simultaneously with session load error'
      );
      assert.equal(
        wrapper.host.textContent.includes('Vui lòng chọn hồ sơ xác minh và mở phiên bàn giao'),
        false,
        'Must never ask user to select case again when case is already selected'
      );
    } finally {
      await wrapper.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('when case has no eligible sessions, directs to counter handover without asking to re-select case', async () => {
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const originalFetch = globalThis.fetch;
  const mockCaseUuid = '06eb6e23-1ae4-4db7-93ec-35110ad011f3';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/handover-sessions')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [],
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ content: [] }),
    };
  };

  try {
    const wrapper = await mount(BeneficiaryConfirmationPage, {
      caseId: 'HS-2026-000002',
      caseItem: { caseId: mockCaseUuid, caseNumber: 'HS-2026-000002', status: 'OPEN' },
      accessToken: 'valid-mock-token',
      lang: 'vi',
    });

    try {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 40));
      });

      // Shows State 4: No session available
      assert.ok(wrapper.host.textContent.includes('Chưa có phiên bàn giao phù hợp'));
      // Directs to handover with caseId
      const handoverLink = wrapper.host.querySelector('a[href*="/staff/handover?caseId=HS-2026-000002"]');
      assert.ok(handoverLink, 'Must direct to /staff/handover?caseId=HS-2026-000002');
      // Must not ask to re-select case
      assert.equal(
        wrapper.host.textContent.includes('Vui lòng chọn hồ sơ xác minh và mở phiên bàn giao'),
        false
      );
    } finally {
      await wrapper.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('when sessions are successfully loaded, renders session picker with formatted options', async () => {
  window.history.replaceState({}, '', '/staff/beneficiary-confirmation');
  const originalFetch = globalThis.fetch;
  const mockCaseUuid = '06eb6e23-1ae4-4db7-93ec-35110ad011f3';
  const mockSessionUuid = 'fe59e5ed-a842-45ab-b798-98cdda164ceb';
  globalThis.fetch = async (url) => {
    if (String(url).includes('/handover-sessions')) {
      return {
        ok: true,
        status: 200,
        headers: new Headers({ 'content-type': 'application/json' }),
        json: async () => [
          {
            sessionId: mockSessionUuid,
            caseId: mockCaseUuid,
            vaultId: '9c1f0b6e-0000-4000-8000-000000000001',
            staffId: '2e52b115-9e13-4760-9062-caa3ad085449',
            status: 'OPEN',
            openedAt: '2026-10-23T11:00:00Z',
            closedAt: null,
          },
        ],
      };
    }
    return {
      ok: true,
      status: 200,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ content: [] }),
    };
  };

  try {
    const wrapper = await mount(BeneficiaryConfirmationPage, {
      caseId: 'HS-2026-000002',
      caseItem: { caseId: mockCaseUuid, caseNumber: 'HS-2026-000002', status: 'OPEN' },
      accessToken: 'valid-mock-token',
      lang: 'vi',
    });

    try {
      await act(async () => {
        await new Promise((r) => setTimeout(r, 30));
      });

      const select = wrapper.host.querySelector('#lv-confirm-session-select');
      assert.ok(select, 'Session select dropdown must exist');
      assert.ok(select.options.length >= 2, 'Must have placeholder and session option');
      assert.ok(select.textContent.includes('Đang mở'));
    } finally {
      await wrapper.close();
    }
  } finally {
    globalThis.fetch = originalFetch;
  }
});
