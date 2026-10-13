/**
 * LegacyVault — Beneficiary Validation Logic (PS-8 / ST-05)
 *
 * SPECIFICATION & BUSINESS RULES:
 * - At least 1 Beneficiary is required for configuration readiness.
 * - Beneficiary does NOT need an account (no userId, no login).
 * - No Claim Link, no Guest Portal, no Beneficiary OTP.
 * - NO allocation percentage or share ratio.
 * - fullName: required, non-blank, max 150 chars.
 * - relationship: optional, max 100 chars.
 * - dateOfBirth: optional, must not be in the future (YYYY-MM-DD).
 * - phone: optional (valid phone format if provided).
 * - email: optional (valid email format if provided).
 */

import { EMAIL_REGEX, PHONE_REGEX } from './trusteeValidation.js';

export const beneficiaryValidationMessages = {
  vi: {
    fullNameRequired: 'Vui lòng nhập họ và tên Người thụ hưởng.',
    fullNameTooLong: 'Họ và tên không được vượt quá 150 ký tự.',
    relationshipTooLong: 'Mối quan hệ không được vượt quá 100 ký tự.',
    dateOfBirthInvalid: 'Ngày sinh không hợp lệ.',
    dateOfBirthFuture: 'Ngày sinh không được ở tương lai.',
    emailInvalid: 'Địa chỉ email chưa đúng định dạng.',
    phoneInvalid: 'Số điện thoại không hợp lệ (ví dụ: 0901234567 hoặc +84...).',
  },
  en: {
    fullNameRequired: 'Please enter the Beneficiary full name.',
    fullNameTooLong: 'Full name must not exceed 150 characters.',
    relationshipTooLong: 'Relationship must not exceed 100 characters.',
    dateOfBirthInvalid: 'Invalid date of birth.',
    dateOfBirthFuture: 'Date of birth cannot be in the future.',
    emailInvalid: 'Please enter a valid email address.',
    phoneInvalid: 'Invalid phone number format (e.g. 0901234567 or +84...).',
  },
};

/**
 * Validate Beneficiary input values.
 *
 * @param {Object} values
 * @param {string} values.fullName - Required, max 150
 * @param {string} [values.relationship] - Optional, max 100
 * @param {string} [values.dateOfBirth] - Optional, not future (YYYY-MM-DD)
 * @param {string} [values.phone] - Optional
 * @param {string} [values.email] - Optional
 * @param {'vi'|'en'} lang
 * @returns {Record<string, string>} Map of validation error messages
 */
export function validateBeneficiary(values = {}, lang = 'vi') {
  const msgs = beneficiaryValidationMessages[lang] || beneficiaryValidationMessages.vi;
  const errors = {};

  // 1. Full Name
  const trimmedName = (values.fullName || '').trim();
  if (!trimmedName) {
    errors.fullName = msgs.fullNameRequired;
  } else if (trimmedName.length > 150) {
    errors.fullName = msgs.fullNameTooLong;
  }

  // 2. Relationship (optional, max 100)
  const trimmedRelationship = (values.relationship || '').trim();
  if (trimmedRelationship.length > 100) {
    errors.relationship = msgs.relationshipTooLong;
  }

  // 3. Date of Birth (optional, not future)
  if (values.dateOfBirth) {
    const dobString = String(values.dateOfBirth).trim();
    if (dobString) {
      const dob = new Date(dobString);
      if (Number.isNaN(dob.getTime())) {
        errors.dateOfBirth = msgs.dateOfBirthInvalid;
      } else {
        const today = new Date();
        // Compare date only (midnight)
        today.setHours(23, 59, 59, 999);
        if (dob > today) {
          errors.dateOfBirth = msgs.dateOfBirthFuture;
        }
      }
    }
  }

  // 4. Phone (optional)
  const trimmedPhone = (values.phone || '').trim();
  if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) {
    errors.phone = msgs.phoneInvalid;
  }

  // 5. Email (optional)
  const trimmedEmail = (values.email || '').trim();
  if (trimmedEmail && !EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = msgs.emailInvalid;
  }

  return errors;
}
