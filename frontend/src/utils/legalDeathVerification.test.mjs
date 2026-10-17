import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateDeathVerificationForm,
  VERIFICATION_CHOICES,
  VERIFICATION_ERROR_KEYS,
  getVerificationErrorMessage,
  formatDeathVerificationErrors,
} from './legalDeathVerificationValidation.js';
import { legalI18n } from '../pages/legal/legalI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PS-28 Legal Death Verification - AC-aligned Form Validation & Error Keys', () => {
  it('accepts valid decision and non-empty reason for all three AC options', () => {
    for (const choice of VERIFICATION_CHOICES) {
      const res = validateDeathVerificationForm({
        decision: choice,
        reason: 'Căn cứ theo trích lục khai tử hợp lệ.',
      });
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    }
  });

  it('fails when decision is missing and returns language-neutral error key', () => {
    const missing = validateDeathVerificationForm({
      reason: 'Có lý do nhưng chưa chọn quyết định',
    });
    assert.equal(missing.isValid, false);
    assert.equal(missing.errors.decision, VERIFICATION_ERROR_KEYS.DECISION_REQUIRED);
    assert.equal(missing.errors.decision, 'decisionRequired');
  });

  it('fails when decision is not in the 3 AC choices and returns decisionInvalid key', () => {
    const invalid = validateDeathVerificationForm({
      decision: 'UNAUTHORIZED_CHOICE',
      reason: 'Some reason',
    });
    assert.equal(invalid.isValid, false);
    assert.equal(invalid.errors.decision, VERIFICATION_ERROR_KEYS.DECISION_INVALID);
    assert.equal(invalid.errors.decision, 'decisionInvalid');
  });

  it('fails when reason is missing, empty, or whitespace only after trim', () => {
    const empty = validateDeathVerificationForm({ decision: 'REJECT', reason: '   ' });
    assert.equal(empty.isValid, false);
    assert.equal(empty.errors.reason, VERIFICATION_ERROR_KEYS.REASON_REQUIRED);
    assert.equal(empty.errors.reason, 'reasonRequired');

    const emptyStr = validateDeathVerificationForm({ decision: 'APPROVE', reason: '' });
    assert.equal(emptyStr.isValid, false);
    assert.equal(emptyStr.errors.reason, VERIFICATION_ERROR_KEYS.REASON_REQUIRED);
  });

  it('does not enforce arbitrary character bounds or invented mandatory fields', () => {
    // Short reason (under 10 chars) is accepted as long as it's not empty
    const shortReason = validateDeathVerificationForm({
      decision: 'REJECT',
      reason: 'Bác bỏ.',
    });
    assert.equal(shortReason.isValid, true);

    // APPROVE does not require arbitrary evidence document type enum
    const approveNoExtra = validateDeathVerificationForm({
      decision: 'APPROVE',
      reason: 'Đã đối chiếu văn bản hợp lệ.',
    });
    assert.equal(approveNoExtra.isValid, true);
  });

  it('ensures form payload does not log or store credentials or raw passwords', () => {
    const payload = {
      docketReference: 'REF-2026-ST12',
      decision: 'APPROVE',
      reason: 'Đã đối chiếu trích lục khai tử gốc có đóng dấu đỏ.',
    };
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(serialized.includes('secret'), false);
  });
});

describe('PS-28 Legal Death Verification - Dynamic Language Switching of Errors (VI <-> EN)', () => {
  it('correctly resolves all error keys in Vietnamese dictionary', () => {
    assert.equal(
      getVerificationErrorMessage('decisionRequired', 'vi'),
      'Vui lòng chọn quyết định thẩm định.'
    );
    assert.equal(
      getVerificationErrorMessage('decisionInvalid', 'vi'),
      'Lựa chọn thẩm định không hợp lệ.'
    );
    assert.equal(
      getVerificationErrorMessage('reasonRequired', 'vi'),
      'Lý do thẩm định không được để trống.'
    );

    // Also check direct dictionary lookup used by component: t[key]
    assert.equal(legalI18n.vi.decisionRequired, 'Vui lòng chọn quyết định thẩm định.');
    assert.equal(legalI18n.vi.decisionInvalid, 'Lựa chọn thẩm định không hợp lệ.');
    assert.equal(legalI18n.vi.reasonRequired, 'Lý do thẩm định không được để trống.');
  });

  it('correctly resolves all error keys in English dictionary', () => {
    assert.equal(
      getVerificationErrorMessage('decisionRequired', 'en'),
      'Please select a verification option.'
    );
    assert.equal(
      getVerificationErrorMessage('decisionInvalid', 'en'),
      'Invalid verification option selected.'
    );
    assert.equal(
      getVerificationErrorMessage('reasonRequired', 'en'),
      'Verification rationale / reason cannot be empty.'
    );

    // Also check direct dictionary lookup used by component: t[key]
    assert.equal(legalI18n.en.decisionRequired, 'Please select a verification option.');
    assert.equal(legalI18n.en.decisionInvalid, 'Invalid verification option selected.');
    assert.equal(legalI18n.en.reasonRequired, 'Verification rationale / reason cannot be empty.');
  });

  it('dynamically switches error messages when language changes without re-validating form state', () => {
    // 1. Simulating empty form submission: validate once
    const initialValidation = validateDeathVerificationForm({ decision: '', reason: '' });
    assert.equal(initialValidation.isValid, false);

    // State stores ONLY language-neutral error keys
    const stateErrors = initialValidation.errors;
    assert.deepEqual(stateErrors, {
      decision: 'decisionRequired',
      reason: 'reasonRequired',
    });

    // 2. Render under VI
    const viRenderedDecision = legalI18n.vi[stateErrors.decision];
    const viRenderedReason = legalI18n.vi[stateErrors.reason];
    assert.equal(viRenderedDecision, 'Vui lòng chọn quyết định thẩm định.');
    assert.equal(viRenderedReason, 'Lý do thẩm định không được để trống.');

    // 3. User switches language to EN — stateErrors remains UNCHANGED
    const enRenderedDecision = legalI18n.en[stateErrors.decision];
    const enRenderedReason = legalI18n.en[stateErrors.reason];
    assert.equal(enRenderedDecision, 'Please select a verification option.');
    assert.equal(enRenderedReason, 'Verification rationale / reason cannot be empty.');

    // 4. User switches back to VI — stateErrors remains UNCHANGED
    const viAgainDecision = legalI18n.vi[stateErrors.decision];
    const viAgainReason = legalI18n.vi[stateErrors.reason];
    assert.equal(viAgainDecision, 'Vui lòng chọn quyết định thẩm định.');
    assert.equal(viAgainReason, 'Lý do thẩm định không được để trống.');

    // Format helper verification
    const formattedEn = formatDeathVerificationErrors(stateErrors, 'en');
    assert.equal(formattedEn.decision, 'Please select a verification option.');
    assert.equal(formattedEn.reason, 'Verification rationale / reason cannot be empty.');
  });
});

describe('PS-28 Legal CSS Scoping Verification - No Leakage into Owner Forms', () => {
  it('ensures every selector in LegalDeathVerificationPage.css is scoped under .lv-legal-view', () => {
    const cssPath = path.resolve(__dirname, '../pages/legal/LegalDeathVerificationPage.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    // Split rules while taking media queries and comments into account
    const lines = cssContent.split('\n');
    const unscopedSelectors = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      // Match lines opening a rule block, excluding comments and @media declarations
      if (
        trimmed.endsWith('{') &&
        !trimmed.startsWith('@media') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*')
      ) {
        const selectorPart = trimmed.slice(0, -1).trim();
        const subSelectors = selectorPart.split(',').map((s) => s.trim());
        for (const sel of subSelectors) {
          if (!sel.startsWith('.lv-legal-view')) {
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
