import { request, ApiError } from '../../api/http.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isHandoverId = value => typeof value === 'string' && UUID.test(value);
function root(caseId) {
  if (!isHandoverId(caseId)) throw new ApiError('VALIDATION_FAILED', 400);
  return `/staff/verification-cases/${caseId}/handover-sessions`;
}
export function readSession(value, caseId, sessionId) {
  if (!value || value.caseId !== caseId || !['sessionId', 'caseId', 'vaultId', 'staffId'].every(key => isHandoverId(value[key]))
    || (sessionId && value.sessionId !== sessionId) || !['OPEN', 'COMPLETED', 'CANCELLED'].includes(value.status)
    || typeof value.openedAt !== 'string' || !Number.isFinite(Date.parse(value.openedAt))
    || (value.status === 'OPEN' ? value.closedAt !== null : typeof value.closedAt !== 'string' || !Number.isFinite(Date.parse(value.closedAt)))) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return value;
}
export async function listLiveSessions(caseId, options = {}) {
  const value = await request(root(caseId), { ...options, method: 'GET', expectedStatus: 200 });
  if (!Array.isArray(value)) throw new ApiError('INVALID_RESPONSE');
  const result = value.map(item => readSession(item, caseId));
  if (new Set(result.map(item => item.sessionId)).size !== result.length || result.filter(item => item.status === 'OPEN').length > 1) throw new ApiError('INVALID_RESPONSE');
  return result;
}
export async function getLiveSession(caseId, sessionId, options = {}) {
  if (!isHandoverId(sessionId)) throw new ApiError('VALIDATION_FAILED', 400);
  return readSession(await request(`${root(caseId)}/${sessionId}`, { ...options, method: 'GET', expectedStatus: 200 }), caseId, sessionId);
}
export async function openLiveSession(caseId, options = {}) {
  const value = readSession(await request(root(caseId), { ...options, method: 'POST', expectedStatus: 201 }), caseId);
  if (value.status !== 'OPEN') throw new ApiError('INVALID_RESPONSE');
  return value;
}
export async function cancelLiveSession(caseId, sessionId, options = {}) {
  if (!isHandoverId(sessionId)) throw new ApiError('VALIDATION_FAILED', 400);
  const value = readSession(await request(`${root(caseId)}/${sessionId}/status`, {
    ...options, method: 'PATCH', body: { status: 'CANCELLED' }, expectedStatus: 200,
  }), caseId, sessionId);
  if (value.status !== 'CANCELLED') throw new ApiError('INVALID_RESPONSE');
  return value;
}
export function handoverUrl(path, caseId, sessionId) {
  const query = new URLSearchParams();
  if (isHandoverId(caseId)) query.set('caseId', caseId);
  if (isHandoverId(caseId) && isHandoverId(sessionId)) query.set('sessionId', sessionId);
  return path + (query.size ? `?${query}` : '');
}
