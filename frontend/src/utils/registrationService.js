import { request, ApiError } from '../api/http.js';
import { readUser, isUtcDate } from '../api/contracts.js';
/**
 * Gọi POST /api/v1/auth/register (công khai, mong đợi 201) với {fullName, email (chữ thường), password, phone tùy chọn} để tạo tài khoản chủ kho. Kiểm tra phản hồi bằng readUser, status phải ACTIVE và createdAt hợp lệ, nếu không ném INVALID_RESPONSE. Backend có thể trả EMAIL_ALREADY_EXISTS, VALIDATION_FAILED. Dùng bởi pages/auth/RegisterPageHenedo.jsx.
 */
export async function registerUser(values, options = {}) {
  const raw = await request('/auth/register', { ...options, method: 'POST', expectedStatus: 201,
    body: { fullName: values.fullName.trim(), email: values.email.trim().toLowerCase(),
      password: values.password, ...(values.phone?.trim() ? { phone: values.phone.trim() } : {}) } });
  const user = readUser(raw);
  if (raw.status !== 'ACTIVE' || !isUtcDate(raw.createdAt)) throw new ApiError('INVALID_RESPONSE', 201);
  return { ...user, status: raw.status, createdAt: raw.createdAt };
}
/**
 * Thông điệp đăng ký song ngữ theo mã (SUCCESS, EMAIL_ALREADY_EXISTS, VALIDATION_FAILED, NETWORK_ERROR, INTERNAL_ERROR).
 */
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
/**
 * Lấy thông điệp đăng ký theo mã lỗi và ngôn ngữ; mã lạ trả INTERNAL_ERROR.
 */
export const getRegistrationMessage = (code, lang) => (messages[lang] || messages.vi)[code] || (messages[lang] || messages.vi).INTERNAL_ERROR;
