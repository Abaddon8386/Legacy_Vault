/**
 * LegacyVault — Registration Validation Logic (PS-1)
 * Validates Vault Owner registration fields with i18n error messaging (vi/en).
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
export const PHONE_REGEX = /^(?:0|\+84)(?:3|5|7|8|9)[0-9]{8}$/;

export const validationMessages = {
  vi: {
    fullNameRequired: 'Vui lòng nhập họ và tên.',
    fullNameShort: 'Họ và tên cần ít nhất 2 ký tự.',
    emailRequired: 'Vui lòng nhập địa chỉ email.',
    emailInvalid: 'Địa chỉ email chưa đúng định dạng.',
    phoneInvalid: 'Số điện thoại không hợp lệ (10 chữ số, ví dụ: 0901234567).',
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
    phoneInvalid: 'Invalid phone number (10 digits, e.g. 0901234567).',
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
  } else if (trimmedName.length < 2) {
    errors.fullName = msgs.fullNameShort;
  }

  // Email
  const trimmedEmail = (values.email || '').trim();
  if (!trimmedEmail) {
    errors.email = msgs.emailRequired;
  } else if (!EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = msgs.emailInvalid;
  }

  // Phone (Optional, but if entered must match format)
  const trimmedPhone = (values.phone || '').trim();
  if (trimmedPhone && !PHONE_REGEX.test(trimmedPhone)) {
    errors.phone = msgs.phoneInvalid;
  }

  // Password
  const pwd = values.password || '';
  if (!pwd) {
    errors.password = msgs.passwordRequired;
  } else if (pwd.length < 8) {
    errors.password = msgs.passwordShort;
  }

  // Confirm Password
  const confirmPwd = values.confirmPassword || '';
  if (!confirmPwd) {
    errors.confirmPassword = msgs.confirmRequired;
  } else if (confirmPwd !== pwd) {
    errors.confirmPassword = msgs.confirmMismatch;
  }

  // Terms Agreement
  if (!values.agreeTerms) {
    errors.agreeTerms = msgs.termsRequired;
  }

  return errors;
}
