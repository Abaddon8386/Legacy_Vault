/**
 * staffLiveService.js - Gọi API thật cho chi tiết hồ sơ xác minh của Staff, tiếp nhận giấy tờ và đọc nội dung tệp đính kèm.
 * Mọi endpoint nằm dưới /api/v1/staff/verification-cases/{caseId} và yêu cầu vai trò STAFF_EXECUTOR.
 * Được dùng bởi StaffLiveCase.jsx, CloseAndArchivePage, StaffSessionBoundary, staffLegalDocumentsService.js và utils/useStaffCaseMetadata.js.
 */
import { request, ApiError, API_BASE } from '../../api/http.js';
import { uploadEvidenceMultipart, validateIntakeAttachmentReceipt } from '../../utils/staffEvidenceUpload.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Dựng đường dẫn gốc '/staff/verification-cases/{id}' của một hồ sơ.
 * @param {string} id UUID hồ sơ.
 * @returns {string} Đường dẫn tương đối so với API_BASE.
 * @throws {ApiError} VALIDATION_FAILED (400) nếu id không phải UUID.
 */
function path(id) {
  if (!uuid.test(id || '')) throw new ApiError('VALIDATION_FAILED', 400);
  return `/staff/verification-cases/${id}`;
}
/**
 * Kiểm tra chi tiết hồ sơ: caseId phải khớp và status thuộc OPEN, CANCELLED, CLOSED.
 * @param {Object} data Phản hồi từ backend.
 * @param {string} id Mã hồ sơ mong đợi.
 * @returns {Object} Chính data nếu hợp lệ.
 * @throws {ApiError} INVALID_RESPONSE khi sai định dạng.
 */
function validateCase(data, id) {
  if (data?.caseId !== id || !['OPEN', 'CANCELLED', 'CLOSED'].includes(data.status)) throw new ApiError('INVALID_RESPONSE');
  return data;
}
/**
 * Tải chi tiết một hồ sơ xác minh: GET /api/v1/staff/verification-cases/{id} (HTTP 200, cache no-store).
 * @param {string} id UUID hồ sơ.
 * @param {Object} options Tùy chọn của request() (accessToken, lang, signal...).
 * @returns {Promise<Object>} Chi tiết hồ sơ đã kiểm tra.
 * @throws {ApiError} VALIDATION_FAILED, INVALID_RESPONSE hoặc lỗi API.
 */
export async function loadStaffCase(id, options) {
  return validateCase(await request(path(id), { ...options, cache: 'no-store', expectedStatus: 200 }), id);
}
/**
 * Nhận xử lý (claim) hồ sơ cho Staff đang đăng nhập: POST /api/v1/staff/verification-cases/{id}/claim (HTTP 200).
 * @param {string} id UUID hồ sơ.
 * @param {Object} options Tùy chọn của request().
 * @returns {Promise<Object>} Chi tiết hồ sơ sau khi được giao.
 * @throws {ApiError} VALIDATION_FAILED, INVALID_RESPONSE hoặc lỗi API.
 */
export async function claimStaffCase(id, options) {
  return validateCase(await request(`${path(id)}/claim`, { ...options, method: 'POST', expectedStatus: 200 }), id);
}
/**
 * Danh sách trường được phép gửi cho từng loại bản ghi tiếp nhận (khóa cũng là đoạn đường dẫn con):
 * 'death-documents' (giấy tờ chứng tử) và 'original-will-intakes' (tiếp nhận di chúc bản gốc).
 */
const fields = {
  'death-documents': ['documentType', 'issuingAuthority', 'documentNumber', 'issuedDate', 'evidenceReference', 'notes'],
  'original-will-intakes': ['deliveredByName', 'deliveredByRelationship', 'evidenceReference', 'conditionNotes'],
};
/**
 * Kiểm tra biên nhận một bản ghi tiếp nhận: caseId khớp, id và receivedBy là UUID, receivedAt là thời gian hợp lệ.
 * @param {Object} data Bản ghi từ backend.
 * @param {string} id Mã hồ sơ mong đợi.
 * @returns {Object} Chính data nếu hợp lệ.
 * @throws {ApiError} INVALID_RESPONSE khi sai định dạng.
 */
function receipt(data, id) {
  if (data?.caseId !== id || !uuid.test(data.id || '') || !uuid.test(data.receivedBy || '') || !Number.isFinite(Date.parse(data.receivedAt))) throw new ApiError('INVALID_RESPONSE');
  return data;
}
/**
 * Liệt kê hoặc tạo bản ghi tiếp nhận giấy tờ của hồ sơ.
 *
 * Nếu values là undefined: GET /api/v1/staff/verification-cases/{id}/{kind} (HTTP 200) trả về mảng bản ghi; với 'death-documents' kiểm tra thêm legalDecision
 * (result APPROVED/REJECTED/NEEDS_CORRECTION, reason, decidedAt), với 'original-will-intakes' kiểm tra thêm comparison (result MATCH/MISMATCH/INCONCLUSIVE, digitalVersion >= 1, comparedAt, reason bắt buộc khi không MATCH).
 * Nếu có values: chỉ lấy các trường trong fields[kind] (cắt khoảng trắng) và POST cùng đường dẫn (HTTP 201), trả về biên nhận đã kiểm tra.
 * @param {string} id UUID hồ sơ.
 * @param {'death-documents'|'original-will-intakes'} kind Loại bản ghi.
 * @param {Object} [values] Dữ liệu biểu mẫu khi tạo mới; bỏ trống để liệt kê.
 * @param {Object} options Tùy chọn của request().
 * @returns {Promise<Object|Object[]>} Biên nhận (khi tạo) hoặc mảng bản ghi (khi liệt kê).
 * @throws {ApiError} VALIDATION_FAILED (kind không hợp lệ), INVALID_RESPONSE hoặc lỗi API.
 */
export async function staffDocuments(id, kind, values, options) {
  if (!Object.hasOwn(fields, kind)) throw new ApiError('VALIDATION_FAILED', 400);
  const body = values === undefined ? undefined : Object.fromEntries(fields[kind].map(key => [key, String(values[key] || '').trim()]));
  const result = await request(`${path(id)}/${kind}`, { ...options, cache: 'no-store', method: body ? 'POST' : 'GET', body, expectedStatus: body ? 201 : 200 });
  if (body) return receipt(result, id);
  if (!Array.isArray(result)) throw new ApiError('INVALID_RESPONSE');
  return result.map(item => {
    receipt(item, id);
    if (kind === 'death-documents' && item.legalDecision != null) {
      const decision = item.legalDecision;
      if (!['APPROVED', 'REJECTED', 'NEEDS_CORRECTION'].includes(decision.result)
          || typeof decision.reason !== 'string' || !decision.reason.trim()
          || !Number.isFinite(Date.parse(decision.decidedAt))) throw new ApiError('INVALID_RESPONSE');
    }
    if (kind === 'original-will-intakes' && item.comparison != null) {
      const outcome = item.comparison;
      if (!['MATCH', 'MISMATCH', 'INCONCLUSIVE'].includes(outcome.result)
          || (outcome.reason != null && typeof outcome.reason !== 'string')
          || (outcome.result !== 'MATCH' && !outcome.reason?.trim())
          || !Number.isInteger(outcome.digitalVersion) || outcome.digitalVersion < 1
          || !Number.isFinite(Date.parse(outcome.comparedAt))) throw new ApiError('INVALID_RESPONSE');
    }
    return item;
  });
}

/**
 * Liệt kê tệp đính kèm của một bản ghi tiếp nhận: GET /api/v1/staff/verification-cases/{id}/{kind}/{recordId}/attachments (HTTP 200).
 * Mỗi phần tử được kiểm tra bằng validateIntakeAttachmentReceipt().
 * @param {string} id UUID hồ sơ.
 * @param {'death-documents'|'original-will-intakes'} kind Loại bản ghi.
 * @param {string} recordId UUID bản ghi tiếp nhận.
 * @param {Object} [options] Tùy chọn của request().
 * @returns {Promise<Object[]>} Danh sách biên nhận tệp đính kèm.
 * @throws {ApiError} VALIDATION_FAILED hoặc INVALID_RESPONSE hoặc lỗi API.
 */
export async function staffDocumentAttachments(id, kind, recordId, options = {}) {
  if (!uuid.test(recordId || '') || !Object.hasOwn(fields, kind)) throw new ApiError('VALIDATION_FAILED', 400);
  const result = await request(`${path(id)}/${kind}/${recordId}/attachments`, {
    ...options,
    method: 'GET',
    expectedStatus: 200,
  });
  if (!Array.isArray(result)) throw new ApiError('INVALID_RESPONSE');
  return result.map(item => validateIntakeAttachmentReceipt(item, { caseId: id, recordId, kind }));
}

/**
 * Tải lên một tệp đính kèm cho bản ghi tiếp nhận: POST multipart tới /api/v1/staff/verification-cases/{id}/{kind}/{recordId}/attachments
 * thông qua uploadEvidenceMultipart() (utils/staffEvidenceUpload.js, hỗ trợ tiến trình và hủy bằng xhrFactory/signal).
 * @param {string} id UUID hồ sơ.
 * @param {'death-documents'|'original-will-intakes'} kind Loại bản ghi.
 * @param {string} recordId UUID bản ghi tiếp nhận.
 * @param {File} file Tệp cần tải lên.
 * @param {Object} [options] { accessToken, lang, signal, onProgress, onStatusChange, xhrFactory }
 * @returns {Promise<Object>} Biên nhận tệp đính kèm đã được kiểm tra.
 * @throws {ApiError} VALIDATION_FAILED, hoặc lỗi từ bộ tải lên.
 */
export async function uploadStaffDocumentAttachment(id, kind, recordId, file, options = {}) {
  if (!uuid.test(recordId || '') || !Object.hasOwn(fields, kind)) throw new ApiError('VALIDATION_FAILED', 400);
  const { accessToken, lang = 'vi', signal, onProgress, onStatusChange, xhrFactory } = options;
  const url = `${API_BASE}${path(id)}/${kind}/${recordId}/attachments`;
  const res = await uploadEvidenceMultipart({
    url,
    file,
    token: accessToken,
    lang,
    signal,
    onProgress,
    onStatusChange,
    xhrFactory,
  });
  return validateIntakeAttachmentReceipt(res, { caseId: id, recordId, kind });
}

/**
 * Tải nội dung nhị phân của một tệp đính kèm: GET /api/v1/staff/verification-cases/{id}/{kind}/{recordId}/attachments/{attachmentId}/content.
 * Dùng fetch trực tiếp (có Bearer token, Accept-Language, credentials omit) và trả về Blob để hiển thị/tải xuống.
 * @param {string} id UUID hồ sơ.
 * @param {'death-documents'|'original-will-intakes'} kind Loại bản ghi.
 * @param {string} recordId UUID bản ghi tiếp nhận.
 * @param {string} attachmentId UUID tệp đính kèm.
 * @param {Object} [options] { accessToken, lang, signal, fetchFn }
 * @returns {Promise<Blob>} Nội dung tệp.
 * @throws {ApiError} VALIDATION_FAILED; NETWORK_ERROR khi lỗi mạng; hoặc ApiError mang code của backend (mặc định FILE_READ_FAILED) khi HTTP không thành công. AbortError được ném lại.
 */
export async function readStaffDocumentAttachmentContent(id, kind, recordId, attachmentId, options = {}) {
  if (!uuid.test(recordId || '') || !uuid.test(attachmentId || '') || !Object.hasOwn(fields, kind)) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const { accessToken, lang = 'vi', signal, fetchFn = globalThis.fetch } = options;
  const headers = { 'Accept-Language': lang === 'en' ? 'en' : 'vi' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response;
  try {
    response = await fetchFn(`${API_BASE}${path(id)}/${kind}/${recordId}/attachments/${attachmentId}/content`, {
      method: 'GET',
      headers,
      signal,
      credentials: 'omit',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR');
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new ApiError(errData?.code || 'FILE_READ_FAILED', response.status, errData || undefined);
  }
  return response.blob();
}

/**
 * Tải nội dung tệp số hóa của một phiên bản văn bản căn cứ pháp lý: GET /api/v1/staff/verification-cases/{id}/basis-dossier/versions/{versionNo}/content.
 * Trả về Blob. Được staffLegalDocumentsService.readBasisVersionContent() dùng ở chế độ thật.
 * @param {string} id UUID hồ sơ.
 * @param {number} versionNo Số phiên bản (>= 1).
 * @param {Object} [options] { accessToken, lang, signal, fetchFn }
 * @returns {Promise<Blob>} Nội dung tệp.
 * @throws {ApiError} VALIDATION_FAILED (versionNo sai); NETWORK_ERROR; hoặc ApiError mang code của backend (mặc định FILE_READ_FAILED).
 */
export async function readStaffBasisVersionContent(id, versionNo, options = {}) {
  if (typeof versionNo !== 'number' || versionNo < 1) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const { accessToken, lang = 'vi', signal, fetchFn = globalThis.fetch } = options;
  const headers = { 'Accept-Language': lang === 'en' ? 'en' : 'vi' };
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response;
  try {
    response = await fetchFn(`${API_BASE}${path(id)}/basis-dossier/versions/${versionNo}/content`, {
      method: 'GET',
      headers,
      signal,
      credentials: 'omit',
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('NETWORK_ERROR');
  }
  if (!response.ok) {
    const errData = await response.json().catch(() => null);
    throw new ApiError(errData?.code || 'FILE_READ_FAILED', response.status, errData || undefined);
  }
  return response.blob();
}
