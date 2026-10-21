import { request, ApiError, API_BASE } from '../../api/http.js';
import { uploadEvidenceMultipart, validateIntakeAttachmentReceipt } from '../../utils/staffEvidenceUpload.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function path(id) {
  if (!uuid.test(id || '')) throw new ApiError('VALIDATION_FAILED', 400);
  return `/staff/verification-cases/${id}`;
}
function validateCase(data, id) {
  if (data?.caseId !== id || !['OPEN', 'CANCELLED', 'CLOSED'].includes(data.status)) throw new ApiError('INVALID_RESPONSE');
  return data;
}
export async function loadStaffCase(id, options) {
  return validateCase(await request(path(id), { ...options, expectedStatus: 200 }), id);
}
export async function claimStaffCase(id, options) {
  return validateCase(await request(`${path(id)}/claim`, { ...options, method: 'POST', expectedStatus: 200 }), id);
}
const fields = {
  'death-documents': ['documentType', 'issuingAuthority', 'documentNumber', 'issuedDate', 'evidenceReference', 'notes'],
  'original-will-intakes': ['deliveredByName', 'deliveredByRelationship', 'evidenceReference', 'conditionNotes'],
};
function receipt(data, id) {
  if (data?.caseId !== id || !uuid.test(data.id || '') || !uuid.test(data.receivedBy || '') || !Number.isFinite(Date.parse(data.receivedAt))) throw new ApiError('INVALID_RESPONSE');
  return data;
}
export async function staffDocuments(id, kind, values, options) {
  if (!Object.hasOwn(fields, kind)) throw new ApiError('VALIDATION_FAILED', 400);
  const body = values === undefined ? undefined : Object.fromEntries(fields[kind].map(key => [key, String(values[key] || '').trim()]));
  const result = await request(`${path(id)}/${kind}`, { ...options, method: body ? 'POST' : 'GET', body, expectedStatus: body ? 201 : 200 });
  if (body) return receipt(result, id);
  if (!Array.isArray(result)) throw new ApiError('INVALID_RESPONSE');
  return result.map(item => receipt(item, id));
}

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
