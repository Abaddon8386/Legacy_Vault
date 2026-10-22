import { ApiError, request } from '../../api/http.js';
import { isUuid } from '../../api/contracts.js';

const states = new Set(['QUEUED','CLAIMED','SENDING','ACCEPTED','FAILED','UNKNOWN','SKIPPED']);
export function readInvitationMail(raw) {
  if (!isUuid(raw?.outboxId) || !isUuid(raw.invitationId) || !Number.isSafeInteger(raw.invitationGeneration) || raw.invitationGeneration < 1 ||
      !states.has(raw.queueStatus) || !['ENABLED','DISABLED'].includes(raw.transportStatus)) throw new ApiError('INVALID_RESPONSE');
  return { outboxId: raw.outboxId, invitationId: raw.invitationId, invitationGeneration: raw.invitationGeneration,
    queueStatus: raw.queueStatus, transportStatus: raw.transportStatus };
}
export async function fetchInvitationMailStatus(caseId, beneficiaryId, options) {
  if (!isUuid(caseId) || !isUuid(beneficiaryId)) throw new ApiError('VALIDATION_FAILED',400);
  return readInvitationMail(await request(`/staff/verification-cases/${caseId}/beneficiaries/${beneficiaryId}/invitation-email`, { ...options, expectedStatus:200 }));
}
