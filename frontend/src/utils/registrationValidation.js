/**
 * LegacyVault — Registration Validation Logic (PS-1)
 * Validates Vault Owner registration fields with i18n error messaging (vi/en).
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

export const validationMessages = {
  vi: {
    fullNameRequired: 'Vui lòng nhập họ và tên.',
    fullNameShort: 'Họ và tên cần ít nhất 2 ký tự.',
    emailRequired: 'Vui lòng nhập địa chỉ email.',
    emailInvalid: 'Địa chỉ email chưa đúng định dạng.',
    phoneInvalid: 'Số điện thoại cần 8–15 chữ số, có thể bắt đầu bằng +.',
    passwordRequired: 'Vui lòng nhập mật khẩu.',
    passwordShort: 'Mật khẩu phải có ít nhất 8 ký tự.',
    confirmRequired: 'Vui lòng nhập lại mật khẩu.',
    confirmMismatch: 'Mật khẩu nhập lại không khớp.',
    termsRequired: 'Vui lòng đồng ý với Điều khoản dịch vụ và Chính sách bảo mật.',
  },
  en: {
    fullNameRequired: 'Please enter your full name.',
    fullNameShort: 'Full name must be at least 2 characters.',
    emailRequired: 'Please enter your email address.',
    emailInvalid: 'Please enter a valid email address.',
    phoneInvalid: 'Phone number must contain 8–15 digits and may start with +.',
    passwordRequired: 'Please enter your password.',
    passwordShort: 'Password must be at least 8 characters.',
    confirmRequired: 'Please confirm your password.',
    confirmMismatch: 'Passwords do not match.',
    termsRequired: 'You must agree to the Terms of Service and Privacy Policy.',
  },
};

/**
 * Validate Vault Owner registration inputs.
 * @param {Object} values - { fullName, email, phone, password, confirmPassword, agreeTerms }
 * @param {string} lang - 'vi' | 'en'
 * @returns {Object} errors map, empty if valid
 */
export function validateRegistration(values, lang = 'vi') {
  const msgs = validationMessages[lang] || validationMessages.vi;
  const errors = {};

  // Full Name
  const trimmedName = (values.fullName || '').trim();
  if (!trimmedName) {
    errors.fullName = msgs.fullNameRequired;
  } else if (trimmedName.length > 150) {
    errors.fullName = lang === 'en' ? 'Full name must not exceed 150 characters.' : 'Họ và tên không được vượt quá 150 ký tự.';
  }

  // Email
  const trimmedEmail = (values.email || '').trim();
  if (!trimmedEmail) {
    errors.email = msgs.emailRequired;
  } else if (trimmedEmail.length > 254 || !EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = msgs.emailInvalid;
  }

  // Phone (Optional, but if entered must match format)
  const trimmedPhone = (values.phone || '').trim();
  if (trimmedPhone && (trimmedPhone.length > 15 || !PHONE_REGEX.test(trimmedPhone))) {
    errors.phone = msgs.phoneInvalid;
  }

  Object.assign(errors, validatePasswordFields(values, lang));

  // Terms Agreement
  if (!values.agreeTerms) {
    errors.agreeTerms = msgs.termsRequired;
  }

  return errors;
}

// Shared by registration and password recovery; keep the existing 8–72 policy.
export function validatePasswordFields(values = {}, lang = 'vi') {
  const msgs = validationMessages[lang] || validationMessages.vi;
  const errors = {};
  const pwd = values.password || '';
  if (!pwd) {
    errors.password = msgs.passwordRequired;
  } else if (pwd.length < 8) {
    errors.password = msgs.passwordShort;
  }

  if (pwd.length > 72) errors.password = lang === 'en' ? 'Password must not exceed 72 characters.' : 'Mật khẩu không được vượt quá 72 ký tự.';

  // Confirm Password
  const confirmPwd = values.confirmPassword || '';
  if (!confirmPwd) {
    errors.confirmPassword = msgs.confirmRequired;
  } else if (confirmPwd !== pwd) {
    errors.confirmPassword = msgs.confirmMismatch;
  }

  return errors;
}
