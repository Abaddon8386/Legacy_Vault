// Legal reads and mutations follow PS-102 and the COURT-only contract.
import { ApiError, request } from '../../api/http.js';
import { isUuid, isUtcDate } from '../../api/contracts.js';

const root = '/legal-verifications';
const hash = value => typeof value === 'string' && /^[a-f\d]{64}$/i.test(value);
const text = value => typeof value === 'string' && Boolean(value.trim());
const version = value => Number.isSafeInteger(value) && value > 0;
const stamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value) && Number.isFinite(Date.parse(value));
function requireValue(ok, code = 'INVALID_RESPONSE') { if (!ok) throw new ApiError(code); }
function context(caseId, options) {
  requireValue(isUuid(caseId), 'VALIDATION_FAILED');
  requireValue(options.accessToken && options.roles?.includes('LEGAL_VERIFIER'), 'ACCESS_DENIED');
  return `${root}/verification-cases/${caseId}`;
}
function reason(value, required = true) {
  requireValue((!required || text(value)) && (value == null || (typeof value === 'string' && value.trim().length <= 1000)), 'VALIDATION_FAILED');
  return value?.trim() || '';
}
function actor(value, options) { return isUuid(value) && (!options.userId || options.userId === value); }
function allocation(row) {
  return isUuid(row?.assetId) && isUuid(row.beneficiaryId)
    && ['description', 'assetName', 'assetType', 'recipientName', 'recipientRelationship'].every(key => row[key] == null || typeof row[key] === 'string')
    && (row.recipientSource == null || ['OWNER_DESIGNATED', 'COURT_DOCUMENT'].includes(row.recipientSource))
    && (row.sourceVersionNo == null || version(row.sourceVersionNo))
    && (row.accountLinked === undefined || typeof row.accountLinked === 'boolean');
}
function dossier(value, caseId) {
  requireValue(value?.caseId === caseId && isUuid(value.id) && ['NOTARIAL', 'COURT', 'ON_HOLD'].includes(value.route)
    && text(value.status) && text(value.disputeStatus) && version(value.requiredVersion) && Array.isArray(value.versions)
    && value.versions.every(item => version(item.version) && hash(item.sha256) && ['NOT_FORWARDED', 'FORWARDED'].includes(item.forwardStatus)
      && (item.allocations == null || (Array.isArray(item.allocations) && item.allocations.every(allocation)))));
  return value;
}
export async function loadLegalDossier(caseId, options = {}) {
  return dossier(await request(`${context(caseId, options)}/basis-dossier`, { ...options, expectedStatus: 200 }), caseId);
}

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
    if (action.allowed) requireValue(basis?.route === 'COURT' && value.caseStatus === 'OPEN' && value.vaultStatus === 'LEGAL_BASIS_VERIFICATION'
      && snapshot?.currentVersion > 0 && snapshot.reviewFresh && snapshot.courtResult === 'VALID'
      && (key !== 'unlock' || snapshot.approvalCurrent));
  }
  return { caseId, caseNumber: value.caseNumber, vaultId: value.vaultId, caseStatus: value.caseStatus, vaultStatus: value.vaultStatus,
    deathDocuments: value.deathDocuments.map(({ id, documentType, receivedAt }) => ({ id, documentType, receivedAt })),
    basisDossier: basis, snapshot, capabilities, evaluatedAt: value.evaluatedAt };
}
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
export async function loadDeathDocument(caseId, documentId, options = {}) {
  context(caseId, options); requireValue(isUuid(documentId), 'VALIDATION_FAILED');
  const value = await request(`${root}/death-documents/${documentId}`, { ...options, expectedStatus: 200 });
  requireValue(value?.deathDocumentPublicId === documentId && value.verificationCasePublicId === caseId
    && text(value.verificationCaseStatus) && text(value.vaultStatus) && value.document && Array.isArray(value.decisions));
  return value;
}
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
export async function loadWillComparisons(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/will-comparisons`, { ...options, expectedStatus: 200 });
  requireValue(value?.caseId === caseId && text(value.vaultStatus) && typeof value.approvalBlocked === 'boolean'
    && Array.isArray(value.originalWillIntakes) && value.originalWillIntakes.every(item => isUuid(item.id))
    && Array.isArray(value.wills) && value.wills.every(will => isUuid(will.id) && Array.isArray(will.versions)
      && will.versions.every(item => version(item.version) && hash(item.sha256))) && Array.isArray(value.comparisons));
  return value;
}
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
export async function classifyLegalDossier(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue((options.reclassification ? ['COURT'] : ['COURT', 'ON_HOLD']).includes(data.route), 'VALIDATION_FAILED');
  const value = await request(`${url}/basis-dossier${options.reclassification ? '/reclassification' : ''}`, {
    ...options, method: 'POST', body: { route: data.route, routeReason: reason(data.routeReason) }, expectedStatus: options.reclassification ? 200 : 201,
  });
  const result = dossier(value, caseId); requireValue(result.route === data.route && actor(result.classifiedBy, options)); return result;
}
export async function holdLegalDossier(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(['NEW_DISPUTE', 'INSUFFICIENT_EVIDENCE'].includes(data.cause), 'VALIDATION_FAILED');
  const value = dossier(await request(`${url}/basis-dossier/hold`, { ...options, method: 'POST',
    body: { cause: data.cause, reason: reason(data.reason) }, expectedStatus: 200 }), caseId);
  requireValue(value.route === 'ON_HOLD' && value.status === 'DRAFT'); return value;
}
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
export async function loadCourtDecisions(caseId, options = {}) {
  const value = await request(`${context(caseId, options)}/basis-dossier/court-decisions`, { ...options, expectedStatus: 200 });
  requireValue(Array.isArray(value) && value.every(item => isUuid(item.id) && item.caseId === caseId && version(item.version)
    && hash(item.sha256) && ['VALID', 'INVALID', 'INCONCLUSIVE'].includes(item.result) && isUuid(item.reviewedBy) && isUtcDate(item.reviewedAt)));
  return value;
}
export async function decideCourt(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(version(data.version) && hash(options.expectedHash) && ['VALID', 'INVALID', 'INCONCLUSIVE'].includes(data.result), 'VALIDATION_FAILED');
  const value = await request(`${url}/basis-dossier/court-decisions`, { ...options, method: 'POST',
    body: { version: data.version, result: data.result, reason: reason(data.reason) }, expectedStatus: 201 });
  requireValue(isUuid(value?.id) && value.caseId === caseId && value.version === data.version && value.sha256?.toLowerCase() === options.expectedHash.toLowerCase()
    && value.result === data.result && actor(value.reviewedBy, options) && isUtcDate(value.reviewedAt)); return value;
}
export async function decideLegalApproval(caseId, data, options = {}) {
  const url = context(caseId, options);
  requireValue(isUuid(options.dossierId) && ['APPROVE', 'REJECT'].includes(data.decision) && version(data.versionNo)
    && hash(data.sha256Hash) && hash(data.allocationHash), 'VALIDATION_FAILED');
  const body = { decision: data.decision, versionNo: data.versionNo, sha256Hash: data.sha256Hash, allocationHash: data.allocationHash,
    reason: reason(data.reason, data.decision === 'REJECT') };
  const value = await request(`${url}/basis-dossier/decision`, { ...options, method: 'POST', body, expectedStatus: 200 });
  requireValue(value?.dossierId === options.dossierId && value.decision === `LEGAL_${body.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED'}`
    && value.versionNo === body.versionNo && value.sha256Hash?.toLowerCase() === body.sha256Hash.toLowerCase()
    && value.allocationHash?.toLowerCase() === body.allocationHash.toLowerCase() && actor(value.decidedBy, options) && stamp(value.decidedAt));
  return value;
}
export async function unlockLegalVault(caseId, options = {}) {
  requireValue(isUuid(options.vaultId), 'VALIDATION_FAILED');
  const value = await request(`${context(caseId, options)}/unlock`, { ...options, method: 'POST', expectedStatus: 200 });
  requireValue(isUuid(options.vaultId) && value?.caseId === caseId && value.vaultId === options.vaultId
    && value.status === 'UNLOCKED' && actor(value.unlockedBy, options) && isUtcDate(value.unlockedAt)); return value;
}
