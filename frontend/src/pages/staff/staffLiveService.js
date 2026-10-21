import { request, ApiError } from '../../api/http.js';

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
