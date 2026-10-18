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
