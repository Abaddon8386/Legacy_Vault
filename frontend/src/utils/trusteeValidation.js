/**
 * LegacyVault — Trustee Validation Logic (PS-8 / ST-04)
 *
 * SPECIFICATION & BUSINESS RULES:
 * - Trustee is OPTIONAL (user may skip Trustee).
 * - Trustee does NOT need an account (no userId, no login).
 * - Max 1 current Trustee per Vault.
 * - Require at least one contact method: phone OR email.
 * - fullName: required, non-blank, max 150 chars.
 * - phone: optional (valid phone format if provided).
 * - email: optional (valid email format if provided).
 * - relationship: optional, max 100 chars.
 * - note: optional, max 500 chars.
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const PHONE_REGEX = /^(?:\+?\d{1,4}[ -]?)?\(?\d{2,4}\)?[ -]?\d{3,4}[ -]?\d{3,4}$|^(?:0|\+84)(?:3|5|7|8|9)[0-9]{8}$/;

export const trusteeValidationMessages = {
  vi: {
    fullNameRequired: 'Vui lòng nhập họ và tên Người thi hành bên ngoài.',
    fullNameTooLong: 'Họ và tên không được vượt quá 150 ký tự.',
    contactRequired: 'Cần cung cấp ít nhất một phương thức liên hệ: Số điện thoại hoặc Email.',
    emailInvalid: 'Địa chỉ email chưa đúng định dạng.',
    phoneInvalid: 'Số điện thoại không hợp lệ (ví dụ: 0901234567 hoặc +84...).',
    relationshipTooLong: 'Mối quan hệ không được vượt quá 100 ký tự.',
    noteTooLong: 'Ghi chú không được vượt quá 500 ký tự.',
  },
  en: {
    fullNameRequired: 'Please enter the Trustee full name.',
    fullNameTooLong: 'Full name must not exceed 150 characters.',
    contactRequired: 'At least one contact method (Phone or Email) is required.',
    emailInvalid: 'Please enter a valid email address.',
    phoneInvalid: 'Invalid phone number format (e.g. 0901234567 or +84...).',
    relationshipTooLong: 'Relationship must not exceed 100 characters.',
    noteTooLong: 'Note must not exceed 500 characters.',
  },
};

/**
 * Validate Trustee input values.
 *
 * @param {Object} values
 * @param {string} values.fullName - Required, max 150
 * @param {string} [values.phone] - Optional, but at least phone or email required
 * @param {string} [values.email] - Optional, but at least phone or email required
 * @param {string} [values.relationship] - Optional, max 100
 * @param {string} [values.note] - Optional, max 500
 * @param {'vi'|'en'} lang
 * @returns {Record<string, string>} Map of validation error messages
 */
export function validateTrustee(values = {}, lang = 'vi') {
  const msgs = trusteeValidationMessages[lang] || trusteeValidationMessages.vi;
  const errors = {};

  // 1. Full Name
  const trimmedName = (values.fullName || '').trim();
  if (!trimmedName) {
    errors.fullName = msgs.fullNameRequired;
  } else if (trimmedName.length > 150) {
    errors.fullName = msgs.fullNameTooLong;
  }

  // 2. Contact methods: at least phone OR email must be provided
  const trimmedPhone = (values.phone || '').trim();
  const trimmedEmail = (values.email || '').trim();

  if (!trimmedPhone && !trimmedEmail) {
    errors.contact = msgs.contactRequired;
    errors.phone = msgs.contactRequired;
    errors.email = msgs.contactRequired;
  } else {
    if (trimmedEmail && (trimmedEmail.length > 254 || !EMAIL_REGEX.test(trimmedEmail))) {
      errors.email = msgs.emailInvalid;
    }
    if (trimmedPhone && (trimmedPhone.length > 20 || !PHONE_REGEX.test(trimmedPhone))) {
      errors.phone = msgs.phoneInvalid;
    }
  }

  // 3. Relationship (optional, max 100)
  const trimmedRelationship = (values.relationship || '').trim();
  if (trimmedRelationship.length > 100) {
    errors.relationship = msgs.relationshipTooLong;
  }

  return errors;
}
