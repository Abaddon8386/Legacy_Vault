import { API_BASE, ApiError, request } from '../../api/http.js';
import { isUuid, isUtcDate } from '../../api/contracts.js';

/** Các loại MIME được chấp nhận cho tệp chứng cứ pháp lý: PDF, JPEG, PNG. */
const types = new Set(['application/pdf', 'image/jpeg', 'image/png']);
/** Kiểm tra giá trị là chuỗi SHA-256 dạng hex 64 ký tự. */
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
/** Kiểm tra điều kiện của dữ liệu/đối số; nếu sai ném ApiError với mã chỉ định (mặc định INVALID_RESPONSE, kiểm tra đối số dùng VALIDATION_FAILED). */
const requireValue = (condition, code = 'INVALID_RESPONSE') => { if (!condition) throw new ApiError(code); };

/**
 * Dựng đường dẫn API gốc (sau /api/v1) cho từng loại chứng cứ:
 * - kind 'basis': /legal-verifications/verification-cases/{caseId}/basis-dossier/versions/{versionNo}
 * - kind 'death': /legal-verifications/death-documents/{subjectId}/attachments
 * - kind 'original-will': /legal-verifications/verification-cases/{caseId}/original-will-intakes/{subjectId}/attachments
 *
 * @param {{kind: string, caseId: string, subjectId?: string, versionNo?: number}} subject Đối tượng chứng cứ.
 * @returns {string} Đường dẫn API.
 * @throws {ApiError} VALIDATION_FAILED khi id/phiên bản không hợp lệ.
 */
function root({ kind, caseId, subjectId, versionNo }) {
  requireValue(isUuid(caseId), 'VALIDATION_FAILED');
  if (kind === 'basis') {
    requireValue(Number.isSafeInteger(versionNo) && versionNo >= 1, 'VALIDATION_FAILED');
    return `/legal-verifications/verification-cases/${caseId}/basis-dossier/versions/${versionNo}`;
  }
  requireValue(isUuid(subjectId), 'VALIDATION_FAILED');
  if (kind === 'death') return `/legal-verifications/death-documents/${subjectId}/attachments`;
  requireValue(kind === 'original-will', 'VALIDATION_FAILED');
  return `/legal-verifications/verification-cases/${caseId}/original-will-intakes/${subjectId}/attachments`;
}

/**
 * Liệt kê tệp đính kèm chứng cứ của giấy tờ khai tử hoặc bản di chúc gốc: GET /api/v1/legal-verifications/death-documents/{id}/attachments
 * hoặc GET /api/v1/legal-verifications/verification-cases/{caseId}/original-will-intakes/{id}/attachments (vai trò Legal/Staff). Kiểm tra chặt từng phần tử (id, caseId, subjectId, loại, tên, MIME, kích thước, SHA-256, uploadedAt) và id không trùng.
 * Được LegalEvidenceFiles dùng.
 *
 * @param {{kind: 'death'|'original-will', caseId: string, subjectId: string}} subject
 * @param {object} [options] Tùy chọn cho request() (accessToken, lang, signal...).
 * @returns {Promise<Array<{id, fileName, contentType, sizeBytes, sha256, uploadedAt}>>}
 * @throws {ApiError} INVALID_RESPONSE / VALIDATION_FAILED hoặc lỗi từ backend.
 */
export async function listLegalEvidence(subject, options = {}) {
  requireValue(subject.kind !== 'basis', 'VALIDATION_FAILED');
  const values = await request(root(subject), { ...options, expectedStatus: 200 });
  requireValue(Array.isArray(values));
  const items = values.map(value => {
    requireValue(isUuid(value?.id) && value.caseId === subject.caseId && value.subjectId === subject.subjectId
      && value.subjectType === (subject.kind === 'death' ? 'DEATH_DOCUMENT' : 'ORIGINAL_WILL')
      && typeof value.fileName === 'string' && value.fileName.trim() && types.has(value.contentType)
      && Number.isSafeInteger(value.sizeBytes) && value.sizeBytes > 0 && hash(value.sha256)
      && isUuid(value.uploadedBy) && isUtcDate(value.uploadedAt));
    return { id: value.id, fileName: value.fileName, contentType: value.contentType, sizeBytes: value.sizeBytes,
      sha256: value.sha256, uploadedAt: value.uploadedAt };
  });
  requireValue(new Set(items.map(item => item.id)).size === items.length);
  return items;
}

/**
 * Tải nội dung nhị phân của một tệp chứng cứ: GET /api/v1/{root}/{fileId}/content (khai tử và di chúc gốc) hoặc GET /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/versions/{n}/content (văn bản căn cứ).
 * Dùng fetch trực tiếp với Bearer token, không lưu cache; kiểm tra MIME, kích thước và so khớp SHA-256 (crypto.subtle) với metadata để chống sai lệch nội dung. Hỗ trợ hủy qua AbortSignal.
 *
 * @param {object} subject Như listLegalEvidence (kind có thể là 'basis').
 * @param {{id?: string, contentType?: string, sizeBytes?: number, sha256?: string}} file Metadata của tệp.
 * @param {{accessToken: string, lang?: string, signal?: AbortSignal, fetchFn?: Function}} options
 * @returns {Promise<{blob: Blob, contentType: string}>}
 * @throws {ApiError} UNAUTHENTICATED, NETWORK_ERROR, EVIDENCE_READ_FAILED (hoặc code backend), INVALID_RESPONSE khi nội dung không khớp.
 */
export async function readLegalEvidence(subject, file, options = {}) {
  const path = root(subject);
  if (subject.kind !== 'basis') requireValue(isUuid(file?.id), 'VALIDATION_FAILED');
  const suffix = subject.kind === 'basis' ? '/content' : `/${file.id}/content`;
  const { accessToken, lang = 'vi', signal, fetchFn = globalThis.fetch } = options;
  requireValue(typeof accessToken === 'string' && accessToken.trim(), 'UNAUTHENTICATED');
  let response;
  try {
    response = await fetchFn(API_BASE + path + suffix, { method: 'GET', credentials: 'omit', cache: 'no-store', signal,
      headers: { Authorization: `Bearer ${accessToken}`, 'Accept-Language': lang === 'en' ? 'en' : 'vi', Accept: 'application/pdf,image/jpeg,image/png' } });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!response.ok) {
    let data;
    try { data = await response.json(); } catch { /* Use the HTTP status when no JSON error is available. */ }
    throw new ApiError(data?.code || 'EVIDENCE_READ_FAILED', response.status);
  }
  requireValue(response.status === 200);
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  requireValue(types.has(contentType));
  const blob = await response.blob();
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  requireValue(blob.size > 0 && (!file?.contentType || contentType === file.contentType)
    && (file?.sizeBytes == null || blob.size === file.sizeBytes));
  if (hash(file?.sha256)) {
    const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const actual = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
    requireValue(actual === file.sha256.toLowerCase());
  }
  return { blob, contentType };
}
