import { API_BASE, ApiError, request } from '../api/http.js';

/**
 * Đọc mã xác minh email từ phần hash của URL (dạng {@code #token=...}). Chỉ chấp nhận đúng một tham số {@code token}
 * gồm 43 ký tự base64url; mã nằm trong hash để không bị gửi lên máy chủ hay lưu vào log.
 * @param {string} hash {@code window.location.hash}.
 * @returns {(string|null)} Mã hợp lệ hoặc null.
 */
export function readEmailCredential(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const token = params.get('token');
  return params.getAll('token').length === 1 && /^[A-Za-z0-9_-]{43}$/.test(token || '') ? token : null;
}
/**
 * Tải trạng thái xác minh email của tài khoản: {@code GET /auth/email-verification} (200, không cache).
 * Kiểm tra {@code verified}, {@code requestAvailable}, {@code lastRequestState} (QUEUED/PROVIDER_ACCEPTED/FAILED/SKIPPED) và {@code verifiedAt}.
 * Dùng ở trang tài khoản (hồ sơ cá nhân).
 * @throws {ApiError} {@code INVALID_RESPONSE} nếu sai hợp đồng.
 */
export async function loadEmailVerification(options) {
  const value = await request('/auth/email-verification', {...options, cache:'no-store', expectedStatus:200});
  if (typeof value?.verified !== 'boolean' || typeof value.requestAvailable !== 'boolean' ||
      ![null,'QUEUED','PROVIDER_ACCEPTED','FAILED','SKIPPED'].includes(value.lastRequestState) ||
      (value.verified ? typeof value.verifiedAt !== 'string' : value.verifiedAt !== null)) throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Yêu cầu gửi email xác minh: {@code POST /auth/email-verification/requests} với {@code {locale}} (vi/en), kỳ vọng 202 và {@code status = QUEUED}.
 * @throws {ApiError} Mã backend như {@code EMAIL_ALREADY_VERIFIED}, {@code EMAIL_VERIFICATION_NOT_APPLICABLE}; 429 khi gửi quá nhiều.
 */
export async function sendEmailVerification(options) {
  const value = await request('/auth/email-verification/requests', {...options, method:'POST', body:{locale:options.lang === 'en' ? 'en' : 'vi'}, expectedStatus:202});
  if (value?.status !== 'QUEUED') throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Xác nhận email bằng mã trong liên kết: {@code POST /auth/email-verification/confirm} với {@code {credential}} (không dùng Bearer, không gửi referrer, không cache), kỳ vọng 204.
 * @param {string} credential Mã lấy từ {@link readEmailCredential}.
 * @throws {ApiError} {@code EMAIL_VERIFICATION_INVALID} (mã sai/hết hạn/đã dùng), {@code NETWORK_ERROR}, {@code INVALID_RESPONSE}.
 */
export async function confirmEmailVerification(credential, {signal, lang = 'vi', fetchFn = globalThis.fetch} = {}) {
  if (!readEmailCredential('#token='+credential)) throw new ApiError('EMAIL_VERIFICATION_INVALID',400);
  let response;
  try { response = await fetchFn(API_BASE+'/auth/email-verification/confirm', {method:'POST', signal, credentials:'omit', cache:'no-store', referrerPolicy:'no-referrer', headers:{'Content-Type':'application/json','Accept-Language':lang}, body:JSON.stringify({credential})}); }
  catch (error) { if(error.name === 'AbortError') throw error; throw new ApiError('NETWORK_ERROR'); }
  if (signal?.aborted) throw new DOMException('Aborted','AbortError');
  if(response.status === 204) return;
  let value; try {value = await response.json();} catch {throw new ApiError('INVALID_RESPONSE',response.status);}
  throw new ApiError(value?.code || 'EMAIL_VERIFICATION_INVALID',response.status);
}
/**
 * Chuyển lỗi của luồng xác minh email thành thông điệp thân thiện song ngữ (429, 401, EMAIL_VERIFICATION_INVALID, EMAIL_ALREADY_VERIFIED,
 * EMAIL_VERIFICATION_NOT_APPLICABLE, 503, hoặc lỗi chung).
 * @param {ApiError} error Lỗi nhận được.
 * @param {boolean} en true nếu giao diện đang ở tiếng Anh.
 * @returns {string} Thông điệp hiển thị.
 */
export function emailVerificationMessage(error, en) {
  if(error?.status === 429) return en ? 'Too many attempts. Wait 15 minutes before retrying.' : 'Bạn đã thao tác nhiều lần. Vui lòng chờ 15 phút trước khi thử lại.';
  if(error?.status === 401) return en ? 'Sign in again to continue.' : 'Đăng nhập lại để tiếp tục.';
  if(error?.code === 'EMAIL_VERIFICATION_INVALID') return en ? 'This link is invalid, expired or already used. Request a new link from your profile.' : 'Liên kết không hợp lệ, đã hết hạn hoặc đã dùng. Hãy yêu cầu liên kết mới từ trang tài khoản.';
  if(error?.code === 'EMAIL_ALREADY_VERIFIED') return en ? 'Email already verified. Refresh its status.' : 'Email đã được xác minh. Hãy cập nhật trạng thái.';
  if(error?.code === 'EMAIL_VERIFICATION_NOT_APPLICABLE') return en ? 'This account does not use password email verification.' : 'Tài khoản này không áp dụng xác minh email đăng nhập bằng mật khẩu.';
  if(error?.status === 503) return en ? 'Email verification is currently unavailable. Try again later.' : 'Dịch vụ xác minh email hiện chưa sẵn sàng. Vui lòng thử lại sau.';
  return en ? 'Unable to complete the request. Check your connection and retry.' : 'Chưa thực hiện được yêu cầu. Kiểm tra kết nối rồi thử lại.';
}
