/**
 * Các hành động gọi backend cho luồng liên kết người thụ hưởng với hồ sơ: phía người thụ hưởng (liveCaseLinkActions) và phía nhân viên (liveCounterLinkActions).
 * Đối tượng này được đăng ký trong main.jsx và dùng bởi pages/beneficiary/CaseLinkWorkspace.jsx, pages/staff/StaffCaseLinkPanel.jsx.
 */
import { request, ApiError } from '../api/http.js';
import { isUuid, isUtcDate } from '../api/contracts.js';
import { REQUEST_STATES } from './caseLinkModel.js';
import { recordCounterAttestation } from '../pages/staff/liveHandoverService.js';

/**
 * Ném ApiError INVALID_RESPONSE.
 */
const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
/**
 * Kiểm tra giá trị là UUID, nếu không ném ApiError VALIDATION_FAILED (400).
 */
const id = value => { if (!isUuid(value)) throw new ApiError('VALIDATION_FAILED', 400); return value; };

/**
 * Forward compatibility: Extracts optional rejection reason when present in raw response.
 * Rejects non-string types (objects, arrays, numbers, booleans) with INVALID_RESPONSE.
 * Prioritizes 'reason' over 'rejectionReason'.
 */
function extractOptionalReason(raw) {
  if (raw.reason !== undefined && raw.reason !== null && typeof raw.reason !== 'string') invalid();
  if (raw.rejectionReason !== undefined && raw.rejectionReason !== null && typeof raw.rejectionReason !== 'string') invalid();
  const r = typeof raw.reason === 'string' ? raw.reason.trim() : '';
  const rr = typeof raw.rejectionReason === 'string' ? raw.rejectionReason.trim() : '';
  return r.length > 0 ? r : rr.length > 0 ? rr : null;
}

/**
 * Chuẩn hóa một yêu cầu liên kết trả về cho chính người gửi (requestId, status, createdAt, expiresAt); backend cố ý không trả thông tin hồ sơ/người nhận nên caseNumber là null.
 */
function own(raw) {
  if (!isUuid(raw?.requestId) || !REQUEST_STATES.includes(raw.status) ||
      !isUtcDate(raw.createdAt) || !isUtcDate(raw.expiresAt)) invalid();
  // BE deliberately omits case/recipient information from the requester's response.
  const item = { id: raw.requestId, caseNumber: null, status: raw.status, createdAt: raw.createdAt, expiresAt: raw.expiresAt };
  const reason = extractOptionalReason(raw);
  if (reason) item.reason = reason;
  return item;
}

/**
 * Tạo đường dẫn /staff/verification-cases/{caseId} (kiểm tra caseId là UUID).
 */
const path = caseId => `/staff/verification-cases/${id(caseId)}`;
/**
 * Hành động của người thụ hưởng đã đăng nhập: xem, gửi, hủy yêu cầu liên kết hồ sơ và xem trạng thái bàn giao.
 */
export const liveCaseLinkActions = {
  /**
   * GET /api/v1/beneficiary-link-requests: danh sách yêu cầu liên kết của chính người dùng.
   */
  async listOwn(options) {
    const raw = await request('/beneficiary-link-requests', { ...options, expectedStatus: 200 });
    if (!Array.isArray(raw)) invalid();
    return raw.map(own);
  },
  /**
   * POST /api/v1/beneficiary-link-requests với body {caseCode}: gửi yêu cầu liên kết bằng mã hồ sơ (mong đợi 201).
   */
  async submit({ caseNumber }, options) {
    return own(await request('/beneficiary-link-requests', { ...options, method: 'POST',
      body: { caseCode: caseNumber }, expectedStatus: 201 }));
  },
  /**
   * POST /api/v1/beneficiary-link-requests/{requestId}/cancel: hủy yêu cầu; kiểm tra kết quả phải là CANCELLED đúng id.
   */
  async cancel({ requestId }, options) {
    const result = own(await request(`/beneficiary-link-requests/${id(requestId)}/cancel`, {
      ...options, method: 'POST', expectedStatus: 200 }));
    if (result.id !== requestId || result.status !== 'CANCELLED') invalid();
    return result;
  },
  /**
   * GET /api/v1/beneficiary-handover-status (no-store): tình trạng bàn giao các hồ sơ của người thụ hưởng; kiểm tra subjectId khớp userId.
   */
  async loadHandoverStatus(options = {}) {
    const raw = await request('/beneficiary-handover-status', { ...options, expectedStatus: 200, cache: 'no-store' });
    if (!raw || typeof raw.subjectId !== 'string' || !Array.isArray(raw.cases)) invalid();
    if (options.userId && raw.subjectId !== options.userId) invalid();
    return raw;
  },
};
/**
 * Hành động của nhân viên (ROLE_STAFF_EXECUTOR) tại quầy để xử lý yêu cầu liên kết của hồ sơ.
 */
export const liveCounterLinkActions = {
  counterEvidenceMode: 'OPTIONAL',
  /**
   * GET /api/v1/staff/verification-cases/{caseId}/link-requests: các yêu cầu liên kết đang chờ (phải là PENDING kèm requesterName, requesterEmail).
   */
  async listPending({ caseId }, options) {
    const raw = await request(`${path(caseId)}/link-requests`, { ...options, expectedStatus: 200 });
    if (!Array.isArray(raw)) invalid();
    return raw.map(item => {
      const row = own(item);
      if (row.status !== 'PENDING' || !item.requesterName?.trim() || !item.requesterEmail?.includes('@')) invalid();
      return { ...row, accountId: null, accountName: item.requesterName, accountEmail: item.requesterEmail };
    });
  },
  /**
   * POST /api/v1/staff/verification-cases/{caseId}/accounts với {fullName,email,password}: tạo tài khoản chưa liên kết cho người nhận (mong đợi 201, linkStatus UNLINKED).
   */
  async createAccount({ caseId, fullName, email, password }, options) {
    const raw = await request(`${path(caseId)}/accounts`, { ...options, method: 'POST',
      body: { fullName, email, password }, expectedStatus: 201 });
    if (!isUuid(raw?.accountId) || raw.linkStatus !== 'UNLINKED') invalid();
    return { accountId: raw.accountId, linked: false };
  },
  /**
   * Duyệt yêu cầu: trước hết ghi nhận đối chứng tại quầy qua recordCounterAttestation (liveHandoverService), nếu thành công mới POST /api/v1/staff/verification-cases/{caseId}/link-requests/{requestId}/approve với {beneficiaryId}; kiểm tra kết quả APPROVED.
   */
  async approve({ caseId, requestId, recipientId, evidenceReference }, options) {
    id(requestId); id(recipientId); path(caseId);
    // Save the existing counter identity record first; failure must not proceed to linking.
    const attestationPayload = {};
    if (typeof evidenceReference === 'string' && evidenceReference.trim()) {
      attestationPayload.evidenceReference = evidenceReference.trim();
    }
    await recordCounterAttestation(caseId, recipientId, attestationPayload, options);
    const raw = await request(`${path(caseId)}/link-requests/${requestId}/approve`, {
      ...options, method: 'POST', body: { beneficiaryId: recipientId }, expectedStatus: 200 });
    if (raw?.requestId !== requestId || raw.status !== 'APPROVED' || raw.beneficiaryId !== recipientId || !isUuid(raw.accountId)) invalid();
    return { id: requestId, caseNumber: null, status: 'APPROVED', accountId: raw.accountId };
  },
  /**
   * POST /api/v1/staff/verification-cases/{caseId}/link-requests/{requestId}/reject: từ chối yêu cầu; kết quả phải là REJECTED và không có accountId/beneficiaryId.
   */
  async reject({ caseId, requestId }, options) {
    const raw = await request(`${path(caseId)}/link-requests/${id(requestId)}/reject`, {
      ...options, method: 'POST', expectedStatus: 200 });
    if (raw?.requestId !== requestId || raw.status !== 'REJECTED' || raw.accountId != null || raw.beneficiaryId != null) invalid();
    return { id: requestId, caseNumber: null, status: 'REJECTED', accountId: null };
  },
};
