/**
 * liveHandoverService.js - Gọi API thật cho phiên bàn giao (handover session) và các thao tác xác minh người thụ hưởng tại quầy.
 *
 * Mọi endpoint nằm dưới /api/v1/staff/verification-cases/{caseId}/... và yêu cầu vai trò STAFF_EXECUTOR.
 * Dữ liệu trả về được kiểm tra định dạng (UUID, trạng thái, thời gian); sai thì ném ApiError('INVALID_RESPONSE').
 * Được dùng bởi handoverSessionService.js, LiveHandoverPage, CloseAndArchivePage, BeneficiaryConfirmationPage, LegacyCounterBeneficiariesSection và các component trong components/staff.
 */
import { request, ApiError } from '../../api/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Kiểm tra giá trị có phải chuỗi UUID hợp lệ hay không (dùng cho caseId, sessionId, beneficiaryId...).
 * @param {*} value Giá trị cần kiểm tra.
 * @returns {boolean}
 */
export const isHandoverId = value => typeof value === 'string' && UUID.test(value);
/**
 * Dựng đường dẫn gốc của các phiên bàn giao thuộc một hồ sơ.
 * @param {string} caseId UUID hồ sơ xác minh.
 * @returns {string} '/staff/verification-cases/{caseId}/handover-sessions'
 * @throws {ApiError} VALIDATION_FAILED (400) nếu caseId không phải UUID.
 */
function root(caseId) {
  if (!isHandoverId(caseId)) throw new ApiError('VALIDATION_FAILED', 400);
  return `/staff/verification-cases/${caseId}/handover-sessions`;
}
/**
 * Kiểm tra và trả về một đối tượng phiên bàn giao do backend gửi về.
 *
 * Điều kiện hợp lệ: caseId khớp; sessionId, caseId, vaultId, staffId là UUID; sessionId khớp tham số nếu có; status thuộc OPEN, COMPLETED, CANCELLED;
 * openedAt là thời gian hợp lệ; closedAt phải là null khi OPEN và là thời gian hợp lệ ở các trạng thái còn lại.
 * @param {Object} value Phiên bàn giao thô từ backend.
 * @param {string} caseId Mã hồ sơ mong đợi.
 * @param {string} [sessionId] Mã phiên mong đợi (tùy chọn).
 * @returns {Object} Chính đối tượng value nếu hợp lệ.
 * @throws {ApiError} INVALID_RESPONSE khi sai định dạng.
 */
export function readSession(value, caseId, sessionId) {
  if (!value || value.caseId !== caseId || !['sessionId', 'caseId', 'vaultId', 'staffId'].every(key => isHandoverId(value[key]))
    || (sessionId && value.sessionId !== sessionId) || !['OPEN', 'COMPLETED', 'CANCELLED'].includes(value.status)
    || typeof value.openedAt !== 'string' || !Number.isFinite(Date.parse(value.openedAt))
    || (value.status === 'OPEN' ? value.closedAt !== null : typeof value.closedAt !== 'string' || !Number.isFinite(Date.parse(value.closedAt)))) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return value;
}
/**
 * Liệt kê các phiên bàn giao của hồ sơ: GET /api/v1/staff/verification-cases/{caseId}/handover-sessions (HTTP 200).
 * Kiểm tra mảng trả về, không trùng sessionId và tối đa một phiên OPEN.
 * @param {string} caseId UUID hồ sơ.
 * @param {Object} [options] Tùy chọn của request() (accessToken, lang, signal, fetchFn...).
 * @returns {Promise<Object[]>} Danh sách phiên bàn giao.
 * @throws {ApiError} VALIDATION_FAILED, INVALID_RESPONSE hoặc lỗi API.
 */
export async function listLiveSessions(caseId, options = {}) {
  const value = await request(root(caseId), { ...options, method: 'GET', expectedStatus: 200 });
  if (!Array.isArray(value)) throw new ApiError('INVALID_RESPONSE');
  const result = value.map(item => readSession(item, caseId));
  if (new Set(result.map(item => item.sessionId)).size !== result.length || result.filter(item => item.status === 'OPEN').length > 1) throw new ApiError('INVALID_RESPONSE');
  return result;
}
/**
 * Lấy chi tiết một phiên bàn giao: GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId} (HTTP 200).
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên bàn giao.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Phiên đã qua readSession().
 * @throws {ApiError} VALIDATION_FAILED (sessionId sai), INVALID_RESPONSE hoặc lỗi API.
 */
export async function getLiveSession(caseId, sessionId, options = {}) {
  if (!isHandoverId(sessionId)) throw new ApiError('VALIDATION_FAILED', 400);
  return readSession(await request(`${root(caseId)}/${sessionId}`, { ...options, method: 'GET', expectedStatus: 200 }), caseId, sessionId);
}
/**
 * Mở một phiên bàn giao mới: POST /api/v1/staff/verification-cases/{caseId}/handover-sessions (HTTP 201). Phiên trả về phải có status OPEN.
 * @param {string} caseId UUID hồ sơ.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Phiên vừa mở.
 * @throws {ApiError} INVALID_RESPONSE nếu trạng thái không phải OPEN, hoặc lỗi API từ backend.
 */
export async function openLiveSession(caseId, options = {}) {
  const value = readSession(await request(root(caseId), { ...options, method: 'POST', expectedStatus: 201 }), caseId);
  if (value.status !== 'OPEN') throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Hủy một phiên bàn giao: PATCH /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/status với body { status: 'CANCELLED' } (HTTP 200).
 * Phiên trả về phải có status CANCELLED.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên cần hủy.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Phiên đã hủy.
 * @throws {ApiError} VALIDATION_FAILED, INVALID_RESPONSE hoặc lỗi API.
 */
export async function cancelLiveSession(caseId, sessionId, options = {}) {
  if (!isHandoverId(sessionId)) throw new ApiError('VALIDATION_FAILED', 400);
  const value = readSession(await request(`${root(caseId)}/${sessionId}/status`, {
    ...options, method: 'PATCH', body: { status: 'CANCELLED' }, expectedStatus: 200,
  }), caseId, sessionId);
  if (value.status !== 'CANCELLED') throw new ApiError('INVALID_RESPONSE');
  return value;
}
/**
 * Dựng URL điều hướng trong ứng dụng, thêm query caseId, sessionId (chỉ khi là UUID hợp lệ) và lang=en (khi ngôn ngữ là tiếng Anh).
 * @param {string} path Đường dẫn gốc, ví dụ '/staff/handover'.
 * @param {string} [caseId] UUID hồ sơ.
 * @param {string} [sessionId] UUID phiên bàn giao (chỉ được thêm khi caseId cũng hợp lệ).
 * @param {string} [lang] 'vi' hoặc 'en'.
 * @returns {string} URL kèm query string (nếu có).
 */
export function handoverUrl(path, caseId, sessionId, lang) {
  const query = new URLSearchParams();
  if (isHandoverId(caseId)) query.set('caseId', caseId);
  if (isHandoverId(caseId) && isHandoverId(sessionId)) query.set('sessionId', sessionId);
  if (lang === 'en') query.set('lang', 'en');
  return path + (query.size ? `?${query}` : '');
}

/**
 * Dựng URL mở tab "Xác minh và liên kết" (tab=link) của trang bàn giao /staff/handover, để việc kiểm tra danh tính diễn ra ngay trong cùng không gian làm việc.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} sessionId UUID phiên bàn giao.
 * @param {string} lang 'vi' hoặc 'en'.
 * @returns {string} URL có thêm tham số tab=link.
 */
export function counterLinkTabUrl(caseId, sessionId, lang) {
  const base = handoverUrl('/staff/handover', caseId, sessionId, lang);
  return base + (base.includes('?') ? '&' : '?') + 'tab=link';
}

/**
 * Lấy danh sách người thụ hưởng của hồ sơ: GET /api/v1/staff/verification-cases/{caseId}/beneficiaries (HTTP 200).
 * @param {string} caseId UUID hồ sơ.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object[]>} Mảng người thụ hưởng.
 * @throws {ApiError} VALIDATION_FAILED, INVALID_RESPONSE (không phải mảng) hoặc lỗi API.
 */
export async function fetchStaffCaseBeneficiaries(caseId, options = {}) {
  if (!isHandoverId(caseId)) throw new ApiError('VALIDATION_FAILED', 400);
  const data = await request(`/staff/verification-cases/${caseId}/beneficiaries`, {
    ...options,
    method: 'GET',
    expectedStatus: 200,
  });
  if (!Array.isArray(data)) throw new ApiError('INVALID_RESPONSE');
  return data;
}

/**
 * Ghi nhận Staff đã xác minh danh tính người thụ hưởng trực tiếp tại quầy:
 * POST /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/identity-attestations (HTTP 201).
 * Body gồm evidenceReference (cắt khoảng trắng, tối đa 200 ký tự, bỏ qua nếu rỗng) và confirmedEmail (nếu có).
 * @param {string} caseId UUID hồ sơ.
 * @param {string} beneficiaryId UUID người thụ hưởng.
 * @param {{evidenceReference?: string, confirmedEmail?: string}} [payload] Dữ liệu xác nhận.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Biên nhận xác minh do backend trả về.
 * @throws {ApiError} VALIDATION_FAILED (UUID sai hoặc evidenceReference quá dài) hoặc lỗi API.
 */
export async function recordCounterAttestation(caseId, beneficiaryId, payload = {}, options = {}) {
  if (!isHandoverId(caseId) || !isHandoverId(beneficiaryId)) throw new ApiError('VALIDATION_FAILED', 400);
  const body = {};
  if (payload?.evidenceReference !== undefined && payload?.evidenceReference !== null) {
    const evidenceReference = String(payload.evidenceReference).trim();
    if (evidenceReference.length > 200) throw new ApiError('VALIDATION_FAILED', 400);
    if (evidenceReference) {
      body.evidenceReference = evidenceReference;
    }
  }
  if (payload?.confirmedEmail && typeof payload.confirmedEmail === 'string' && payload.confirmedEmail.trim()) {
    body.confirmedEmail = payload.confirmedEmail.trim();
  }
  return await request(`/staff/verification-cases/${caseId}/beneficiaries/${beneficiaryId}/identity-attestations`, {
    ...options,
    method: 'POST',
    body,
    expectedStatus: 201,
  });
}

/**
 * Yêu cầu backend gửi email mời kích hoạt tài khoản tới người thụ hưởng:
 * POST /api/v1/staff/verification-cases/{caseId}/beneficiaries/{beneficiaryId}/invitation-email với body { expectedGeneration } (HTTP 202 - đã nhận, gửi bất đồng bộ).
 * expectedGeneration là số thế hệ lời mời hiện tại để chống gửi trùng; giá trị không phải số nguyên được coi là 0.
 * @param {string} caseId UUID hồ sơ.
 * @param {string} beneficiaryId UUID người thụ hưởng.
 * @param {number} expectedGeneration Thế hệ lời mời mong đợi.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object>} Phản hồi 202 của backend.
 * @throws {ApiError} VALIDATION_FAILED hoặc lỗi API.
 */
export async function requestInvitationEmail(caseId, beneficiaryId, expectedGeneration, options = {}) {
  if (!isHandoverId(caseId) || !isHandoverId(beneficiaryId)) throw new ApiError('VALIDATION_FAILED', 400);
  const gen = Number.isInteger(expectedGeneration) ? expectedGeneration : 0;
  return await request(`/staff/verification-cases/${caseId}/beneficiaries/${beneficiaryId}/invitation-email`, {
    ...options,
    method: 'POST',
    body: { expectedGeneration: gen },
    expectedStatus: 202,
  });
}
