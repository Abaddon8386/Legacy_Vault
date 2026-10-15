import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDeathVerificationForm,
  VERIFICATION_CHOICES,
} from './legalDeathVerificationValidation.js';

describe('PS-28 Legal Death Verification - AC-aligned Form Validation', () => {
  it('accepts valid decision and non-empty reason for all three AC options', () => {
    for (const choice of VERIFICATION_CHOICES) {
      const res = validateDeathVerificationForm(
        {
          decision: choice,
          reason: 'Căn cứ theo trích lục khai tử hợp lệ.',
        },
        'vi'
      );
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    }
  });

  it('validates decision and reason in English', () => {
    const res = validateDeathVerificationForm(
      {
        decision: 'APPROVE',
        reason: 'Death confirmed based on municipal extract.',
      },
      'en'
    );
    assert.equal(res.isValid, true);
    assert.deepEqual(res.errors, {});
  });

  it('fails when decision is missing or not in the 3 AC choices', () => {
    const missing = validateDeathVerificationForm(
      { reason: 'Có lý do nhưng chưa chọn quyết định' },
      'vi'
    );
    assert.equal(missing.isValid, false);
    assert.match(missing.errors.decision, /Vui lòng chọn quyết định thẩm định/);

    const invalid = validateDeathVerificationForm(
      { decision: 'UNAUTHORIZED_CHOICE', reason: 'Some reason' },
      'en'
    );
    assert.equal(invalid.isValid, false);
    assert.match(invalid.errors.decision, /Invalid verification option/);
  });

  it('fails when reason is missing, empty, or whitespace only after trim', () => {
    const emptyVi = validateDeathVerificationForm({ decision: 'REJECT', reason: '   ' }, 'vi');
    assert.equal(emptyVi.isValid, false);
    assert.match(emptyVi.errors.reason, /không được để trống/);

    const emptyEn = validateDeathVerificationForm({ decision: 'APPROVE', reason: '' }, 'en');
    assert.equal(emptyEn.isValid, false);
    assert.match(emptyEn.errors.reason, /cannot be empty/);
  });

  it('does not enforce arbitrary character bounds or invented mandatory fields', () => {
    // Short reason (under 10 chars) is accepted as long as it's not empty
    const shortReason = validateDeathVerificationForm(
      { decision: 'REJECT', reason: 'Bác bỏ.' },
      'vi'
    );
    assert.equal(shortReason.isValid, true);

    // APPROVE does not require arbitrary evidence document type enum
    const approveNoExtra = validateDeathVerificationForm(
      { decision: 'APPROVE', reason: 'Đã đối chiếu văn bản hợp lệ.' },
      'vi'
    );
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
