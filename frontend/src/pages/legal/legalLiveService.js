/**
 * Lớp dịch vụ gọi các API xác minh pháp lý của vai trò LEGAL_VERIFIER (tiền tố /api/v1/legal-verifications) qua request() trong api/http.js.
 * Mọi hàm đều kiểm tra đầu vào (UUID, quyền LEGAL_VERIFIER) và xác thực chặt cấu trúc phản hồi; sai lệch ném ApiError (VALIDATION_FAILED, ACCESS_DENIED, INVALID_RESPONSE).
 * Được dùng bởi LegalLiveWorkflow, LegalHoldControls, LegalFinalDecision, LegalDossierReviewPage, LegalDeathVerificationPage và các trang Legal khác.
 */
// Uses current Legal APIs; notarial processing requires the BE changes proposed in the PR.
import { ApiError, request } from '../../api/http.js';
import { isUuid, isUtcDate } from '../../api/contracts.js';

/** Tiền tố đường dẫn API của nhóm xác minh pháp lý (sau /api/v1). */
const root = '/legal-verifications';
/** Kiểm tra chuỗi SHA-256 dạng hex 64 ký tự. */
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
/** Kiểm tra giá trị là chuỗi không rỗng sau khi cắt khoảng trắng. */
const text = value => typeof value === 'string' && Boolean(value.trim());
/** Kiểm tra số phiên bản là số nguyên an toàn lớn hơn 0. */
const version = value => Number.isSafeInteger(value) && value > 0;
/** Kiểm tra chuỗi thời điểm ISO (bắt đầu bằng YYYY-MM-DDT và parse được). */
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
/** Nếu điều kiện sai thì ném ApiError với mã chỉ định (mặc định INVALID_RESPONSE). */
function requireValue(ok, code = 'INVALID_RESPONSE') { if (!ok) throw new ApiError(code); }
/**
 * Kiểm tra caseId (UUID) và quyền (có accessToken và vai trò LEGAL_VERIFIER) rồi trả về đường dẫn gốc của hồ sơ: /legal-verifications/verification-cases/{caseId}.
 *
 * @throws {ApiError} VALIDATION_FAILED hoặc ACCESS_DENIED.
 */
function context(caseId, options) {
  requireValue(isUuid(caseId), 'VALIDATION_FAILED');
  requireValue(options.accessToken && options.roles?.includes('LEGAL_VERIFIER'), 'ACCESS_DENIED');
  return `${root}/verification-cases/${caseId}`;
}
/**
 * Chuẩn hóa lý do nhập từ người dùng: cắt khoảng trắng, tối đa 1000 ký tự, bắt buộc không rỗng nếu required.
 *
 * @returns {string} Lý do đã cắt khoảng trắng.
 * @throws {ApiError} VALIDATION_FAILED.
 */
function reason(value, required = true) {
  requireValue((!required || text(value)) && (value == null || (typeof value === 'string' && value.trim().length <= 1000)), 'VALIDATION_FAILED');
  return value?.trim() || '';
}
/** Kiểm tra id người thực hiện trong phản hồi là UUID và khớp với userId của phiên (nếu có). */
function actor(value, options) { return isUuid(value) && (!options.userId || options.userId === value); }
/** Kiểm tra một dòng phân bổ tài sản: assetId/beneficiaryId là UUID, các trường văn bản hợp lệ, recipientSource thuộc OWNER_DESIGNATED/COURT_DOCUMENT, sourceVersionNo và accountLinked đúng kiểu. */
function allocation(row) {
  return isUuid(row?.assetId) && isUuid(row.beneficiaryId)
    && ['description', 'assetName', 'assetType', 'recipientName', 'recipientRelationship'].every(key => row[key] == null || typeof row[key] === 'string')
    && (row.recipientSource == null || ['OWNER_DESIGNATED', 'COURT_DOCUMENT'].includes(row.recipientSource))
    && (row.sourceVersionNo == null || version(row.sourceVersionNo))
    && (row.accountLinked === undefined || typeof row.accountLinked === 'boolean');
}
/**
 * Kiểm tra hồ sơ căn cứ pháp lý (basis dossier) trả về từ server: caseId khớp, route thuộc NOTARIAL/COURT/ON_HOLD, có status/disputeStatus/requiredVersion, các version có SHA-256, forwardStatus và allocations hợp lệ.
 *
 * @returns {object} Chính dossier đã được xác thực.
 */
function dossier(value, caseId) {
  requireValue(value?.caseId === caseId && isUuid(value.id) && ['NOTARIAL', 'COURT', 'ON_HOLD'].includes(value.route)
    && text(value.status) && text(value.disputeStatus) && version(value.requiredVersion) && Array.isArray(value.versions)
    && value.versions.every(item => version(item.version) && hash(item.sha256) && ['NOT_FORWARDED', 'FORWARDED'].includes(item.forwardStatus)
      && (item.allocations == null || (Array.isArray(item.allocations) && item.allocations.every(allocation)))));
  return value;
}
/**
 * GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier (Legal). Tải hồ sơ căn cứ pháp lý của hồ sơ xác minh.
 *
 * @returns {Promise<object>} Dossier đã xác thực.
 */
export async function loadLegalDossier(caseId, options = {}) {
  return dossier(await request(`${context(caseId, options)}/basis-dossier`, { ...options, expectedStatus: 200 }), caseId);
}

/**
 * GET /api/v1/legal-verifications/verification-cases?page&size&status&route (Legal). Tải hàng đợi hồ sơ xác minh có phân trang (size 1-100, status OPEN/CLOSED/CANCELLED, route NOTARIAL/COURT/ON_HOLD).
 * Kiểm tra tính nhất quán phân trang (totalElements, totalPages) và id không trùng.
 *
 * @param {{page?: number, size?: number, status?: string, route?: string}} [params] Cùng các tùy chọn của request().
 * @returns {Promise<{items: Array<{caseId, label, vaultId, deathDocumentIds}>, page: number, totalPages: number}>}
 */
export async function loadLegalQueue({ page = 0, size = 20, status = '', route = '', ...options } = {}) {
  requireValue(Number.isSafeInteger(page) && page >= 0 && Number.isSafeInteger(size) && size >= 1 && size <= 100
    && (!status || ['OPEN', 'CLOSED', 'CANCELLED'].includes(status))
    && (!route || ['NOTARIAL', 'COURT', 'ON_HOLD'].includes(route)), 'VALIDATION_FAILED');
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  if (route) params.set('route', route);
  const value = await request(`${root}/verification-cases?${params}`, { ...options, expectedStatus: 200 });
  requireValue(value && Array.isArray(value.content) && value.page === page && value.size === size
    && Number.isSafeInteger(value.totalElements) && value.totalElements >= value.content.length
    && value.content.length <= size && value.totalPages === Math.ceil(value.totalElements / size));
  const items = value.content.map(item => {
    requireValue(isUuid(item.caseId) && isUuid(item.vaultId) && text(item.caseNumber)
      && ['OPEN', 'CLOSED', 'CANCELLED'].includes(item.caseStatus) && text(item.vaultStatus) && isUtcDate(item.openedAt)
      && (item.route === null || ['COURT', 'ON_HOLD', 'NOTARIAL'].includes(item.route)));
    return { caseId: item.caseId, label: item.caseNumber, vaultId: item.vaultId, deathDocumentIds: [] };
  });
  requireValue(new Set(items.map(item => item.caseId)).size === items.length);
  return { items, page, totalPages: value.totalPages };
}

/**
 * GET /api/v1/legal-verifications/verification-cases/{caseId}/context (Legal). Tải ngữ cảnh đầy đủ của hồ sơ: trạng thái case/kho, giấy tờ khai tử, kết quả đối chiếu di chúc,
 * hồ sơ căn cứ (basisDossier), snapshot (phiên bản hiện tại, hash, độ mới của thẩm định) và capabilities (approval, unlock: allowed + blockedReason).
 * Kiểm tra chéo các quy tắc nhất quán (hash trùng phiên bản mới nhất, capability được phép chỉ khi route/trạng thái phù hợp).
 *
 * @returns {Promise<object>} Ngữ cảnh chuẩn hóa dùng cho toàn bộ luồng Legal.
 */
export async function loadLegalContext(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/context`, { ...options, expectedStatus: 200 });
  requireValue(value?.caseId === caseId && isUuid(value.vaultId) && text(value.caseNumber)
    && ['OPEN', 'CLOSED', 'CANCELLED'].includes(value.caseStatus) && text(value.vaultStatus) && isUtcDate(value.evaluatedAt)
    && Array.isArray(value.deathDocuments) && value.deathDocuments.every(item => isUuid(item.id) && text(item.documentType) && isUtcDate(item.receivedAt))
    && value.willComparison?.caseId === caseId && value.willComparison.vaultStatus === value.vaultStatus);
  requireValue(new Set(value.deathDocuments.map(item => item.id)).size === value.deathDocuments.length);
  const basis = value.basisDossier === null ? null : dossier(value.basisDossier, caseId);
  const snapshot = value.snapshot;
  if (!basis) requireValue(snapshot === null);
  else {
    requireValue(snapshot?.dossierId === basis.id && Number.isSafeInteger(snapshot.currentVersion) && snapshot.currentVersion >= 0
      && snapshot.requiredVersion === basis.requiredVersion && snapshot.disputeStatus === basis.disputeStatus
      && typeof snapshot.reviewFresh === 'boolean' && typeof snapshot.approvalCurrent === 'boolean');
    const latest = basis.versions.reduce((best, item) => !best || item.version > best.version ? item : best, null);
    requireValue(snapshot.currentVersion === (latest?.version || 0));
    if (latest) requireValue(hash(snapshot.sha256Hash) && latest.sha256.toLowerCase() === snapshot.sha256Hash.toLowerCase() && hash(snapshot.allocationHash));
  }
  const capabilities = value.capabilities;
  for (const key of ['approval', 'unlock']) {
    const action = capabilities?.[key];
    requireValue(typeof action?.allowed === 'boolean' && (action.allowed ? action.blockedReason === null : text(action.blockedReason)));
    if (action.allowed) requireValue(['COURT', 'NOTARIAL'].includes(basis?.route) && value.caseStatus === 'OPEN' && value.vaultStatus === 'LEGAL_BASIS_VERIFICATION'
      && snapshot?.currentVersion > 0 && snapshot.reviewFresh && (basis.route === 'NOTARIAL' || snapshot.courtResult === 'VALID')
      && (key !== 'unlock' || snapshot.approvalCurrent));
  }
  return { caseId, caseNumber: value.caseNumber, vaultId: value.vaultId, caseStatus: value.caseStatus, vaultStatus: value.vaultStatus,
    willComparison: value.willComparison, deathDocuments: value.deathDocuments.map(({ id, documentType, receivedAt }) => ({ id, documentType, receivedAt })),
    basisDossier: basis, snapshot, capabilities, evaluatedAt: value.evaluatedAt };
}
/**
 * GET /api/v1/legal-verifications/verification-cases/{caseId}/context (Legal). Lấy hồ sơ căn cứ cùng snapshot do server tính để làm "reviewSnapshot"
 * (versionNo, sha256Hash, allocationHash, disputeStatus) gửi kèm khi ghi nhận thẩm định.
 *
 * @returns {Promise<{dossier: (object|null), reviewSnapshot: (object|null)}>}
 */
// Capture a server-computed review snapshot when loading the dossier for display.
export async function loadLegalReviewContext(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/context`, { ...options, expectedStatus: 200 });
  requireValue(value?.caseId === caseId);
  if (value.basisDossier === null) {
    requireValue(value.snapshot === null);
    return { dossier: null, reviewSnapshot: null };
  }
  const basis = dossier(value.basisDossier, caseId), snapshot = value.snapshot;
  requireValue(snapshot?.dossierId === basis.id && Number.isSafeInteger(snapshot.currentVersion) && snapshot.currentVersion >= 0);
  if (snapshot.currentVersion === 0) return { dossier: basis, reviewSnapshot: null };
  requireValue(hash(snapshot.sha256Hash) && hash(snapshot.allocationHash) && text(snapshot.disputeStatus));
  const latest = basis.versions.find(item => item.version === snapshot.currentVersion);
  requireValue(latest && latest.sha256.toLowerCase() === snapshot.sha256Hash.toLowerCase() && basis.disputeStatus === snapshot.disputeStatus);
  return { dossier: basis, reviewSnapshot: { versionNo: snapshot.currentVersion, sha256Hash: snapshot.sha256Hash,
    allocationHash: snapshot.allocationHash, disputeStatus: snapshot.disputeStatus } };
}
/**
 * GET /api/v1/legal-verifications/death-documents/{documentId} (Legal). Tải nội dung một giấy tờ khai tử và lịch sử quyết định.
 *
 * @returns {Promise<object>} Thông tin giấy tờ, trạng thái hồ sơ/kho và danh sách decisions.
 */
export async function loadDeathDocument(caseId, documentId, options = {}) {
  context(caseId, options); requireValue(isUuid(documentId), 'VALIDATION_FAILED');
  const value = await request(`${root}/death-documents/${documentId}`, { ...options, expectedStatus: 200 });
  requireValue(value?.deathDocumentPublicId === documentId && value.verificationCasePublicId === caseId
    && text(value.verificationCaseStatus) && text(value.vaultStatus) && value.document && Array.isArray(value.decisions));
  return value;
}
/**
 * POST /api/v1/legal-verifications/death-documents/{documentId}/decision (Legal). Ghi quyết định APPROVE / REJECT / REQUEST_MORE kèm lý do.
 * Kiểm tra phản hồi: kết quả APPROVED / REJECTED / NEEDS_CORRECTION, người quyết định khớp phiên, trạng thái kho là DOCUMENT_VERIFICATION (nếu duyệt) hoặc AWAITING_VERIFICATION.
 *
 * @param {string} caseId Hồ sơ xác minh.
 * @param {string} documentId Giấy tờ khai tử.
 * @param {{decision: string, reason: string}} data
 * @returns {Promise<object>} Biên nhận quyết định.
 */
export async function decideDeathDocument(caseId, documentId, data, options = {}) {
  context(caseId, options); requireValue(isUuid(documentId) && ['APPROVE', 'REJECT', 'REQUEST_MORE'].includes(data.decision), 'VALIDATION_FAILED');
  const body = { decision: data.decision, reason: reason(data.reason) };
  const value = await request(`${root}/death-documents/${documentId}/decision`, { ...options, method: 'POST', body, expectedStatus: 200 });
  requireValue(value?.deathDocumentPublicId === documentId && value.verificationCasePublicId === caseId
    && value.result === ({ APPROVE: 'APPROVED', REJECT: 'REJECTED', REQUEST_MORE: 'NEEDS_CORRECTION' })[body.decision]
    && actor(value.verifierPublicId, options) && isUtcDate(value.decidedAt) && value.reason === body.reason
    && value.verificationCaseStatus === 'OPEN' && value.vaultStatus === (body.decision === 'APPROVE' ? 'DOCUMENT_VERIFICATION' : 'AWAITING_VERIFICATION'));
  return value;
}
/**
 * GET /api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons (Legal). Tải các bản di chúc gốc đã tiếp nhận, các di chúc số (kèm phiên bản và hash) và lịch sử đối chiếu.
 *
 * @returns {Promise<{caseId, vaultStatus, approvalBlocked, originalWillIntakes, wills, comparisons}>}
 */
export async function loadWillComparisons(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/will-comparisons`, { ...options, expectedStatus: 200 });
  requireValue(value?.caseId === caseId && text(value.vaultStatus) && typeof value.approvalBlocked === 'boolean'
    && Array.isArray(value.originalWillIntakes) && value.originalWillIntakes.every(item => isUuid(item.id))
    && Array.isArray(value.wills) && value.wills.every(will => isUuid(will.id) && Array.isArray(will.versions)
      && will.versions.every(item => version(item.version) && hash(item.sha256))) && Array.isArray(value.comparisons));
  return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/will-comparisons (Legal, mong đợi 201). Ghi kết quả đối chiếu di chúc bản gốc với một phiên bản di chúc số (MATCH / MISMATCH / INCONCLUSIVE).
 * Lý do bắt buộc nếu kết quả khác MATCH; options.expectedHash là SHA-256 của phiên bản đang xem và phải khớp phản hồi.
 *
 * @param {string} caseId
 * @param {{originalWillIntakeId: string, willId: string, version: number, result: string, reason?: string}} data
 * @returns {Promise<object>} Bản ghi đối chiếu.
 */
export async function compareWill(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(isUuid(data.originalWillIntakeId) && isUuid(data.willId) && version(data.version)
    && ['MATCH', 'MISMATCH', 'INCONCLUSIVE'].includes(data.result) && hash(options.expectedHash), 'VALIDATION_FAILED');
  const body = { originalWillIntakeId: data.originalWillIntakeId, willId: data.willId, version: data.version,
    result: data.result, reason: reason(data.reason, data.result !== 'MATCH') };
  const value = await request(`${url}/will-comparisons`, { ...options, method: 'POST', body, expectedStatus: 201 });
  requireValue(isUuid(value?.id) && value.caseId === caseId && value.originalWillIntakeId === body.originalWillIntakeId
    && value.willId === body.willId && value.version === body.version && value.sha256?.toLowerCase() === options.expectedHash.toLowerCase()
    && value.result === body.result && actor(value.checkedBy, options) && isUtcDate(value.comparedAt));
  return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier (201) hoặc .../basis-dossier/reclassification (200 khi options.reclassification). Phân loại căn cứ pháp lý: COURT, NOTARIAL (hoặc ON_HOLD khi phân loại lần đầu) kèm routeReason.
 * Phân loại lại (reclassification) dùng khi tiếp tục xử lý hồ sơ đang tạm dừng.
 *
 * @param {string} caseId
 * @param {{route: string, routeReason: string}} data
 * @returns {Promise<object>} Dossier sau khi phân loại (có classifiedBy).
 */
export async function classifyLegalDossier(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue((options.reclassification ? ['COURT', 'NOTARIAL'] : ['COURT', 'NOTARIAL', 'ON_HOLD']).includes(data.route), 'VALIDATION_FAILED');
  const value = await request(`${url}/basis-dossier${options.reclassification ? '/reclassification' : ''}`, {
    ...options, method: 'POST', body: { route: data.route, routeReason: reason(data.routeReason) }, expectedStatus: options.reclassification ? 200 : 201,
  });
  const result = dossier(value, caseId); requireValue(result.route === data.route && actor(result.classifiedBy, options)); return result;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/hold (Legal). Tạm dừng hồ sơ với nguyên nhân NEW_DISPUTE hoặc INSUFFICIENT_EVIDENCE và lý do; kết quả phải là route ON_HOLD, status DRAFT.
 *
 * @returns {Promise<object>} Dossier đã tạm dừng.
 */
export async function holdLegalDossier(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(['NEW_DISPUTE', 'INSUFFICIENT_EVIDENCE'].includes(data.cause), 'VALIDATION_FAILED');
  const value = dossier(await request(`${url}/basis-dossier/hold`, { ...options, method: 'POST',
    body: { cause: data.cause, reason: reason(data.reason) }, expectedStatus: 200 }), caseId);
  requireValue(value.route === 'ON_HOLD' && value.status === 'DRAFT'); return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/review hoặc .../request-supplementation (Legal). Ghi nhận đã thẩm định phiên bản hiện tại
 * (gửi kèm snapshot: versionNo, sha256Hash, allocationHash, disputeStatus) hoặc yêu cầu bổ sung hồ sơ, kèm lý do. Cần options.dossierId; với 'review' cần options.reviewSnapshot.
 *
 * @param {string} caseId
 * @param {{action: 'review'|'request-supplementation', reason: string}} data
 * @returns {Promise<object>} Kết quả {dossierId, reviewStatus, reviewRequired, checkedAt, ...}.
 */
export async function reviewLegalDossier(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(isUuid(options.dossierId) && ['review', 'request-supplementation'].includes(data.action), 'VALIDATION_FAILED');
  const body = { reason: reason(data.reason) };
  if (data.action === 'review') {
    const snapshot = options.reviewSnapshot;
    requireValue(snapshot && version(snapshot.versionNo) && hash(snapshot.sha256Hash) && hash(snapshot.allocationHash)
      && ['NONE', 'DISPUTED', 'UNDETERMINED'].includes(snapshot.disputeStatus), 'VALIDATION_FAILED');
    Object.assign(body, { versionNo: snapshot.versionNo, sha256Hash: snapshot.sha256Hash,
      allocationHash: snapshot.allocationHash, disputeStatus: snapshot.disputeStatus });
  }
  const value = await request(`${url}/basis-dossier/${data.action}`, { ...options, method: 'POST', body, expectedStatus: 200 });
  requireValue(value?.dossierId === options.dossierId && text(value.reviewStatus) && typeof value.reviewRequired === 'boolean' && stamp(value.checkedAt)
    && (data.action !== 'review' || (value.reviewStatus === 'FRESH' && value.reviewRequired === false && version(value.currentVersionNo)
      && hash(value.currentSha256Hash) && hash(value.currentAllocationHash) && text(value.currentDisputeStatus))));
  if (data.action === 'review') requireValue(value.currentVersionNo === body.versionNo
    && value.currentSha256Hash.toLowerCase() === body.sha256Hash.toLowerCase()
    && value.currentAllocationHash.toLowerCase() === body.allocationHash.toLowerCase() && value.currentDisputeStatus === body.disputeStatus);
  return value;
}
/**
 * GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions (Legal). Tải lịch sử kết luận về quyết định của Tòa án.
 *
 * @returns {Promise<Array<object>>} Danh sách kết luận (VALID / INVALID / INCONCLUSIVE).
 */
export async function loadCourtDecisions(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/basis-dossier/court-decisions`, { ...options, expectedStatus: 200 });
  requireValue(Array.isArray(value) && value.every(item => isUuid(item.id) && item.caseId === caseId && version(item.version)
    && hash(item.sha256) && ['VALID', 'INVALID', 'INCONCLUSIVE'].includes(item.result) && isUuid(item.reviewedBy) && isUtcDate(item.reviewedAt)));
  return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/court-decisions (Legal, 201). Ghi kết luận VALID / INVALID / INCONCLUSIVE cho một phiên bản văn bản Tòa án,
 * kèm lý do; options.expectedHash phải khớp SHA-256 phiên bản.
 *
 * @param {string} caseId
 * @param {{version: number, result: string, reason: string}} data
 * @returns {Promise<object>} Bản ghi kết luận.
 */
export async function decideCourt(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(version(data.version) && hash(options.expectedHash) && ['VALID', 'INVALID', 'INCONCLUSIVE'].includes(data.result), 'VALIDATION_FAILED');
  const value = await request(`${url}/basis-dossier/court-decisions`, { ...options, method: 'POST',
    body: { version: data.version, result: data.result, reason: reason(data.reason) }, expectedStatus: 201 });
  requireValue(isUuid(value?.id) && value.caseId === caseId && value.version === data.version && value.sha256?.toLowerCase() === options.expectedHash.toLowerCase()
    && value.result === data.result && actor(value.reviewedBy, options) && isUtcDate(value.reviewedAt)); return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/decision (Legal). Phê duyệt (APPROVE) hoặc từ chối (REJECT) phương án phân bổ,
 * gắn với phiên bản và hash cụ thể (versionNo, sha256Hash, allocationHash) để chống duyệt trên dữ liệu đã đổi. Cần options.dossierId.
 *
 * @returns {Promise<object>} Biên nhận {dossierId, decision: LEGAL_APPROVED|LEGAL_REJECTED, decidedBy, decidedAt, ...}.
 */
export async function decideLegalApproval(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(isUuid(options.dossierId) && ['APPROVE', 'REJECT'].includes(data.decision) && version(data.versionNo)
    && hash(data.sha256Hash) && hash(data.allocationHash), 'VALIDATION_FAILED');
  const body = { decision: data.decision, versionNo: data.versionNo, sha256Hash: data.sha256Hash, allocationHash: data.allocationHash,
    reason: reason(data.reason) };
  const value = await request(`${url}/basis-dossier/decision`, { ...options, method: 'POST', body, expectedStatus: 200 });
  requireValue(value?.dossierId === options.dossierId && value.decision === `LEGAL_${body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`
    && value.versionNo === body.versionNo && value.sha256Hash?.toLowerCase() === body.sha256Hash.toLowerCase()
    && value.allocationHash?.toLowerCase() === body.allocationHash.toLowerCase() && actor(value.decidedBy, options) && stamp(value.decidedAt));
  return value;
}
/**
 * POST /api/v1/legal-verifications/verification-cases/{caseId}/unlock (Legal). Mở khóa kho của chủ sở hữu sau khi đã phê duyệt; cần options.vaultId. Phản hồi phải có status UNLOCKED.
 *
 * @returns {Promise<{caseId, vaultId, status, unlockedBy, unlockedAt}>}
 */
export async function unlockLegalVault(caseId, options = {}) {
  requireValue(isUuid(options.vaultId), 'VALIDATION_FAILED');
  const value = await request(`${context(caseId, options)}/unlock`, { ...options, method: 'POST', expectedStatus: 200 });
  requireValue(isUuid(options.vaultId) && value?.caseId === caseId && value.vaultId === options.vaultId
    && value.status === 'UNLOCKED' && actor(value.unlockedBy, options) && isUtcDate(value.unlockedAt)); return value;
}
