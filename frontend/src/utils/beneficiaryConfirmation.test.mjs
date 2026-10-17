import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessBeneficiaryConfirmation,
  validateBeneficiaryConfirmationForm,
  computeBeneficiaryConfirmationStatus,
  BENEFICIARY_CONFIRMATION_ERROR_KEYS,
  BENEFICIARY_CONFIRM_STATUS,
} from './beneficiaryConfirmationValidation.js';
import { beneficiaryConfirmationI18n } from '../pages/staff/beneficiaryConfirmationI18n.js';

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
  const cssPath = resolve('src/pages/staff/BeneficiaryConfirmationPage.css');
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
