import { EMAIL_REGEX, loginValidationMessages } from './loginValidation.js';
import { validatePasswordFields } from './registrationValidation.js';

export function validateRecoveryPassword(values, lang) {
  const errors = validatePasswordFields(values, lang);
  const password = values.password || '';
  if (!password.trim() || password.includes('\0') || new TextEncoder().encode(password).length > 72 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(password)) {
    errors.password = lang === 'en' ? 'Password must contain 8–72 characters and at most 72 UTF-8 bytes, without invalid characters.' : 'Mật khẩu cần 8–72 ký tự, tối đa 72 byte UTF-8 và không chứa ký tự không hợp lệ.';
  }
  return errors;
}

export function validateRecoveryEmail(email, lang = 'vi') {
  const t = loginValidationMessages[lang] || loginValidationMessages.vi;
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return { email: t.emailRequired };
  if (value.length > 254 || !EMAIL_REGEX.test(value)) return { email: t.emailInvalid };
  return {};
}

// Never display provider responses or account-existence details in the form.
export function recoveryErrorKey(error) {
  if (error?.status === 429 || error?.code === 'RATE_LIMITED') return 'rateLimited';
  if (error?.code === 'RECOVERY_INVALID') return 'invalidRecovery';
  if (error?.code === 'PASSWORD_POLICY') return 'passwordPolicy';
  return 'requestError';
}
