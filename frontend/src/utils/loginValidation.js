/**
 * LegacyVault — Login Validation Logic (PS-2)
 * Validates authentication credentials with i18n error messaging (vi/en).
 * Follows approved frontend guard standards without exposing sensitive inputs.
 */

export const EMAIL_REGEX = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;

export const loginValidationMessages = {
  vi: {
    emailRequired: 'Vui lòng nhập địa chỉ email.',
    emailInvalid: 'Địa chỉ email chưa đúng định dạng.',
    passwordRequired: 'Vui lòng nhập mật khẩu.',
  },
  en: {
    emailRequired: 'Please enter your email address.',
    emailInvalid: 'Please enter a valid email address.',
    passwordRequired: 'Please enter your password.',
  },
};

/**
 * Validate user login form fields.
 * @param {Object} values - { email, password }
 * @param {string} lang - 'vi' | 'en'
 * @returns {Object} errors map (empty object if all valid)
 */
export function validateLogin(values = {}, lang = 'vi') {
  const msgs = loginValidationMessages[lang] || loginValidationMessages.vi;
  const errors = {};

  // Email validation
  const trimmedEmail = (values.email || '').trim();
  if (!trimmedEmail) {
    errors.email = msgs.emailRequired;
  } else if (!EMAIL_REGEX.test(trimmedEmail)) {
    errors.email = msgs.emailInvalid;
  }

  // Password validation
  const rawPassword = values.password || '';
  if (!rawPassword.trim()) {
    errors.password = msgs.passwordRequired;
  }

  return errors;
}