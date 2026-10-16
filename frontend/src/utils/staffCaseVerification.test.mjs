import test from 'node:test';
import assert from 'node:assert/strict';
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { JSDOM } from 'jsdom';
import { build } from 'vite';
import react from '@vitejs/plugin-react';

import {
  validateVerificationForm,
  submitIdentityVerification,
  fetchCaseBeneficiaries,
  fetchVerificationHistory,
  validateVerificationReceipt,
  SYNTHETIC_STAFF_CASES,
  SYNTHETIC_BENEFICIARIES_BY_CASE,
} from '../pages/staff/staffCaseService.js';
import { getStaffCaseTranslations } from '../pages/staff/staffCaseI18n.js';

// Setup JSDOM
const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://localhost:5195/staff/cases?preview=true',
  pretendToBeVisual: true,
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.HTMLElement = dom.window.HTMLElement;
globalThis.Element = dom.window.Element;
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
  if (element._valueTracker) {
    element._valueTracker.setValue('');
  }
  element.dispatchEvent(new dom.window.Event(isSelect ? 'change' : 'input', { bubbles: true }));
  element.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
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

const verifyMod = await loadComponentModule('src/pages/staff/StaffCaseVerificationPage.jsx');
const StaffCaseVerificationPage = verifyMod.default;

const dashboardMod = await loadComponentModule('src/pages/staff/StaffCaseDashboard.jsx');
const StaffCaseDashboard = dashboardMod.default;

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

// ============================================================================
// TESTS: Validation Logic (PS-27 / PS-45)
// ============================================================================

test('PS-27 Validation: Valid form passes with minimal required fields (documentType, result)', () => {
  const res = validateVerificationForm({
    documentType: 'CCCD',
    result: 'MATCH',
  }, 'vi');
  assert.equal(res.isValid, true);
  assert.deepEqual(res.errors, {});
});

test('PS-27 Validation: Valid form passes with passport and optional fields', () => {
  const res = validateVerificationForm({
    documentType: 'PASSPORT',
    result: 'NOT_MATCH',
    documentSuffix: '99AB',
    issuingAuthority: 'Cục Cảnh sát QLHC về TTXH',
  }, 'vi');
  assert.equal(res.isValid, true);
  assert.deepEqual(res.errors, {});
});

test('PS-27 Validation: Rejects missing documentType and missing result with locale messages', () => {
  const resVi = validateVerificationForm({}, 'vi');
  assert.equal(resVi.isValid, false);
  assert.ok(resVi.errors.documentType);
  assert.ok(resVi.errors.result);

  const resEn = validateVerificationForm({ documentType: '', result: '' }, 'en');
  assert.equal(resEn.isValid, false);
  assert.equal(resEn.errors.documentType, 'Please select a credential type.');
  assert.equal(resEn.errors.result, 'Please select a cross-check result (MATCH or NOT_MATCH).');
});

test('PS-27 Validation: Rejects invalid enum values', () => {
  const res = validateVerificationForm({
    documentType: 'DRIVER_LICENSE',
    result: 'MAYBE',
  }, 'vi');
  assert.equal(res.isValid, false);
  assert.ok(res.errors.documentType);
  assert.ok(res.errors.result);
});

test('PS-27 Validation: Rejects full CCCD/passport number (e.g. 12 digits), enforces exactly 4 alphanumeric chars for documentSuffix', () => {
  // Full 12-digit CCCD must be rejected (security rule LV-ID-001)
  const resFull = validateVerificationForm({
    documentType: 'CCCD',
    result: 'MATCH',
    documentSuffix: '079201001234',
  }, 'vi');
  assert.equal(resFull.isValid, false);
  assert.ok(resFull.errors.documentSuffix);

  // 3 characters must be rejected
  const resShort = validateVerificationForm({
    documentType: 'CCCD',
    result: 'MATCH',
    documentSuffix: '123',
  }, 'vi');
  assert.equal(resShort.isValid, false);
  assert.ok(resShort.errors.documentSuffix);

  // Special characters must be rejected
  const resSpecial = validateVerificationForm({
    documentType: 'CCCD',
    result: 'MATCH',
    documentSuffix: '12-4',
  }, 'vi');
  assert.equal(resSpecial.isValid, false);
  assert.ok(resSpecial.errors.documentSuffix);
});

test('PS-27 Validation: Rejects issuingAuthority exceeding 150 characters', () => {
  const longAuth = 'A'.repeat(151);
  const res = validateVerificationForm({
    documentType: 'CCCD',
    result: 'MATCH',
    issuingAuthority: longAuth,
  }, 'vi');
  assert.equal(res.isValid, false);
  assert.ok(res.errors.issuingAuthority);
});

// ============================================================================
// TESTS: Service & Adapter Layer (PS-27 / PS-45)
// ============================================================================

test('PS-27 Service: fetchCaseBeneficiaries in preview returns mapped beneficiaries', async () => {
  const result = await fetchCaseBeneficiaries('case-001', { isDevPreview: true });
  assert.equal(result.isSimulation, true);
  assert.equal(result.caseId, 'case-001');
  assert.ok(result.beneficiaries.length >= 2);
  assert.equal(result.beneficiaries[0].fullName, 'Trần Minh Quang');
});

test('PS-27 Service: fetchCaseBeneficiaries in live mode strictly throws BACKEND_NOT_READY (503)', async () => {
  await assert.rejects(
    async () => {
      await fetchCaseBeneficiaries('case-001', { accessToken: 'real-token' });
    },
    (err) => err.code === 'BACKEND_NOT_READY' && err.status === 503
  );
});

test('PS-27 Service: submitIdentityVerification requires beneficiaryId', async () => {
  await assert.rejects(
    async () => {
      await submitIdentityVerification('', { documentType: 'CCCD', result: 'MATCH' }, { isDevPreview: true });
    },
    (err) => err.code === 'MISSING_BENEFICIARY_ID'
  );
});

test('PS-27 Service: submitIdentityVerification in live mode strictly throws BACKEND_NOT_READY (503)', async () => {
  await assert.rejects(
    async () => {
      await submitIdentityVerification(
        'ben-001-1',
        { documentType: 'CCCD', result: 'MATCH' },
        { accessToken: 'real-token' }
      );
    },
    (err) => err.code === 'BACKEND_NOT_READY' && err.status === 503
  );
});

test('PS-27 Service: submitIdentityVerification in preview returns valid receipt and updates history without caseId or actorId in request', async () => {
  const receipt = await submitIdentityVerification(
    'ben-001-1',
    { documentType: 'CCCD', result: 'MATCH', documentSuffix: '1234' },
    { isDevPreview: true, isTest: true }
  );

  assert.equal(receipt.beneficiaryId, 'ben-001-1');
  assert.equal(receipt.documentType, 'CCCD');
  assert.equal(receipt.result, 'MATCH');
  assert.equal(receipt.documentSuffix, '1234');
  assert.equal(receipt.isSimulation, true);
  assert.ok(receipt.id);
  assert.ok(receipt.verifiedAt);

  // Verification history now contains this record
  const historyRes = await fetchVerificationHistory('ben-001-1', { isDevPreview: true, isTest: true });
  assert.ok(historyRes.history.some((h) => h.id === receipt.id));
});

test('PS-27 Service: validateVerificationReceipt enforces simulation guard, timestamp, and matching beneficiaryId', () => {
  const valid = {
    id: 'ver-123',
    beneficiaryId: 'ben-001-1',
    documentType: 'CCCD',
    result: 'MATCH',
    verifiedAt: '2026-10-16T08:00:00Z',
    isSimulation: true,
  };

  const parsed = validateVerificationReceipt(valid, 'ben-001-1', { isDevPreview: true });
  assert.equal(parsed.id, 'ver-123');

  // Mismatched beneficiaryId
  assert.throws(
    () => validateVerificationReceipt(valid, 'ben-different', { isDevPreview: true }),
    (err) => err.code === 'INVALID_RECEIPT'
  );

  // Missing timestamp
  assert.throws(
    () => validateVerificationReceipt({ ...valid, verifiedAt: 'invalid' }, 'ben-001-1', { isDevPreview: true }),
    (err) => err.code === 'INVALID_RECEIPT'
  );

  // Live context rejects simulation receipt
  assert.throws(
    () => validateVerificationReceipt(valid, 'ben-001-1', { accessToken: 'real-token' }),
    (err) => err.code === 'INVALID_RECEIPT'
  );
});

// ============================================================================
// TESTS: Component UI & Interactions (PS-27)
// ============================================================================

test('PS-27 Component: Missing case context renders safe fallback without submit form', async () => {
  const app = await mount(StaffCaseVerificationPage, {
    caseItem: null,
    isDevPreview: true,
  });

  const card = app.host.querySelector('.lv-verify-state-card');
  assert.ok(card, 'Must render fallback card when caseItem is null');
  assert.equal(app.host.querySelector('form'), null, 'Form must not be rendered without case');

  await app.close();
});

test('PS-27 Component: Renders 4 sections and requires staff to select a beneficiary before form is active', async () => {
  const sampleCase = SYNTHETIC_STAFF_CASES[0];
  const app = await mount(StaffCaseVerificationPage, {
    caseItem: sampleCase,
    isDevPreview: true,
    loadBeneficiaries: async () => ({
      beneficiaries: [
        { id: 'ben-1', fullName: 'Trần Minh Quang', relationship: 'Con trai', hasIdentityNumber: true },
        { id: 'ben-2', fullName: 'Trần Thảo Ly', relationship: 'Con gái', hasIdentityNumber: true },
      ],
      isSimulation: true,
    }),
  });

  // Check section 1: Case info
  const contextGrid = app.host.querySelector('.lv-verify-context-grid');
  assert.ok(contextGrid.textContent.includes(sampleCase.caseNumber));
  assert.ok(contextGrid.textContent.includes(sampleCase.vaultName));

  // Check section 2: PS-39 physical delivery box
  const ps39Box = app.host.querySelector('.lv-verify-ps39-card');
  assert.ok(ps39Box, 'Must render PS-39 delivery record card');

  // Check section 3: Beneficiary cards
  const benCards = app.host.querySelectorAll('.lv-verify-ben-card');
  assert.equal(benCards.length, 2, 'Must render 2 beneficiary cards');

  // Prompt box before selection
  const promptBox = app.host.querySelector('.lv-verify-select-prompt-box');
  assert.ok(promptBox, 'Must prompt to select a beneficiary before form is active');
  assert.equal(app.host.querySelector('form'), null, 'Form must not be rendered before beneficiary selection');

  // Select first beneficiary
  await act(async () => {
    benCards[0].click();
  });

  // Now form should be rendered
  const form = app.host.querySelector('form');
  assert.ok(form, 'Form must be active after selecting beneficiary');
  assert.ok(form.textContent.includes('Trần Minh Quang'));

  await app.close();
});

test('PS-27 Component: Submitting invalid form shows inline field errors and blocks submission', async () => {
  const sampleCase = SYNTHETIC_STAFF_CASES[0];
  let submitCalled = false;

  const app = await mount(StaffCaseVerificationPage, {
    caseItem: sampleCase,
    isDevPreview: true,
    initialBeneficiaryId: 'ben-1',
    loadBeneficiaries: async () => ({
      beneficiaries: [{ id: 'ben-1', fullName: 'Trần Minh Quang', relationship: 'Con trai' }],
      isSimulation: true,
    }),
    onSubmitVerification: async () => {
      submitCalled = true;
    },
  });

  const form = app.host.querySelector('form');
  assert.ok(form);

  // Submit without selecting documentType and result
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });

  assert.equal(submitCalled, false, 'Must not call submission when fields are invalid');

  const errors = app.host.querySelectorAll('.lv-verify-error-text');
  assert.ok(errors.length >= 2, 'Must display inline errors for required fields');

  await app.close();
});

test('PS-27 Component: Successful submission displays receipt with result badge and updates history', async () => {
  const sampleCase = SYNTHETIC_STAFF_CASES[0];

  const app = await mount(StaffCaseVerificationPage, {
    caseItem: sampleCase,
    isDevPreview: true,
    initialBeneficiaryId: 'ben-1',
    loadBeneficiaries: async () => ({
      beneficiaries: [{ id: 'ben-1', fullName: 'Trần Minh Quang', relationship: 'Con trai' }],
      isSimulation: true,
    }),
    onSubmitVerification: async (benId, data) => ({
      id: 'ver-test-999',
      beneficiaryId: benId,
      documentType: data.documentType,
      result: data.result,
      documentSuffix: data.documentSuffix,
      issuingAuthority: data.issuingAuthority,
      verifiedAt: '2026-10-16T08:15:00Z',
      isSimulation: true,
    }),
  });

  // Select documentType: CCCD
  const cccdRadio = app.host.querySelector('input[name="documentType"][value="CCCD"]');
  await act(async () => {
    cccdRadio.click();
    cccdRadio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });

  // Select result: MATCH
  const matchRadio = app.host.querySelector('input[name="result"][value="MATCH"]');
  await act(async () => {
    matchRadio.click();
    matchRadio.dispatchEvent(new dom.window.Event('change', { bubbles: true }));
  });

  // Enter suffix: 1234
  const suffixInput = app.host.querySelector('#verify-suffix');
  await act(async () => {
    changeInput(suffixInput, '1234');
  });

  // Submit form
  const form = app.host.querySelector('form');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });

  // Success card must be rendered
  const successCard = app.host.querySelector('.lv-verify-success-card');
  assert.ok(successCard, 'Must render success card after submission');
  assert.ok(successCard.textContent.includes('ver-test-999'));
  assert.ok(successCard.textContent.includes('Trần Minh Quang'));
  assert.ok(successCard.textContent.includes('MATCH'));

  await app.close();
});

test('PS-27 Component: Switching beneficiary resets form and discards late response', async () => {
  const sampleCase = SYNTHETIC_STAFF_CASES[0];
  let resolveSubmit;
  const slowSubmitPromise = new Promise((resolve) => {
    resolveSubmit = resolve;
  });

  const app = await mount(StaffCaseVerificationPage, {
    caseItem: sampleCase,
    isDevPreview: true,
    initialBeneficiaryId: 'ben-1',
    loadBeneficiaries: async () => ({
      beneficiaries: [
        { id: 'ben-1', fullName: 'Trần Minh Quang' },
        { id: 'ben-2', fullName: 'Trần Thảo Ly' },
      ],
      isSimulation: true,
    }),
    onSubmitVerification: async (benId, data) => {
      await slowSubmitPromise;
      return {
        id: 'ver-late',
        beneficiaryId: benId,
        documentType: data.documentType,
        result: data.result,
        verifiedAt: '2026-10-16T08:20:00Z',
        isSimulation: true,
      };
    },
  });

  // Select CCCD and MATCH
  const cccdRadio = app.host.querySelector('input[name="documentType"][value="CCCD"]');
  await act(async () => {
    cccdRadio.click();
  });
  const matchRadio = app.host.querySelector('input[name="result"][value="MATCH"]');
  await act(async () => {
    matchRadio.click();
  });

  // Submit for ben-1 (starts in flight)
  const form = app.host.querySelector('form');
  act(() => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });

  // Now switch to ben-2 while request is in flight
  const benCards = app.host.querySelectorAll('.lv-verify-ben-card');
  await act(async () => {
    benCards[1].click();
  });

  // Now resolve the slow submit for ben-1
  await act(async () => {
    resolveSubmit();
  });

  // Success card must NOT be displayed because beneficiary was changed!
  const successCard = app.host.querySelector('.lv-verify-success-card');
  assert.equal(Boolean(successCard), false, 'Late response must be discarded after beneficiary change');

  // Form should now target ben-2
  const currentForm = app.host.querySelector('form');
  assert.ok(currentForm.textContent.includes('Trần Thảo Ly'));

  await app.close();
});

test('PS-27 Component: Error during submission preserves form data and enables retry', async () => {
  const sampleCase = SYNTHETIC_STAFF_CASES[0];
  let attempt = 0;

  const app = await mount(StaffCaseVerificationPage, {
    caseItem: sampleCase,
    isDevPreview: true,
    initialBeneficiaryId: 'ben-1',
    loadBeneficiaries: async () => ({
      beneficiaries: [{ id: 'ben-1', fullName: 'Trần Minh Quang' }],
      isSimulation: true,
    }),
    onSubmitVerification: async () => {
      attempt++;
      if (attempt === 1) {
        throw new Error('Network error simulation');
      }
      return {
        id: 'ver-retry-ok',
        beneficiaryId: 'ben-1',
        documentType: 'CCCD',
        result: 'MATCH',
        verifiedAt: '2026-10-16T08:25:00Z',
        isSimulation: true,
      };
    },
  });

  // Select CCCD & MATCH
  await act(async () => {
    app.host.querySelector('input[name="documentType"][value="CCCD"]').click();
    app.host.querySelector('input[name="result"][value="MATCH"]').click();
  });

  // Submit attempt 1 -> fails
  const form = app.host.querySelector('form');
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });

  // Error banner must be visible
  const errorBanner = app.host.querySelector('.lv-verify-error-banner');
  assert.ok(errorBanner, 'Error banner must be shown on failure');
  assert.equal(errorBanner.textContent.includes('Network error simulation'), false);

  // Form selections preserved
  assert.equal(app.host.querySelector('input[name="documentType"][value="CCCD"]').checked, true);
  assert.equal(app.host.querySelector('input[name="result"][value="MATCH"]').checked, true);

  // Submit attempt 2 -> succeeds
  await act(async () => {
    form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
  });

  const successCard = app.host.querySelector('.lv-verify-success-card');
  assert.ok(successCard);
  assert.ok(successCard.textContent.includes('ver-retry-ok'));

  await app.close();
});

test('PS-27 Integration: StaffCaseDashboard transitions between Dashboard, Intake (PS-26), and Verification (PS-27)', async () => {
  const app = await mount(StaffCaseDashboard, {
    isDevPreview: true,
    loadCases: async () => ({
      content: [SYNTHETIC_STAFF_CASES[0]],
      page: 0,
      size: 5,
      totalElements: 1,
      totalPages: 1,
      isSimulation: true,
    }),
  });

  // Dashboard table visible
  const verifyBtn = app.host.querySelector('.lv-staff-verify-btn');
  assert.ok(verifyBtn, 'Must render verify button in table row');

  // Click verify button -> transitions to PS-27 verification page
  await act(async () => {
    verifyBtn.click();
  });

  assert.ok(app.host.querySelector('.lv-verify-page'), 'Must transition to PS-27 verification page');

  // Click back button -> returns to dashboard
  const backBtn = app.host.querySelector('.lv-verify-back-btn');
  await act(async () => {
    backBtn.click();
  });

  assert.ok(app.host.querySelector('.lv-staff-dashboard'), 'Must return to dashboard after clicking back');

  await app.close();
});

test('PS-27 Preview Safety: Verification in preview never modifies case status, Vault, or DMS', async () => {
  const originalCase = { ...SYNTHETIC_STAFF_CASES[0] };

  // Running verification
  const receipt = await submitIdentityVerification(
    'ben-001-1',
    { documentType: 'CCCD', result: 'MATCH' },
    { isDevPreview: true }
  );

  assert.ok(receipt.id);
  // Case in fixture remains exactly unchanged
  assert.equal(SYNTHETIC_STAFF_CASES[0].status, originalCase.status);
  assert.equal(SYNTHETIC_STAFF_CASES[0].caseNumber, originalCase.caseNumber);
});


const regressionCase = SYNTHETIC_STAFF_CASES[0];
const regressionBeneficiaries = async () => ({ beneficiaries: [{ id: 'reg-ben', fullName: 'Preview Person' }] });
const regressionHistory = async () => ({ history: [] });
const regressionReceipt = { id: 'verification-regression', beneficiaryId: 'reg-ben', documentType: 'CCCD', result: 'MATCH', verifiedAt: '2026-10-16T02:00:00Z', isSimulation: true };
const regressionProps = { caseItem: regressionCase, isDevPreview: true, initialBeneficiaryId: 'reg-ben', loadBeneficiaries: regressionBeneficiaries, loadHistory: regressionHistory };
async function chooseResult(app) {
  await act(async () => {
    app.host.querySelector('input[name="documentType"][value="CCCD"]').click();
    app.host.querySelector('input[name="result"][value="MATCH"]').click();
  });
}
async function submitForm(app) {
  await act(async () => app.host.querySelector('form').dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })));
}

test('PS-27 Regression: auth/case scope clears selection and aborts late submission even A-B-A', async () => {
  let resolve, signal;
  const props = { ...regressionProps, onSubmitVerification: (_, __, options) => { signal = options.signal; return new Promise(r => { resolve = r; }); } };
  const app = await mount(StaffCaseVerificationPage, props);
  try {
    await chooseResult(app);
    await submitForm(app);
    await app.render({ ...props, caseItem: { ...regressionCase, id: 'other-case' }, initialBeneficiaryId: null });
    assert.equal(signal.aborted, true);
    assert.equal(Boolean(app.host.querySelector('form')), false);
    await app.render({ ...props, initialBeneficiaryId: null });
    await act(async () => resolve(regressionReceipt));
    assert.equal(Boolean(app.host.querySelector('.lv-verify-success-card')), false);
    await app.render({ ...props, accessToken: 'different-session', initialBeneficiaryId: null });
    assert.equal(Boolean(app.host.querySelector('form')), false);
  } finally { await app.close(); }
});

test('PS-27 Regression: failed beneficiary load has safe error and functional retry', async () => {
  let attempts = 0;
  const app = await mount(StaffCaseVerificationPage, { ...regressionProps, initialBeneficiaryId: null,
    loadBeneficiaries: async () => { if (++attempts === 1) throw new Error('SECRET SQL DETAIL'); return regressionBeneficiaries(); } });
  try {
    assert.equal(app.host.textContent.includes('SECRET SQL DETAIL'), false);
    assert.equal(app.host.textContent.includes(getStaffCaseTranslations('vi').verification.beneficiarySelect.emptyList), false);
    const retry = [...app.host.querySelectorAll('button')].find(b => b.textContent.includes('Thử lại'));
    assert.ok(Boolean(retry));
    await act(async () => retry.click());
    assert.equal(attempts, 2);
    assert.ok(app.host.textContent.includes('Preview Person'));
  } finally { await app.close(); }
});

test('PS-27 Regression: history failure is not an empty history and can retry', async () => {
  let attempts = 0;
  const app = await mount(StaffCaseVerificationPage, { ...regressionProps,
    loadHistory: async () => { if (++attempts === 1) throw new Error('SECRET HISTORY'); return regressionHistory(); } });
  try {
    assert.equal(app.host.textContent.includes('SECRET HISTORY'), false);
    assert.ok(app.host.textContent.includes(getStaffCaseTranslations('vi').verification.history.loadError));
    const retry = [...app.host.querySelectorAll('button')].find(b => b.textContent.includes('Thử lại'));
    assert.ok(Boolean(retry));
    await act(async () => retry.click());
    assert.equal(attempts, 2);
    assert.ok(app.host.textContent.includes(getStaffCaseTranslations('vi').verification.history.empty));
  } finally { await app.close(); }
});

test('PS-27 Regression: rejects rolled-over dates, unexpected result/type and extra sensitive receipt fields', () => {
  const options = { isDevPreview: true, expectedResult: 'MATCH', expectedDocumentType: 'CCCD' };
  for (const delta of [{ verifiedAt: '2026-02-30T00:00:00Z' }, { result: 'NOT_MATCH' }, { documentType: 'PASSPORT' }, { id: {} }, { documentSuffix: '123456789012' }]) {
    assert.throws(() => validateVerificationReceipt({ ...regressionReceipt, ...delta }, 'reg-ben', options), error => error.code === 'INVALID_RECEIPT');
  }
  const result = validateVerificationReceipt({ ...regressionReceipt, actorId: 'secret', identityNumber: 'secret' }, 'reg-ben', options);
  assert.equal('identityNumber' in result, false);
  assert.equal('actorId' in result, false);
});

test('PS-27 Regression: mismatched result preserves form and permits a valid retry', async () => {
  let calls = 0;
  const app = await mount(StaffCaseVerificationPage, { ...regressionProps,
    onSubmitVerification: async () => ++calls === 1 ? { ...regressionReceipt, result: 'NOT_MATCH' } : regressionReceipt });
  try {
    await chooseResult(app); await submitForm(app);
    assert.equal(Boolean(app.host.querySelector('.lv-verify-success-card')), false);
    assert.equal(app.host.querySelector('input[value="MATCH"]').checked, true);
    await submitForm(app);
    assert.equal(Boolean(app.host.querySelector('.lv-verify-success-card')), true);
  } finally { await app.close(); }
});

test('PS-27 Regression: unknown preview case is empty and production cannot simulate', async () => {
  const unknown = await fetchCaseBeneficiaries('unknown-case', { isDevPreview: true });
  assert.equal(unknown.beneficiaries.length, 0);
  const production = await loadComponentModule('src/pages/staff/staffCaseService.js', true);
  await assert.rejects(() => production.submitIdentityVerification('reg-ben', { documentType: 'CCCD', result: 'MATCH' }, { isDevPreview: true, isTest: true }), e => e.code === 'BACKEND_NOT_READY');
});

test('PS-27 Regression: English labels and physical will placeholder never claim receipt without BE', async () => {
  const app = await mount(StaffCaseVerificationPage, { ...regressionProps, lang: 'en' });
  try {
    assert.ok(app.host.textContent.includes('No intake record received from the server'));
    assert.equal(app.host.textContent.includes('Mã hồ sơ'), false);
    assert.equal(app.host.textContent.includes('Initial intake completed'), false);
  } finally { await app.close(); }
});


test('PS-27 StrictMode: effect replay still loads beneficiaries and permits verification', async () => {
  const StrictView = props => React.createElement(React.StrictMode, null, React.createElement(StaffCaseVerificationPage, props));
  const app = await mount(StrictView, { ...regressionProps, onSubmitVerification: async () => regressionReceipt });
  try {
    assert.equal(app.host.querySelectorAll('.lv-verify-ben-card').length, 1);
    await chooseResult(app);
    await submitForm(app);
    assert.equal(Boolean(app.host.querySelector('.lv-verify-success-card')), true);
  } finally { await app.close(); }
});


test('PS-27 Status: unselected beneficiaries do not falsely claim no verification history', async () => {
  const app = await mount(StaffCaseVerificationPage, { ...regressionProps, initialBeneficiaryId: null });
  try {
    assert.ok(app.host.textContent.includes(getStaffCaseTranslations('vi').verification.beneficiarySelect.statusUnknown));
    assert.equal(app.host.textContent.includes(getStaffCaseTranslations('vi').verification.beneficiarySelect.statusNotVerified), false);
  } finally { await app.close(); }
});


test('PS-27 locale: existing field errors follow language without resetting beneficiary', async () => {
  const props = { ...regressionProps, lang: 'vi' };
  const app = await mount(StaffCaseVerificationPage, props);
  try {
    await submitForm(app);
    const vi = validateVerificationForm({}, 'vi').errors;
    assert.ok(app.host.textContent.includes(vi.documentType));
    await app.render({ ...props, lang: 'en' });
    assert.ok(app.host.textContent.includes(validateVerificationForm({}, 'en').errors.documentType));
    assert.equal(app.host.textContent.includes(vi.documentType), false);
    assert.ok(app.host.querySelector('form'));
  } finally { await app.close(); }
});

for (const stage of ['beneficiaries', 'history', 'submit']) {
  for (const status of [401, 403]) test('PS-27 auth: ' + stage + ' HTTP ' + status, async () => {
    let expired = 0;
    const fail = async () => { throw { status }; };
    const props = { ...regressionProps, isDevPreview: false, accessToken: 'synthetic-auth-test',
      lang: 'en', onUnauthorized: () => expired++,
      ...(stage === 'beneficiaries' ? { loadBeneficiaries: fail } : {}),
      ...(stage === 'history' ? { loadHistory: fail } : {}),
      ...(stage === 'submit' ? { onSubmitVerification: fail } : {}),
    };
    const app = await mount(StaffCaseVerificationPage, props);
    try {
      if (stage === 'submit') { await chooseResult(app); await submitForm(app); }
      assert.ok(app.host.textContent.includes(stage === 'history'
        ? (status === 401 ? 'Please sign in again' : 'cannot perform this action')
        : (status === 401 ? 'Session expired' : 'Access denied')));
      assert.equal(expired, status === 401 ? 1 : 0);
      if (stage === 'submit') assert.equal(app.host.querySelector('input[name="result"][value="MATCH"]').checked, true);
    } finally { await app.close(); }
  });
}
