/**
 * staffContactService.js - Dịch vụ ghi nhận và xem lịch sử liên hệ của Staff với Người được ủy thác (Trustee) và Người thụ hưởng trên hồ sơ được giao.
 * Được dùng bởi StaffContactPanel.jsx. Các endpoint yêu cầu vai trò STAFF_EXECUTOR.
 */
import { request, ApiError } from '../../api/http.js';
import { isHandoverId } from './liveHandoverService.js';

/**
 * Các kênh liên hệ hợp lệ: điện thoại, email, gặp trực tiếp, khác (khớp enum backend).
 */
export const CONTACT_CHANNELS = ['PHONE', 'EMAIL', 'IN_PERSON', 'OTHER'];
/**
 * Các kết quả liên hệ hợp lệ: đã liên hệ được, không phản hồi, thông tin liên hệ không hợp lệ.
 */
export const CONTACT_OUTCOMES = ['CONTACTED', 'NO_RESPONSE', 'INVALID_CONTACT'];
/**
 * Trạng thái phương án dự phòng (fallback) sau liên hệ: không cần, cần thực hiện, đang thực hiện, đã hoàn tất.
 */
export const CONTACT_FALLBACKS = ['NOT_REQUIRED', 'REQUIRED', 'IN_PROGRESS', 'COMPLETED'];

/**
 * Kiểm tra một bản ghi lần liên hệ do backend trả về (id UUID, channel, outcome, fallbackStatus hợp lệ và occurredAt là thời gian hợp lệ).
 * @param {Object} value Bản ghi thô.
 * @returns {Object} Chính value nếu hợp lệ.
 * @throws {ApiError} INVALID_RESPONSE khi sai định dạng.
 */
function readRecord(value) {
  if (!value || !isHandoverId(value.id) || !CONTACT_CHANNELS.includes(value.channel)
    || !CONTACT_OUTCOMES.includes(value.outcome) || !CONTACT_FALLBACKS.includes(value.fallbackStatus)
    || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return value;
}

/**
 * Kiểm tra một người cần liên hệ (kind là TRUSTEE hoặc BENEFICIARY, id UUID, fullName là chuỗi, contacts là mảng) và chuẩn hóa dữ liệu.
 * Mỗi bản ghi trong contacts được kiểm tra bằng readRecord(); canRecord được ép về boolean.
 * @param {Object} value Người thô từ backend.
 * @returns {Object} Người đã chuẩn hóa.
 * @throws {ApiError} INVALID_RESPONSE khi sai định dạng.
 */
function readPerson(value) {
  if (!value || !['TRUSTEE', 'BENEFICIARY'].includes(value.kind) || !isHandoverId(value.id)
    || typeof value.fullName !== 'string' || !Array.isArray(value.contacts)) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return { ...value, canRecord: value.canRecord === true, contacts: value.contacts.map(readRecord) };
}

/**
 * Lấy những người Staff phải liên hệ trên hồ sơ OPEN được giao: Trustee được bổ nhiệm trước, sau đó là các Người thụ hưởng.
 * Gọi GET /api/v1/staff/verification-cases/{caseId}/contacts (HTTP 200, cache no-store); phản hồi phải có caseId khớp và mảng people.
 * Được StaffContactPanel.jsx gọi khi mở tab Liên hệ.
 * @param {string} caseId UUID hồ sơ.
 * @param {Object} [options] Tùy chọn của request() (accessToken, lang, signal...).
 * @returns {Promise<Object[]>} Danh sách người đã chuẩn hóa (kèm lịch sử liên hệ).
 * @throws {ApiError} VALIDATION_FAILED (400) nếu caseId sai; INVALID_RESPONSE; hoặc lỗi API.
 */
export async function fetchCaseContacts(caseId, options = {}) {
  if (!isHandoverId(caseId)) throw new ApiError('VALIDATION_FAILED', 400);
  const data = await request(`/staff/verification-cases/${caseId}/contacts`, {
    ...options, method: 'GET', expectedStatus: 200, cache: 'no-store',
  });
  if (!data || data.caseId !== caseId || !Array.isArray(data.people)) throw new ApiError('INVALID_RESPONSE');
  return data.people.map(readPerson);
}

/**
 * Ghi nhận một lần liên hệ với Trustee; lịch sử chỉ được thêm vào (append-only) ở phía server.
 * Gọi POST /api/v1/staff/trustees/{trusteeId}/contact-outcomes với body { channel, outcome, fallbackStatus, note? } (HTTP 201).
 * note được cắt khoảng trắng, tối đa 500 ký tự và bỏ qua nếu rỗng. Được StaffContactPanel.jsx gọi khi gửi biểu mẫu.
 * @param {string} trusteeId UUID Trustee.
 * @param {{channel: string, outcome: string, fallbackStatus: string, note?: string}} payload Nội dung lần liên hệ.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Bản ghi liên hệ vừa tạo (đã qua readRecord()).
 * @throws {ApiError} VALIDATION_FAILED (400) khi tham số sai hoặc note quá dài; INVALID_RESPONSE; hoặc lỗi API.
 */
export async function recordTrusteeContact(trusteeId, payload, options = {}) {
  if (!isHandoverId(trusteeId) || !CONTACT_CHANNELS.includes(payload?.channel)
    || !CONTACT_OUTCOMES.includes(payload?.outcome) || !CONTACT_FALLBACKS.includes(payload?.fallbackStatus)) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (note.length > 500) throw new ApiError('VALIDATION_FAILED', 400);
  const body = { channel: payload.channel, outcome: payload.outcome, fallbackStatus: payload.fallbackStatus };
  if (note) body.note = note;
  return readRecord(await request(`/staff/trustees/${trusteeId}/contact-outcomes`, {
    ...options, method: 'POST', body, expectedStatus: 201,
  }));
}
