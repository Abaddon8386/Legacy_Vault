import { API_BASE, ApiError, request } from '../api/http.js';
import { isUuid } from '../api/contracts.js';
import { readGroupView } from './groupHandoverService.js';

// PS-118: Legal side of the whole-group handover contract (PS-119/120 writes, PS-122 reads).
// Only the decision is a write; Legal never creates a reopen request and never records attendance.
/**
 * Trạng thái đích sau quyết định của Legal: APPROVE -> READY, REJECT -> SUSPENDED.
 */
const DECISION_STATE = { APPROVE: 'READY', REJECT: 'SUSPENDED' };
/**
 * Ném {@code INVALID_RESPONSE} khi điều kiện kiểm tra hợp đồng không thỏa.
 */
const fail = (condition, status = 0) => { if (!condition) throw new ApiError('INVALID_RESPONSE', status); };
/**
 * Kiểm tra số nguyên an toàn không âm.
 */
const count = value => Number.isSafeInteger(value) && value >= 0;
/**
 * Kiểm tra chuỗi không rỗng.
 */
const text = value => typeof value === 'string' && value.trim().length > 0;
/**
 * Kiểm tra chuỗi thời điểm parse được.
 */
const instant = value => text(value) && !Number.isNaN(Date.parse(value));
/**
 * Kiểm tra đối tượng người ({@code userId} UUID và {@code fullName}).
 */
const person = value => !!value && isUuid(value.userId) && text(value.fullName);
/**
 * Dựng đường dẫn {@code /legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover} (API phía Legal, vai trò LEGAL_VERIFIER).
 */
const scope = (caseId, sessionId) => {
  if (!isUuid(caseId) || !isUuid(sessionId)) throw new ApiError('VALIDATION_FAILED', 400);
  return `/legal-verifications/verification-cases/${caseId}/handover-sessions/${sessionId}/group-handover`;
};

/**
 * Xác thực một yêu cầu mở lại đang chờ Legal duyệt (mã hồ sơ dạng HS-yyyy-n, người yêu cầu, lý do <= 1000, số liệu tiến độ, {@code decidable = true}).
 */
function readPending(item) {
  fail(isUuid(item?.requestId) && isUuid(item.caseId) && isUuid(item.sessionId) && /^HS-\d{4}-\d+$/i.test(item.caseNumber ?? '')
    && text(item.vaultName) && instant(item.requestedAt) && person(item.requestedBy) && text(item.reason) && item.reason.length <= 1000
    && count(item.revision) && item.allPresent === true && count(item.requiredRecipients) && item.requiredRecipients > 0
    && count(item.presentRecipients) && item.presentRecipients <= item.requiredRecipients
    && count(item.totalAssets) && count(item.deliveredAssets) && item.deliveredAssets <= item.totalAssets && item.decidable === true);
  return item;
}

/**
 * Danh sách yêu cầu mở lại của Staff mà Legal có thể quyết định ngay: {@code GET /legal-verifications/group-handover/reopen-requests?page&size[&caseId]}.
 *
 * @returns {Promise<{content:Array,page:number,size:number,totalElements:number,totalPages:number}>}
 */
export async function loadReopenRequests({ page = 0, size = 20, caseId } = {}, options = {}) {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100 || (caseId && !isUuid(caseId))) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (caseId) query.set('caseId', caseId);
  const value = await request(`/legal-verifications/group-handover/reopen-requests?${query}`, { ...options, cache: 'no-store', expectedStatus: 200 });
  fail(Array.isArray(value?.content) && count(value.page) && count(value.size) && count(value.totalElements) && count(value.totalPages));
  return { ...value, content: value.content.map(readPending) };
}

/**
 * Trạng thái bàn giao nhóm của một hồ sơ/phiên theo góc nhìn Legal: {@code GET /legal-verifications/verification-cases/{caseId}/handover-sessions/{sessionId}/group-handover}.
 * Kiểm tra thêm capabilities, progress, attendance, request và lastDecision.
 */
export async function loadLegalGroupHandover(caseId, sessionId, options = {}) {
  const value = readGroupView(await request(scope(caseId, sessionId), { ...options, cache: 'no-store', expectedStatus: 200 }));
  fail(value.caseId === caseId && value.sessionId === sessionId && text(value.caseNumber));
  fail(value.capabilities && typeof value.capabilities.canDecide === 'boolean'
    && (value.capabilities.deliveryBlockedReason === null || text(value.capabilities.deliveryBlockedReason)));
  fail(value.progress && count(value.progress.requiredRecipients) && count(value.progress.presentRecipients)
    && count(value.progress.totalAssets) && count(value.progress.deliveredAssets));
  fail(value.attendance == null || (Array.isArray(value.attendance.presentRecipientIds) && value.attendance.presentRecipientIds.every(isUuid)
    && new Set(value.attendance.presentRecipientIds).size === value.attendance.presentRecipientIds.length
    && person(value.attendance.recordedBy) && instant(value.attendance.recordedAt) && text(value.attendance.reason)));
  fail(value.request == null || (isUuid(value.request.requestId) && instant(value.request.requestedAt) && person(value.request.requestedBy) && text(value.request.reason)));
  fail(value.lastDecision == null || (isUuid(value.lastDecision.eventId) && ['APPROVE', 'REJECT'].includes(value.lastDecision.result)
    && instant(value.lastDecision.decidedAt) && person(value.lastDecision.decidedBy) && text(value.lastDecision.reason)));
  return value;
}

/**
 * Lịch sử sự kiện (khóa, yêu cầu của Staff, quyết định của Legal), mới nhất trước, chỉ đọc:
 * {@code GET .../group-handover/events?page&size}.
 */
export async function loadGroupHandoverEvents(caseId, sessionId, { page = 0, size = 20 } = {}, options = {}) {
  if (!Number.isSafeInteger(page) || page < 0 || !Number.isSafeInteger(size) || size < 1 || size > 100) throw new ApiError('VALIDATION_FAILED', 400);
  const value = await request(`${scope(caseId, sessionId)}/events?${new URLSearchParams({ page: String(page), size: String(size) })}`,
    { ...options, cache: 'no-store', expectedStatus: 200 });
  fail(Array.isArray(value?.content) && count(value.page) && count(value.size) && count(value.totalElements) && count(value.totalPages));
  fail(value.content.every(event => isUuid(event?.eventId) && ['ATTENDANCE', 'REQUEST', 'APPROVE', 'REJECT'].includes(event.operation)
    && count(event.revision) && text(event.resultingStatus) && text(event.reason) && instant(event.at) && person(event.by)));
  return value;
}

/**
 * Legal decision on the current Staff request. The key makes a retry of the same decision idempotent;
 * the body carries no actor, time or scope (the server derives them).
 *
 * Legal quyết định yêu cầu mở lại: {@code POST .../group-handover/reopen-requests/{requestId}/decision} với {expectedRevision, decision APPROVE|REJECT, reason <= 1000}.
 * Gửi {@code Idempotency-Key}; phản hồi phải tăng revision thêm 1 và trạng thái khớp (READY hoặc SUSPENDED).
 *
 * @throws {ApiError} {@code VALIDATION_FAILED}, mã lỗi backend, {@code INVALID_RESPONSE}.
 */
export async function decideReopenRequest({ caseId, sessionId, requestId, decision, expectedRevision, reason }, key, options = {}) {
  const cleanReason = typeof reason === 'string' ? reason.trim() : '';
  if (!Object.hasOwn(DECISION_STATE, decision) || !isUuid(requestId) || !isUuid(key) || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0
    || !cleanReason || cleanReason.length > 1000) throw new ApiError('VALIDATION_FAILED', 400);
  const path = `${scope(caseId, sessionId)}/reopen-requests/${requestId}/decision`;
  let response;
  try {
    response = await (options.fetchFn || globalThis.fetch)(API_BASE + path, {
      method: 'POST', signal: options.signal, credentials: 'omit', cache: 'no-store',
      headers: { Authorization: `Bearer ${options.accessToken}`, 'Content-Type': 'application/json', Accept: 'application/json',
        'Accept-Language': options.lang === 'en' ? 'en' : 'vi', 'Idempotency-Key': key },
      body: JSON.stringify({ expectedRevision, decision, reason: cleanReason }),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  let result;
  try { result = await response.json(); } catch { throw new ApiError('INVALID_RESPONSE', response.status); }
  if (!response.ok) throw new ApiError(typeof result?.code === 'string' ? result.code : 'INTERNAL_ERROR', response.status);
  fail(response.status === 200 && result?.caseId === caseId && result.sessionId === sessionId && isUuid(result.eventId)
    && result.state?.revision === expectedRevision + 1 && result.state.status === DECISION_STATE[decision], response.status);
  return result;
}
