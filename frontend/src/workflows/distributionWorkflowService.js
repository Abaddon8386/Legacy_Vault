import { ApiError, request } from '../api/http.js';
import { isUuid } from '../api/contracts.js';

// Proposed FE contract. The server remains responsible for each transition.
/**
 * Bảng các thao tác của quy trình phân chia di sản. Mỗi mục: [không gian làm việc được phép (STAFF hoặc LEGAL), đoạn đường dẫn API (null nếu thao tác đi qua luồng khác như tải giấy tờ), các pha cho phép].
 * Máy chủ vẫn là bên quyết định chuyển trạng thái; bảng này chỉ để giao diện bật/tắt nút.
 */
export const distributionActions = {
  requestDocuments: ['LEGAL', 'request-documents', ['DOCUMENT_REQUEST_NEEDED']],
  uploadDocuments: ['STAFF', null, ['AWAITING_DOCUMENTS']],
  forwardDocuments: ['STAFF', null, ['AWAITING_DOCUMENTS']],
  approveDocuments: ['LEGAL', 'approve-documents', ['DOCUMENTS_UNDER_REVIEW']],
  requestDocumentSupplementation: ['LEGAL', 'request-document-supplementation', ['DOCUMENTS_UNDER_REVIEW', 'REJECTED']],
  submitAllocations: ['STAFF', 'submit-allocations', ['AWAITING_ALLOCATIONS']],
  approveAllocations: ['LEGAL', 'approve-allocations', ['ALLOCATIONS_UNDER_REVIEW']],
  requestAllocationChanges: ['LEGAL', 'request-allocation-changes', ['ALLOCATIONS_UNDER_REVIEW']],
};
/**
 * Các pha hợp lệ của quy trình phân chia: PREREQUISITES_PENDING, DOCUMENT_REQUEST_NEEDED, AWAITING_DOCUMENTS, DOCUMENTS_UNDER_REVIEW, AWAITING_ALLOCATIONS, ALLOCATIONS_UNDER_REVIEW, FINAL_APPROVAL, REJECTED, APPROVED, UNLOCKED, CLOSED.
 */
export const distributionPhases = ['PREREQUISITES_PENDING', 'DOCUMENT_REQUEST_NEEDED', 'AWAITING_DOCUMENTS',
  'DOCUMENTS_UNDER_REVIEW', 'AWAITING_ALLOCATIONS', 'ALLOCATIONS_UNDER_REVIEW', 'FINAL_APPROVAL', 'REJECTED', 'APPROVED', 'UNLOCKED', 'CLOSED'];
/**
 * Kiểm tra số nguyên dương.
 */
const positive = value => Number.isSafeInteger(value) && value > 0;
/**
 * Kiểm tra chuỗi SHA-256 dạng hex 64 ký tự.
 */
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
/**
 * Kiểm tra lý do không rỗng, tối đa 1000 ký tự.
 */
const reason = value => typeof value === 'string' && !!value.trim() && value.trim().length <= 1000;
/**
 * Ném {@link ApiError} (mặc định {@code INVALID_RESPONSE}) khi điều kiện sai.
 */
const fail = (condition, code = 'INVALID_RESPONSE') => { if (!condition) throw new ApiError(code); };
/**
 * Dựng đường dẫn quy trình: {@code /staff/verification-cases/{caseId}/distribution-workflow} (STAFF) hoặc {@code /legal-verifications/verification-cases/{caseId}/distribution-workflow} (LEGAL).
 */
const root = (caseId, workspace) => {
  fail(isUuid(caseId) && ['STAFF', 'LEGAL'].includes(workspace), 'VALIDATION_FAILED');
  return `${workspace === 'STAFF' ? '/staff' : '/legal-verifications'}/verification-cases/${caseId}/distribution-workflow`;
};
/**
 * Xác thực toàn bộ dữ liệu quy trình phân chia: caseId, revision, phase, prerequisites (deathApproved, willMatched), request, document (version, sha256, status), allocation (các dòng tài sản - người nhận) và capabilities của từng action.
 * @throws {ApiError} {@code INVALID_RESPONSE}.
 */
export function validateDistributionWorkflow(value, caseId) {
  fail(value?.caseId === caseId && Number.isSafeInteger(value.revision) && value.revision >= 0 && distributionPhases.includes(value.phase));
  fail(typeof value.prerequisites?.deathApproved === 'boolean' && typeof value.prerequisites?.willMatched === 'boolean');
  fail(value.request === null || (isUuid(value.request?.id) && reason(value.request.reason)));
  fail(value.document === null || (positive(value.document?.version) && hash(value.document.sha256)
    && ['PENDING', 'APPROVED', 'CHANGES_REQUESTED'].includes(value.document.status)));
  fail(value.allocation === null || (positive(value.allocation?.version) && positive(value.allocation.documentVersion)
    && hash(value.allocation.sha256) && ['SUBMITTED', 'APPROVED', 'CHANGES_REQUESTED'].includes(value.allocation.status)
    && Array.isArray(value.allocation.items) && value.allocation.items.every(row => isUuid(row.assetId) && isUuid(row.beneficiaryId)
      && typeof row.assetName === 'string' && typeof row.recipientName === 'string' && typeof row.description === 'string')));
  for (const action of Object.keys(distributionActions)) {
    const capability = value.capabilities?.[action];
    fail(typeof capability?.allowed === 'boolean' && (capability.allowed ? capability.blockedReason === null : typeof capability.blockedReason === 'string'));
  }
  fail(value.feedback == null || (typeof value.feedback === 'string' && value.feedback.length <= 1000));
  return value;
}
/**
 * Quyết định giao diện có cho phép một action hay không: đúng không gian làm việc, đúng pha, capability do server cho phép, tiền đề tử vong/di chúc đã đạt,
 * và các điều kiện phụ (có yêu cầu, giấy tờ đã duyệt, phân bổ đã gửi và khớp phiên bản giấy tờ).
 * @returns {boolean}
 */
export function canUseDistributionAction(value, action, workspace) {
  const rule = distributionActions[action];
  if (!rule || rule[0] !== workspace || !rule[2].includes(value?.phase) || value.capabilities?.[action]?.allowed !== true
      || !value.prerequisites?.deathApproved || !value.prerequisites?.willMatched) return false;
  if (['uploadDocuments', 'forwardDocuments', 'approveDocuments', 'requestDocumentSupplementation'].includes(action) && !value.request) return false;
  if (['approveDocuments', 'requestDocumentSupplementation'].includes(action) && !value.document) return false;
  if (['submitAllocations', 'approveAllocations', 'requestAllocationChanges'].includes(action)
      && (value.document?.status !== 'APPROVED' || !value.request)) return false;
  if (['approveAllocations', 'requestAllocationChanges'].includes(action)
      && (value.allocation?.status !== 'SUBMITTED' || value.allocation.documentVersion !== value.document.version || !value.allocation.items.length)) return false;
  return true;
}
/**
 * Kiểm tra phiên bản giấy tờ mới nhất trong hồ sơ ({@code dossier.versions}) khớp version và sha256 của giấy tờ trong quy trình.
 */
export function documentMatchesWorkflow(value, dossier) {
  const latest = dossier?.versions?.reduce((best, item) => !best || item.version > best.version ? item : best, null);
  return !!latest && latest.version === value?.document?.version && latest.sha256?.toLowerCase() === value.document.sha256.toLowerCase();
}
/**
 * Kiểm tra quy trình đã sẵn sàng cho bước cuối (phê duyệt cuối hoặc mở khóa có kiểm soát): pha đúng, tiền đề đạt, giấy tờ và phân bổ đã APPROVED, khớp phiên bản,
 * giấy tờ khớp hồ sơ căn cứ và hash phân bổ khớp snapshot.
 */
export function distributionFinalReady(value, context, step) {
  const phase = step === 'controlled-unlock' ? 'APPROVED' : 'FINAL_APPROVAL';
  return (value?.phase === phase || (step === 'approval-review' && value?.phase === 'APPROVED' && context?.snapshot?.approvalCurrent === true)) && value.prerequisites.deathApproved && value.prerequisites.willMatched
    && value.document?.status === 'APPROVED' && value.allocation?.status === 'APPROVED'
    && value.allocation.documentVersion === value.document.version && value.allocation.items.length > 0
    && documentMatchesWorkflow(value, context?.basisDossier)
    && context.snapshot?.allocationHash?.toLowerCase() === value.allocation.sha256.toLowerCase();
}
/**
 * Tải quy trình phân chia: {@code GET /staff/verification-cases/{caseId}/distribution-workflow} (STAFF) hoặc {@code GET /legal-verifications/verification-cases/{caseId}/distribution-workflow} (LEGAL), không cache.
 */
export async function loadDistributionWorkflow(caseId, workspace, options) {
  return validateDistributionWorkflow(await request(root(caseId, workspace), { ...options, expectedStatus: 200, cache: 'no-store' }), caseId);
}
/**
 * Thực hiện một action của quy trình: {@code POST .../distribution-workflow/{request-documents|approve-documents|request-document-supplementation|submit-allocations|approve-allocations|request-allocation-changes}}.
 * Trước khi gửi chạy {@link preflightDistributionAction} (tải lại và so sánh revision/phạm vi, lệch thì ném {@code CONFLICT}); body gồm revision hiện tại, lý do hoặc danh sách phân bổ,
 * và phiên bản/sha256 giấy tờ, phân bổ để máy chủ chống ghi đè.
 * @returns {Promise<object>} Biên nhận (receipt) có revision mới hơn.
 */
export async function saveDistributionAction(caseId, workspace, action, input, expected, options) {
  const rule = distributionActions[action];
  fail(rule?.[1] && canUseDistributionAction(expected, action, workspace), 'CONFLICT');
  const current = await preflightDistributionAction(caseId, workspace, action, expected, options);
  const body = { revision: current.revision };
  if (action === 'submitAllocations') {
    fail(Array.isArray(input.allocations) && input.allocations.length > 0, 'VALIDATION_FAILED');
    body.allocations = input.allocations;
  } else { fail(reason(input.reason), 'VALIDATION_FAILED'); body.reason = input.reason.trim(); }
  if (current.document) Object.assign(body, { documentVersion: current.document.version, documentSha256: current.document.sha256 });
  if (current.allocation && ['approveAllocations', 'requestAllocationChanges'].includes(action)) {
    Object.assign(body, { allocationVersion: current.allocation.version, allocationSha256: current.allocation.sha256 });
  }
  const receipt = await request(`${root(caseId, workspace)}/${rule[1]}`, { ...options, method: 'POST', body, expectedStatus: 200 });
  fail(receipt?.caseId === caseId && receipt.action === action && Number.isSafeInteger(receipt.revision) && receipt.revision > current.revision);
  return receipt;
}

/**
 * Kiểm tra trước khi ghi: tải lại quy trình, bảo đảm revision và phạm vi (giấy tờ, phân bổ, yêu cầu) không đổi so với dữ liệu người dùng đang xem và action vẫn được phép.
 * @throws {ApiError} {@code CONFLICT} khi đã thay đổi; {@code AbortError} khi bị hủy.
 */
export async function preflightDistributionAction(caseId, workspace, action, expected, options) {
  if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  const current = await loadDistributionWorkflow(caseId, workspace, options);
  const scope = value => JSON.stringify({ document: value?.document, allocation: value?.allocation && {
    version: value.allocation.version, documentVersion: value.allocation.documentVersion, sha256: value.allocation.sha256, status: value.allocation.status,
  }, requestId: value?.request?.id });
  fail(current.revision === expected?.revision && scope(current) === scope(expected) && canUseDistributionAction(current, action, workspace), 'CONFLICT');
  if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
  return current;
}

/**
 * Kiểm tra trước các bước cuối (Legal): revision không đổi và {@link distributionFinalReady} đúng, nếu không ném {@code CONFLICT}.
 */
export async function preflightDistributionFinal(caseId, expected, context, step, options) {
  const current = await loadDistributionWorkflow(caseId, 'LEGAL', options);
  fail(current.revision === expected?.revision && distributionFinalReady(current, context, step), 'CONFLICT');
  if (options.signal?.aborted) throw new DOMException('Request cancelled', 'AbortError');
}
