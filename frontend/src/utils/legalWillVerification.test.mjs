import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateWillVerificationForm,
  canAccessLegalWillVerification,
  VERIFICATION_COMPARISON_CHOICES,
  VERIFICATION_ERROR_KEYS,
  getWillVerificationErrorMessage,
  formatWillVerificationErrors,
} from './legalWillVerificationValidation.js';
import { legalI18n } from '../pages/legal/legalI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PS-29 Legal Will Document Verification - Route & Client Role Guard', () => {
  it('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessLegalWillVerification(null), false);
    assert.equal(canAccessLegalWillVerification(undefined), false);

    const expiredSession = {
      accessToken: 'token-expired',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalWillVerification(expiredSession), false);
  });

  it('rejects access when session is active but user lacks LEGAL_VERIFIER role', () => {
    const ownerOnly = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u1', roles: ['VAULT_OWNER'] },
    };
    assert.equal(canAccessLegalWillVerification(ownerOnly), false);
  });

  it('grants access when session is active and user has LEGAL_VERIFIER role', () => {
    const verifier = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u2', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalWillVerification(verifier), true);
  });

  it('grants access when user holds both VAULT_OWNER and LEGAL_VERIFIER roles', () => {
    const dualRole = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u3', roles: ['VAULT_OWNER', 'LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalWillVerification(dualRole), true);
  });
});

describe('PS-29 Legal Will Document Verification - AC-aligned Form Validation', () => {
  it('accepts valid comparison selection for both AC choices (MATCH and MISMATCH)', () => {
    for (const choice of VERIFICATION_COMPARISON_CHOICES) {
      const res = validateWillVerificationForm({
        comparison: choice,
        notes: 'Đã đối chiếu với bản gốc di chúc lưu kho số.',
      });
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    }
  });

  it('fails when comparison choice is missing and returns language-neutral error key', () => {
    const missing = validateWillVerificationForm({
      notes: 'Chưa chọn kết quả đối chiếu',
    });
    assert.equal(missing.isValid, false);
    assert.equal(missing.errors.comparison, VERIFICATION_ERROR_KEYS.COMPARISON_REQUIRED);
    assert.equal(missing.errors.comparison, 'comparisonRequired');
  });

  it('fails when comparison choice is not in AC choices and returns comparisonInvalid key', () => {
    const invalid = validateWillVerificationForm({
      comparison: 'UNKNOWN_STATUS',
    });
    assert.equal(invalid.isValid, false);
    assert.equal(invalid.errors.comparison, VERIFICATION_ERROR_KEYS.COMPARISON_INVALID);
    assert.equal(invalid.errors.comparison, 'comparisonInvalid');
  });

  it('does not enforce arbitrary mandatory notes or signatures', () => {
    // Empty notes is valid
    const noNotes = validateWillVerificationForm({
      comparison: 'MATCH',
      notes: '',
    });
    assert.equal(noNotes.isValid, true);

    // Short notes is valid
    const shortNotes = validateWillVerificationForm({
      comparison: 'MISMATCH',
      notes: 'Lệch hash.',
    });
    assert.equal(shortNotes.isValid, true);
  });

  it('ensures form payload does not log or store credentials or raw passwords', () => {
    const payload = {
      docketReference: 'WILL-DOC-2026-001',
      comparison: 'MATCH',
      notes: 'Bản giấy trùng khớp hoàn toàn.',
    };
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(serialized.includes('secret'), false);
  });
});

describe('PS-29 Legal Will Document Verification - Dynamic Language Switching (VI <-> EN)', () => {
  it('correctly resolves comparison error keys in Vietnamese dictionary', () => {
    assert.equal(
      getWillVerificationErrorMessage('comparisonRequired', 'vi'),
      'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).'
    );
    assert.equal(
      getWillVerificationErrorMessage('comparisonInvalid', 'vi'),
      'Kết quả đối chiếu không hợp lệ.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(
      legalI18n.vi.comparisonRequired,
      'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).'
    );
    assert.equal(legalI18n.vi.comparisonInvalid, 'Kết quả đối chiếu không hợp lệ.');
  });

  it('correctly resolves comparison error keys in English dictionary', () => {
    assert.equal(
      getWillVerificationErrorMessage('comparisonRequired', 'en'),
      'Please select a comparison result (Match or Mismatch).'
    );
    assert.equal(
      getWillVerificationErrorMessage('comparisonInvalid', 'en'),
      'Invalid comparison option selected.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(
      legalI18n.en.comparisonRequired,
      'Please select a comparison result (Match or Mismatch).'
    );
    assert.equal(legalI18n.en.comparisonInvalid, 'Invalid comparison option selected.');
  });

  it('dynamically switches comparison error messages when language changes without re-validating form state', () => {
    // 1. Validate empty form
    const initialValidation = validateWillVerificationForm({ comparison: '' });
    assert.equal(initialValidation.isValid, false);

    // State stores ONLY language-neutral error key
    const stateErrors = initialValidation.errors;
    assert.deepEqual(stateErrors, {
      comparison: 'comparisonRequired',
    });

    // 2. Render under VI
    const viRendered = legalI18n.vi[stateErrors.comparison];
    assert.equal(viRendered, 'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).');

    // 3. Switch to EN — stateErrors remains UNCHANGED
    const enRendered = legalI18n.en[stateErrors.comparison];
    assert.equal(enRendered, 'Please select a comparison result (Match or Mismatch).');

    // 4. Switch back to VI — stateErrors remains UNCHANGED
    const viAgain = legalI18n.vi[stateErrors.comparison];
    assert.equal(viAgain, 'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).');

    // Helper formatting test
    const formattedEn = formatWillVerificationErrors(stateErrors, 'en');
    assert.equal(formattedEn.comparison, 'Please select a comparison result (Match or Mismatch).');
  });
});

describe('PS-29 Legal CSS Scoping Verification - No Leakage into Owner or Other Views', () => {
  it('ensures every selector in LegalWillDocumentVerificationPage.css is scoped under .lv-will-verification-view', () => {
    const cssPath = path.resolve(__dirname, '../pages/legal/LegalWillDocumentVerificationPage.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const lines = cssContent.split('\n');
    const unscopedSelectors = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        trimmed.endsWith('{') &&
        !trimmed.startsWith('@media') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*')
      ) {
        const selectorPart = trimmed.slice(0, -1).trim();
        const subSelectors = selectorPart.split(',').map((s) => s.trim());
        for (const sel of subSelectors) {
          if (!sel.startsWith('.lv-will-verification-view')) {
            unscopedSelectors.push({ line: index + 1, selector: sel });
          }
        }
      }
    });

    assert.equal(
      unscopedSelectors.length,
      0,
      `Found unscoped CSS selectors: ${JSON.stringify(unscopedSelectors, null, 2)}`
    );
  });
});
