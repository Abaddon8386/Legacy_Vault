/**
 * Dịch vụ khôi phục mật khẩu (công khai, không cần đăng nhập). Gọi POST /api/v1/auth/password-recovery/requests và /reset. Dùng bởi pages/auth/PasswordRecoveryRoute.jsx.
 */
import { API_BASE, ApiError } from '../api/http.js';

/**
 * Đọc mã khôi phục từ phần hash của URL (#token=...); chỉ chấp nhận đúng một tham số token là base64url 43 ký tự (mã 32 byte: ký tự cuối chỉ thuộc tập chuẩn của base64url không đệm), ngược lại trả null.
 */
export function readRecoveryCredential(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const value = params.get('token');
  return params.getAll('token').length === 1 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value || '') ? value : null;
}

/**
 * Gửi POST /api/v1/auth/password-recovery/{path} (không gửi cookie, no-store, no-referrer, kèm Accept-Language).
 * Mong đợi đúng expectedStatus (202 hoặc 204). Lỗi: NETWORK_ERROR, RATE_LIMITED (429), INVALID_RESPONSE, PASSWORD_POLICY (VALIDATION_FAILED có lỗi trường password), hoặc mã lỗi backend / RECOVERY_UNAVAILABLE.
 */
async function post(path, body, expectedStatus, { signal, lang = 'vi', fetchFn = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetchFn(`${API_BASE}/auth/password-recovery/${path}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': lang === 'en' ? 'en' : 'vi' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (response.status === 204 && expectedStatus === 204) return;
  let data;
  try { data = await response.json(); } catch { throw new ApiError(response.status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    const passwordError = data?.code === 'VALIDATION_FAILED' && Array.isArray(data.errors) && data.errors.some(item => item.field === 'password');
    throw new ApiError(passwordError ? 'PASSWORD_POLICY' : data?.code || 'RECOVERY_UNAVAILABLE', response.status);
  }
  if (response.status !== expectedStatus || data?.messageKey !== 'auth.recovery.requestAccepted') throw new ApiError('INVALID_RESPONSE', response.status);
}

/**
 * POST /api/v1/auth/password-recovery/requests với {email, locale}; mong đợi 202. Backend luôn trả cùng kết quả để không lộ email có tồn tại hay không.
 */
export const requestPasswordRecovery = ({ email }, options = {}) => post('requests', { email, locale: options.lang === 'en' ? 'en' : 'vi' }, 202, options);
/**
 * POST /api/v1/auth/password-recovery/reset với {credential, password}; mong đợi 204. Ném RECOVERY_INVALID ngay nếu mã không đúng định dạng.
 */
export const resetRecoveredPassword = (credential, { password }, options) => {
  if (!readRecoveryCredential(`#token=${credential || ''}`)) return Promise.reject(new ApiError('RECOVERY_INVALID'));
  return post('reset', { credential, password }, 204, options);
};
