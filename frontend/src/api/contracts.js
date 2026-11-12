import { ApiError } from './http.js';
/**
 * Kiểm tra một giá trị có phải chuỗi UUID hợp lệ (8-4-4-4-12 ký tự hex) hay không.
 * Dùng để chặn id sai định dạng trước khi gọi API hoặc khi kiểm tra phản hồi từ backend.
 * @param {*} value Giá trị cần kiểm tra.
 * @returns {boolean} true nếu là UUID.
 */
export const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/**
 * Kiểm tra một giá trị có phải chuỗi thời điểm UTC (kết thúc bằng "Z") và parse được thành ngày hợp lệ.
 * Backend luôn trả thời gian dạng ISO-8601 UTC nên dùng hàm này để xác thực phản hồi.
 * @param {*} value Giá trị cần kiểm tra.
 * @returns {boolean} true nếu hợp lệ.
 */
export const isUtcDate = value => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value));
/**
 * Danh sách vai trò mà frontend hiểu (đã bỏ tiền tố {@code ROLE_}).
 */
const appRoles = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];
// BE authorities use ROLE_ prefixes; keep the FE's existing role names internally.
/**
 * Bảng ánh xạ tên vai trò (có hoặc không có tiền tố {@code ROLE_}) về tên vai trò nội bộ của frontend.
 */
const roleAliases = new Map(appRoles.flatMap(role => [[role, role], [`ROLE_${role}`, role]]));
/**
 * Xác thực và chuẩn hóa đối tượng người dùng do backend trả về (ví dụ từ {@code POST /api/v1/auth/login},
 * {@code GET /api/v1/auth/me}, đăng nhập Google).
 * Kiểm tra id là UUID, fullName/email hợp lệ, roles là mảng vai trò đã biết; {@code phoneNumber} và
 * {@code passwordLoginEnabled} là tùy chọn nhưng nếu có phải đúng kiểu. Vai trò {@code ROLE_X} được đổi thành {@code X} và loại trùng.
 * @param {object} raw Dữ liệu thô từ backend.
 * @returns {{id:string, fullName:string, email:string, roles:string[], phoneNumber?:(string|null), passwordLoginEnabled?:boolean}} Người dùng đã chuẩn hóa.
 * @throws {ApiError} {@code INVALID_AUTH_RESPONSE} khi dữ liệu sai hợp đồng.
 */
export function readUser(raw) {
  if (!isUuid(raw?.id) || typeof raw.fullName !== 'string' || !raw.fullName.trim() ||
      typeof raw.email !== 'string' || !raw.email.includes('@') || !Array.isArray(raw.roles) ||
      !raw.roles.every(role => roleAliases.has(role))) throw new ApiError('INVALID_AUTH_RESPONSE');
  if (Object.hasOwn(raw, 'phoneNumber') && raw.phoneNumber !== null && typeof raw.phoneNumber !== 'string') throw new ApiError('INVALID_AUTH_RESPONSE');
  if (Object.hasOwn(raw, 'passwordLoginEnabled') && typeof raw.passwordLoginEnabled !== 'boolean') throw new ApiError('INVALID_AUTH_RESPONSE');
  return { id: raw.id, fullName: raw.fullName, email: raw.email, roles: [...new Set(raw.roles.map(role => roleAliases.get(role)))],
    ...(Object.hasOwn(raw, 'phoneNumber') ? { phoneNumber: raw.phoneNumber } : {}),
    ...(Object.hasOwn(raw, 'passwordLoginEnabled') ? { passwordLoginEnabled: raw.passwordLoginEnabled } : {}) };
}
