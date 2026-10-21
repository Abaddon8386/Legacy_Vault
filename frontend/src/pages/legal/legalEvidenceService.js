import { API_BASE, ApiError, request } from '../../api/http.js';
import { isUuid, isUtcDate } from '../../api/contracts.js';

const types = new Set(['application/pdf', 'image/jpeg', 'image/png']);
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
const requireValue = (condition, code = 'INVALID_RESPONSE') => { if (!condition) throw new ApiError(code); };

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
