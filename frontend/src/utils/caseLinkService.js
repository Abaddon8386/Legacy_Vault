import { request, ApiError } from '../api/http.js';
import { isUuid, isUtcDate } from '../api/contracts.js';
import { REQUEST_STATES } from './caseLinkModel.js';
import { recordCounterAttestation } from '../pages/staff/liveHandoverService.js';

const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
const id = value => { if (!isUuid(value)) throw new ApiError('VALIDATION_FAILED', 400); return value; };
function own(raw) {
  if (!isUuid(raw?.requestId) || !REQUEST_STATES.includes(raw.status) ||
      !isUtcDate(raw.createdAt) || !isUtcDate(raw.expiresAt)) invalid();
  // BE deliberately omits case/recipient information from the requester's response.
  return { id: raw.requestId, caseNumber: null, status: raw.status, createdAt: raw.createdAt, expiresAt: raw.expiresAt };
}
const path = caseId => `/staff/verification-cases/${id(caseId)}`;
export const liveCaseLinkActions = {
  async listOwn(options) {
    const raw = await request('/beneficiary-link-requests', { ...options, expectedStatus: 200 });
    if (!Array.isArray(raw)) invalid();
    return raw.map(own);
  },
  async submit({ caseNumber }, options) {
    return own(await request('/beneficiary-link-requests', { ...options, method: 'POST',
      body: { caseCode: caseNumber }, expectedStatus: 201 }));
  },
  async cancel({ requestId }, options) {
    const result = own(await request(`/beneficiary-link-requests/${id(requestId)}/cancel`, {
      ...options, method: 'POST', expectedStatus: 200 }));
    if (result.id !== requestId || result.status !== 'CANCELLED') invalid();
    return result;
  },
};
export const liveCounterLinkActions = {
  async listPending({ caseId }, options) {
    const raw = await request(`${path(caseId)}/link-requests`, { ...options, expectedStatus: 200 });
    if (!Array.isArray(raw)) invalid();
    return raw.map(item => {
      const row = own(item);
      if (row.status !== 'PENDING' || !item.requesterName?.trim() || !item.requesterEmail?.includes('@')) invalid();
      return { ...row, accountId: null, accountName: item.requesterName, accountEmail: item.requesterEmail };
    });
  },
  async createAccount({ caseId, fullName, email, password }, options) {
    const raw = await request(`${path(caseId)}/accounts`, { ...options, method: 'POST',
      body: { fullName, email, password }, expectedStatus: 201 });
    if (!isUuid(raw?.accountId) || raw.linkStatus !== 'UNLINKED') invalid();
    return { accountId: raw.accountId, linked: false };
  },
  async approve({ caseId, requestId, recipientId, evidenceReference }, options) {
    id(requestId); id(recipientId); path(caseId);
    // Save the existing counter identity record first; failure must not proceed to linking.
    await recordCounterAttestation(caseId, recipientId, { evidenceReference }, options);
    const raw = await request(`${path(caseId)}/link-requests/${requestId}/approve`, {
      ...options, method: 'POST', body: { beneficiaryId: recipientId }, expectedStatus: 200 });
    if (raw?.requestId !== requestId || raw.status !== 'APPROVED' || raw.beneficiaryId !== recipientId || !isUuid(raw.accountId)) invalid();
    return { id: requestId, caseNumber: null, status: 'APPROVED', accountId: raw.accountId };
  },
  async reject({ caseId, requestId }, options) {
    const raw = await request(`${path(caseId)}/link-requests/${id(requestId)}/reject`, {
      ...options, method: 'POST', expectedStatus: 200 });
    if (raw?.requestId !== requestId || raw.status !== 'REJECTED' || raw.accountId != null || raw.beneficiaryId != null) invalid();
    return { id: requestId, caseNumber: null, status: 'REJECTED', accountId: null };
  },
};
