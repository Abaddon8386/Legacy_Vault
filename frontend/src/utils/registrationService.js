import { request, ApiError } from '../api/http.js';
import { readUser, isUtcDate } from '../api/contracts.js';
export async function registerUser(values, options = {}) {
  const raw = await request('/auth/register', { ...options, method: 'POST', expectedStatus: 201,
    body: { fullName: values.fullName.trim(), email: values.email.trim().toLowerCase(),
      password: values.password, ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}) } });
  const user = readUser(raw);
  if (raw.status !== 'ACTIVE' || !isUtcDate(raw.createdAt)) throw new ApiError('INVALID_RESPONSE', 201);
  return { ...user, status: raw.status, createdAt: raw.createdAt };
}
const messages = {
  vi: { SUCCESS: 'Tạo tài khoản thành công. Bạn có thể đăng nhập.',
    EMAIL_ALREADY_EXISTS: 'Email này đã được sử dụng. Vui lòng đăng nhập hoặc dùng email khác.',
    VALIDATION_FAILED: 'Vui lòng kiểm tra lại thông tin đăng ký.',
    NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng thử lại.',
    INTERNAL_ERROR: 'Không thể hoàn tất đăng ký. Vui lòng thử lại sau.' },
  en: { SUCCESS: 'Account created. You can now sign in.',
    EMAIL_ALREADY_EXISTS: 'This email is already registered. Sign in or use another email.',
    VALIDATION_FAILED: 'Please check your registration details.',
    NETWORK_ERROR: 'Cannot reach the server. Please try again.',
    INTERNAL_ERROR: 'Registration could not be completed. Please try again later.' },
};
export const getRegistrationMessage = (code, lang) => (messages[lang] || messages.vi)[code] || (messages[lang] || messages.vi).INTERNAL_ERROR;
