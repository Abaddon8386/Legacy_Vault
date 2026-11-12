import { request, ApiError } from '../../api/http.js';
import { isHandoverId } from './liveHandoverService.js';

export const CONTACT_CHANNELS = ['PHONE', 'EMAIL', 'IN_PERSON', 'OTHER'];
export const CONTACT_OUTCOMES = ['CONTACTED', 'NO_RESPONSE', 'INVALID_CONTACT'];
export const CONTACT_FALLBACKS = ['NOT_REQUIRED', 'REQUIRED', 'IN_PROGRESS', 'COMPLETED'];

function readRecord(value) {
  if (!value || !isHandoverId(value.id) || !CONTACT_CHANNELS.includes(value.channel)
    || !CONTACT_OUTCOMES.includes(value.outcome) || !CONTACT_FALLBACKS.includes(value.fallbackStatus)
    || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return value;
}

function readPerson(value) {
  if (!value || !['TRUSTEE', 'BENEFICIARY'].includes(value.kind) || !isHandoverId(value.id)
    || typeof value.fullName !== 'string' || !Array.isArray(value.contacts)) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return { ...value, canRecord: value.canRecord === true, contacts: value.contacts.map(readRecord) };
}

/** People Staff must reach on an assigned OPEN case: the appointed Trustee first, then the Beneficiaries. */
export async function fetchCaseContacts(caseId, options = {}) {
  if (!isHandoverId(caseId)) throw new ApiError('VALIDATION_FAILED', 400);
  const data = await request(`/staff/verification-cases/${caseId}/contacts`, {
    ...options, method: 'GET', expectedStatus: 200, cache: 'no-store',
  });
  if (!data || data.caseId !== caseId || !Array.isArray(data.people)) throw new ApiError('INVALID_RESPONSE');
  return data.people.map(readPerson);
}

/** Records one contact attempt with the Trustee; history is append-only on the server. */
export async function recordTrusteeContact(trusteeId, payload, options = {}) {
  if (!isHandoverId(trusteeId) || !CONTACT_CHANNELS.includes(payload?.channel)
    || !CONTACT_OUTCOMES.includes(payload?.outcome) || !CONTACT_FALLBACKS.includes(payload?.fallbackStatus)) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const note = typeof payload.note === 'string' ? payload.note.trim() : '';
  if (note.length > 500) throw new ApiError('VALIDATION_FAILED', 400);
  const body = { channel: payload.channel, outcome: payload.outcome, fallbackStatus: payload.fallbackStatus };
  if (note) body.note = note;
  return readRecord(await request(`/staff/trustees/${trusteeId}/contact-outcomes`, {
    ...options, method: 'POST', body, expectedStatus: 201,
  }));
}
