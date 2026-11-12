/**
 * staffCaseService.js - Lấy danh sách hồ sơ xác minh cho Staff (Staff Case Dashboard).
 * Re-export SYNTHETIC_STAFF_CASES và isStaffSimulationPermitted từ staffCasePreview.js.
 */
import { request, ApiError } from '../../api/http.js';
import { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
export { SYNTHETIC_STAFF_CASES, isStaffSimulationPermitted } from './staffCasePreview.js';
/**
 * Lấy một trang danh sách hồ sơ xác minh của Staff.
 *
 * Chế độ mô phỏng (dev preview/test): lọc SYNTHETIC_STAFF_CASES theo trạng thái và từ khóa q (số hồ sơ, tên kho, tên chủ kho) rồi phân trang trong bộ nhớ.
 * Chế độ thật: kiểm tra tham số (page nguyên >= 0, size 1..100, status thuộc ALL, OPEN, CANCELLED, CLOSED) rồi gọi
 * GET /api/v1/staff/verification-cases?page=&size=&status=&q= (HTTP 200, cache no-store). Phản hồi được kiểm tra chặt (phân trang, UUID, trạng thái, thời gian, định dạng caseNumber HS-yyyy-nnnnnn)
 * và mỗi phần tử được bổ sung id = caseId, caseNumber (hoặc caseId nếu thiếu), gracePeriodEndedAt = triggeredAt.
 * Được dùng bởi StaffCaseDashboard, LiveHandoverPage, BeneficiaryConfirmationPage và StaffCaseSelectorModal.
 * @param {Object} [options] { page = 0, size = 5, status = 'ALL', q, signal, accessToken, lang, isDevPreview, isTest }
 * @returns {Promise<{content: Object[], page: number, size: number, totalElements: number, totalPages: number, isSimulation: boolean}>}
 * @throws {Error} AbortError khi bị hủy.
 * @throws {ApiError} VALIDATION_FAILED (400) khi tham số sai; INVALID_RESPONSE khi phản hồi sai hợp đồng; lỗi API khác từ request().
 */
export async function fetchStaffCases(options = {}) {
  const { page = 0, size = 5, status = 'ALL', q, signal } = options;

  if (signal?.aborted) {
    const abortErr = new Error('Request aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  // Nếu được phép mô phỏng (DEV preview hoặc unit test):
  if (isStaffSimulationPermitted(options)) {
    // Độ trễ nhẹ mô phỏng mạng trong DEV preview khi không ở môi trường test
    const isTestEnvironment = Boolean(
      options.isTest ||
      (typeof globalThis !== 'undefined' && globalThis.IS_REACT_ACT_ENVIRONMENT)
    );
    if (!isTestEnvironment) {
      await new Promise((r) => setTimeout(r, 150));
    }

    if (signal?.aborted) {
      const abortErr = new Error('Request aborted');
      abortErr.name = 'AbortError';
      throw abortErr;
    }

    // Lọc theo trạng thái
    let filtered = [...SYNTHETIC_STAFF_CASES];
    if (status && status !== 'ALL') {
      filtered = filtered.filter((c) => c.status === status);
    }
    if (q && typeof q === 'string' && q.trim()) {
      const lower = q.trim().toLowerCase();
      filtered = filtered.filter((c) =>
        (c.caseNumber && c.caseNumber.toLowerCase().includes(lower)) ||
        (c.vaultName && c.vaultName.toLowerCase().includes(lower)) ||
        (c.ownerName && c.ownerName.toLowerCase().includes(lower))
      );
    }

    const totalElements = filtered.length;
    const totalPages = Math.max(1, Math.ceil(totalElements / size));
    const safePage = Math.min(page, totalPages - 1);
    const start = safePage * size;
    const paginated = filtered.slice(start, start + size);

    return {
      content: paginated,
      page: safePage,
      size,
      totalElements,
      totalPages,
      isSimulation: true,
    };
  }

  if (!Number.isInteger(page) || page < 0 || !Number.isInteger(size) || size < 1 || size > 100
    || !['ALL', 'OPEN', 'CANCELLED', 'CLOSED'].includes(status)) throw new ApiError('VALIDATION_FAILED', 400);
  const query = new URLSearchParams({ page: String(page), size: String(size) });
  if (status !== 'ALL') query.set('status', status);
  if (q && typeof q === 'string' && q.trim()) query.set('q', q.trim());
  const raw = await request(`/staff/verification-cases?${query}`, { ...options, cache: 'no-store', expectedStatus: 200 });
  const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
  if (!raw || !Array.isArray(raw.content) || raw.content.length > size) invalid();
  for (const key of ['page', 'size', 'totalElements', 'totalPages']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] < 0) invalid();
  }
  if (raw.size !== size || raw.page !== page || raw.totalElements < raw.content.length
    || raw.totalPages !== Math.ceil(raw.totalElements / size)) invalid();
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const content = raw.content.map(item => {
    if (!item || !['OPEN', 'CANCELLED', 'CLOSED'].includes(item.status)
      || !['caseId', 'vaultId', 'ownerId'].every(key => uuid.test(item[key]))
      || !['vaultName', 'ownerName'].every(key => typeof item[key] === 'string')
      || typeof item.triggeredAt !== 'string' || !Number.isFinite(Date.parse(item.triggeredAt))
      || (item.closedAt !== null && (typeof item.closedAt !== 'string' || !Number.isFinite(Date.parse(item.closedAt))))) invalid();
    if (item.caseNumber != null && !/^HS-\d{4}-\d{6,19}$/.test(item.caseNumber)) invalid();
    return { ...item, id: item.caseId, caseNumber: item.caseNumber || item.caseId, gracePeriodEndedAt: item.triggeredAt, isSimulation: false };
  });
  return { ...raw, content, totalPages: Math.max(1, raw.totalPages), isSimulation: false };
}
