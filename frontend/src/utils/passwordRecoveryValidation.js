import { EMAIL_REGEX, loginValidationMessages } from './loginValidation.js';
import { validatePasswordFields } from './registrationValidation.js';

/**
 * Kiểm tra mật khẩu mới ở form khôi phục: dùng validatePasswordFields rồi bổ sung quy tắc 8-72 ký tự, tối đa 72 byte UTF-8, không chứa NUL hay ký tự surrogate lẻ. Dùng bởi pages/auth/PasswordRecoveryPage.jsx.
 */
export function validateRecoveryPassword(values, lang) {
  const errors = validatePasswordFields(values, lang);
  const password = values.password || '';
  if (!password.trim() || password.includes('\0') || new TextEncoder().encode(password).length > 72 || /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(password)) {
    errors.password = lang === 'en' ? 'Password must contain 8–72 characters and at most 72 UTF-8 bytes, without invalid characters.' : 'Mật khẩu cần 8–72 ký tự, tối đa 72 byte UTF-8 và không chứa ký tự không hợp lệ.';
  }
  return errors;
}

/**
 * Kiểm tra email ở bước yêu cầu khôi phục (bắt buộc, tối đa 254 ký tự, đúng EMAIL_REGEX). Trả {email: thông điệp} hoặc {}.
 */
export function validateRecoveryEmail(email, lang = 'vi') {
  const t = loginValidationMessages[lang] || loginValidationMessages.vi;
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return { email: t.emailRequired };
  if (value.length > 254 || !EMAIL_REGEX.test(value)) return { email: t.emailInvalid };
  return {};
}

// Never display provider responses or account-existence details in the form.
/**
 * Chuyển lỗi thành khóa thông điệp chung (rateLimited, invalidRecovery, passwordPolicy, requestError); không bao giờ hiện phản hồi của máy chủ hay thông tin tài khoản có tồn tại.
 */
export function recoveryErrorKey(error) {
  if (error?.status === 429 || error?.code === 'RATE_LIMITED') return 'rateLimited';
  if (error?.code === 'RECOVERY_INVALID') return 'invalidRecovery';
  if (error?.code === 'PASSWORD_POLICY') return 'passwordPolicy';
  return 'requestError';
}
