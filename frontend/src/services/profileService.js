import { ApiError } from '../api/http.js';
import { passwordRequest } from '../api/passwordRequest.js';
import { readUser } from '../api/contracts.js';
import { isSessionActive } from '../utils/session.js';
import { canEditProfileEmail, isValidEmail } from '../utils/accountEditValidation.js';

// Only explicitly editable profile fields are sent; IDs/roles/system state never enter the body.
/**
 * Cập nhật hồ sơ cá nhân: {@code PATCH /auth/me} (200). Chỉ gửi các trường cho phép ({@code fullName}, {@code phoneNumber}, {@code email}).
 * Đổi email cần quyền sửa email ({@code canEditProfileEmail}), email hợp lệ và {@code currentPassword} (đi qua {@code passwordRequest}, trường {@code currentPassword}).
 * Sau khi nhận phản hồi, kiểm tra phiên còn hoạt động và id người dùng không đổi.
 * Dùng bởi trang tài khoản/hồ sơ.
 * @param {object} session Phiên hiện tại ({@code accessToken}, {@code user}).
 * @param {object} changes Các trường thay đổi.
 * @param {{signal?:AbortSignal, lang?:string}} [opts] Tùy chọn.
 * @returns {Promise<object>} Người dùng đã cập nhật.
 * @throws {ApiError} {@code UNAUTHENTICATED}, {@code INVALID_PROFILE_PATCH}, {@code ACCESS_DENIED}, {@code VALIDATION_FAILED}, {@code CURRENT_PASSWORD_REQUIRED}, {@code INVALID_PROFILE_RESPONSE}.
 */
export async function updateProfile(session, changes, { signal, lang = 'vi' } = {}) {
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !['fullName', 'phoneNumber', 'email', 'currentPassword'].includes(key))) throw new ApiError('INVALID_PROFILE_PATCH');
  const body = Object.fromEntries(keys.filter(key => ['fullName', 'phoneNumber'].includes(key)).map(key => [key, changes[key]]));
  if (Object.hasOwn(changes, 'email')) {
    if (!canEditProfileEmail(session).canEdit) throw new ApiError('ACCESS_DENIED', 403);
    if (!isValidEmail(changes.email)) throw new ApiError('VALIDATION_FAILED', 400);
    const email = changes.email.trim().toLowerCase();
    if (email !== session.user.email.trim().toLowerCase()) {
      if (typeof changes.currentPassword !== 'string' || !changes.currentPassword.trim()) throw new ApiError('CURRENT_PASSWORD_REQUIRED', 400);
      body.email = email;
      body.currentPassword = changes.currentPassword;
    }
  }
  if ((!Object.hasOwn(body, 'email') && Object.hasOwn(changes, 'currentPassword')) || !Object.keys(body).length) throw new ApiError('INVALID_PROFILE_PATCH');
  const raw = await passwordRequest('/auth/me', { method: 'PATCH', body,
    accessToken: session.accessToken, signal, lang, expectedStatus: 200 }, 'currentPassword');
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const user = readUser(raw);
  if (user.id !== session.user.id || !Object.hasOwn(user, 'phoneNumber')) throw new ApiError('INVALID_PROFILE_RESPONSE');
  return user;
}
