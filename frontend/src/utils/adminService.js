/**
 * Admin Service & Contract Validators (PS-110)
 * Architecture notes:
 * - Strictly front-end client calling Admin REST endpoints.
 * - Handles authentication headers, AbortSignal, and status mapping (401, 403, 404, 501).
 * - Distinguishes between live API, network/backend unready (404/501), and authentication failure.
 * - Multi-role aware: validates that accounts can possess multiple roles simultaneously.
 * - Append-only invariant: Audit logs are strictly read-only, without mutations or deletions.
 */

import { ApiError, request } from '../api/http.js';
import { isUuid } from '../api/contracts.js';

const AUDIT_ACTIONS = new Set(['INTAKE_ATTACHMENT_UPLOADED', 'EVIDENCE_FILE_READ', 'BENEFICIARY_INVITATION_ISSUED', 'BENEFICIARY_INVITATION_REISSUED', 'BENEFICIARY_INVITATION_REVOKED', 'BENEFICIARY_INVITATION_CONSUMED', 'AUTH_GOOGLE_IDENTITY_LINKED', 'SUBSCRIPTION_PAYMENT_CREATED', 'SUBSCRIPTION_PAYMENT_SUCCEEDED', 'SUBSCRIPTION_PAYMENT_FAILED', 'VAULT_HANDOVER_ARCHIVED', 'BENEFICIARY_HANDOVER_CONFIRMED', 'AUTH_REGISTERED', 'AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGIN_FAILED', 'SUBSCRIPTION_UPGRADED', 'SUBSCRIPTION_PLAN_DRAFT_CREATED', 'SUBSCRIPTION_PLAN_DRAFT_UPDATED', 'SUBSCRIPTION_PLAN_PUBLISHED', 'SUBSCRIPTION_PLAN_DEPRECATED', 'VAULT_CREATED', 'VAULT_ALERT_CANCELLED', 'ASSET_IMAGE_ADDED', 'ASSET_IMAGE_OPENED', 'ASSET_IMAGE_REMOVED', 'ASSET_CREATED', 'ASSET_UPDATED', 'ASSET_REVEALED', 'WILL_UPLOADED', 'WILL_VERSION_ADDED', 'WILL_FILE_OPENED', 'REAUTH_FAILED', 'TRUSTEE_APPOINTED', 'TRUSTEE_UPDATED', 'TRUSTEE_REVOKED', 'TRUSTEE_CONTACT_RECORDED', 'BENEFICIARY_ADDED', 'BENEFICIARY_UPDATED', 'BENEFICIARY_IDENTITY_VERIFIED', 'DMS_CONFIGURED', 'DMS_CHECKED_IN', 'DMS_TRIGGERED', 'DMS_GRACE_PERIOD_EXCEEDED', 'VERIFICATION_CASE_CREATED', 'VERIFICATION_CASE_CLAIMED', 'DEATH_DOCUMENT_RECORDED', 'ORIGINAL_WILL_RECEIVED', 'LEGAL_DEATH_DOCUMENT_DECIDED', 'WILL_COMPARISON_RECORDED', 'LEGAL_BASIS_CLASSIFIED', 'LEGAL_BASIS_RECEIVED', 'LEGAL_BASIS_FORWARDED', 'LEGAL_BASIS_RECLASSIFIED', 'COURT_DECISION_RECORDED', 'LEGAL_BASIS_HELD', 'LEGAL_BASIS_REVIEW_REQUIRED', 'LEGAL_BASIS_REVIEW_RECORDED', 'LEGAL_BASIS_DECIDED', 'LEGAL_VAULT_UNLOCKED', 'HANDOVER_SESSION_OPENED', 'HANDOVER_SESSION_COMPLETED', 'HANDOVER_SESSION_CANCELLED', 'HANDOVER_RECEIPT_STAFF_CONFIRMED', 'HANDOVER_ASSET_DELIVERED', 'BENEFICIARY_ACCOUNT_LINKED', 'BENEFICIARY_ACCOUNT_CREATED', 'LEGACY_EVENT']);
const AUDIT_ENTITIES = new Set(['USER', 'VAULT', 'ASSET', 'ASSET_VERSION', 'ASSET_IMAGE', 'WILL', 'TRUSTEE', 'BENEFICIARY', 'DMS_CONFIG', 'VERIFICATION_CASE', 'DEATH_DOCUMENT_RECORD', 'LEGAL_VERIFICATION', 'WILL_COMPARISON', 'ORIGINAL_WILL_INTAKE', 'LEGAL_BASIS_DOSSIER', 'LEGAL_BASIS_VERSION', 'COURT_DECISION', 'HANDOVER_SESSION', 'HANDOVER_ITEM', 'HANDOVER_RECEIPT', 'BENEFICIARY_INVITATION', 'SUBSCRIPTION', 'SUBSCRIPTION_PLAN', 'SUBSCRIPTION_PAYMENT', 'OTHER']);

const VALID_ROLES = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];
const ROLE_ALIASES = new Map(
  VALID_ROLES.flatMap((role) => [
    [role, role],
    [`ROLE_${role}`, role],
  ])
);

/**
 * Normalizes role strings removing Spring Security ROLE_ prefix.
 *
 * @param {string} role
 * @returns {string}
 */
export function normalizeAdminRole(role) {
  if (typeof role !== 'string') return '';
  return ROLE_ALIASES.get(role.trim()) || role.trim();
}

/**
 * Normalizes an array of roles.
 *
 * @param {Array<string>} roles
 * @returns {Array<string>}
 */
export function normalizeAdminRoles(roles) {
  if (!Array.isArray(roles)) return [];
  return [...new Set(roles.map(normalizeAdminRole).filter(Boolean))];
}

/**
 * Validates overview statistics payload.
 * Multi-role invariant: Total role occurrences MAY EXCEED total user accounts.
 *
 * @param {any} raw
 * @returns {Object}
 */
export function validateAdminOverview(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('INVALID_OVERVIEW_RESPONSE', 500);
  }

  const count = (value) => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : null;
  const roleDistribution = Object.fromEntries(VALID_ROLES.map(role => [role, count(raw.roleAssignments?.[`ROLE_${role}`])]));
  const values = Object.values(roleDistribution);
  const timestamp = (value) => typeof value === 'string' && /Z$/.test(value) && Number.isFinite(Date.parse(value)) ? value : null;
  return {
    totalAccounts: count(raw.totalAccounts), activeVaults: count(raw.activeVaults), processingCases: count(raw.processingCases),
    roleDistribution,
    totalRolesAssigned: values.every(value => value !== null) && Number.isSafeInteger(values.reduce((sum, value) => sum + value, 0))
      ? values.reduce((sum, value) => sum + value, 0) : null,
    startedAt: timestamp(raw.startedAt), completedAt: timestamp(raw.completedAt),
    consistency: raw.consistency === 'READ_COMMITTED_COLLECTION_WINDOW' ? raw.consistency : null,
  };
}

/**
 * Validates a single user record from Admin users API.
 *
 * @param {any} raw
 * @returns {Object}
 */
export function validateAdminUser(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('INVALID_USER_RECORD', 500);
  }

  const id = raw.publicId;
  if (!isUuid(id)) {
    throw new ApiError('MISSING_USER_ID', 500);
  }

  const email = String(raw.email || '').trim();
  const fullName = typeof raw.fullName === 'string' ? raw.fullName.trim() : '';
  const roles = normalizeAdminRoles(raw.roles);

  // Do NOT default status to 'ACTIVE'!
  const status =
    raw.status && typeof raw.status === 'string' && raw.status.trim()
      ? raw.status.trim().toUpperCase()
      : null;

  const createdAt = typeof raw.createdAt === 'string' && /Z$/.test(raw.createdAt) && Number.isFinite(Date.parse(raw.createdAt)) ? raw.createdAt : null;

  return {
    id,
    email,
    fullName,
    roles,
    status,
    createdAt,
  };
}

/**
 * Validates an audit log entry conforming to PS-13 / LV-AUD-001.
 *
 * @param {any} raw
 * @returns {Object}
 */
export function validateAdminAuditLog(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new ApiError('INVALID_AUDIT_RECORD', 500);
  }

  if (!isUuid(raw.id)) throw new ApiError('MISSING_AUDIT_ID', 500);
  const kinds = ['USER', 'SYSTEM', 'DELETED_USER', 'UNKNOWN'];
  if (!kinds.includes(raw.actor?.kind) || (raw.actor.userId !== null && !isUuid(raw.actor.userId)) ||
      !/Z$/.test(raw.occurredAt || '') || !Number.isFinite(Date.parse(raw.occurredAt)) ||
      !AUDIT_ACTIONS.has(raw.action) ||
      !AUDIT_ENTITIES.has(raw.entityType) ||
      (raw.vaultId !== null && !isUuid(raw.vaultId))) throw new ApiError('INVALID_AUDIT_RECORD', 500);
  // Explicit PS-108 whitelist. Never copy arbitrary raw properties or metadata.
  return { id: raw.id, occurredAt: raw.occurredAt, actorType: raw.actor.kind, actorId: raw.actor.userId,
    action: raw.action, entityType: raw.entityType, vaultId: raw.vaultId };

}

/**
 * Fetches admin overview statistics.
 *
 * @param {string} accessToken
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function fetchAdminOverview(accessToken, options = {}) {
  return validateAdminOverview(await request('/admin/overview', { ...options, accessToken, expectedStatus: 200 }));
}

/**
 * Fetches users list with search and filters.
 *
 * @param {string} accessToken
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export async function fetchAdminUsers(
  accessToken,
  { query = '', role = '', status = '', page = 1, pageSize = 20, ...options } = {}
) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      typeof query !== 'string' || query.trim().length > 100 ||
      (role && !VALID_ROLES.includes(normalizeAdminRole(role))) ||
      (status && !['ACTIVE', 'PENDING', 'DELETED'].includes(status))) throw new ApiError('VALIDATION_FAILED', 400);
  const urlParams = new URLSearchParams();
  if (query.trim()) urlParams.set('query', query.trim());
  if (role) urlParams.set('role', `ROLE_${normalizeAdminRole(role)}`);
  if (status) urlParams.set('status', status);
  urlParams.set('page', String(page - 1));
  urlParams.set('size', String(pageSize));

  const data = await request(`/admin/users?${urlParams}`, {
    ...options, accessToken, expectedStatus: 200,
  });

  if (!data || !Array.isArray(data.content) || !Number.isSafeInteger(data.totalElements) || data.totalElements < data.content.length ||
      data.page !== page - 1 || data.size !== pageSize || !Number.isSafeInteger(data.totalPages) ||
      data.totalPages !== Math.ceil(data.totalElements / pageSize) || data.content.length > pageSize) {
    throw new ApiError('INVALID_USERS_RESPONSE', 500);
  }

  const items = data.content.map(validateAdminUser);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError('INVALID_USERS_RESPONSE', 500);

  return {
    items, total: data.totalElements, page: data.page + 1, pageSize: data.size,
  };
}

export async function fetchAdminUserDetail(accessToken, id, options = {}) {
  if (!isUuid(id)) throw new ApiError('VALIDATION_FAILED', 400);
  const user = validateAdminUser(await request(`/admin/users/${id}`, { ...options, accessToken, expectedStatus: 200 }));
  if (user.id !== id) throw new ApiError('INVALID_USER_RECORD', 500);
  return user;
}

/**
 * Fetches audit logs with action and date filters.
 *
 * @param {string} accessToken
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export async function fetchAdminAuditLogs(accessToken,
  { action = '', actorType = '', actorId = '', fromDate = '', toDate = '', page = 1, pageSize = 20, ...options } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new ApiError('VALIDATION_FAILED', 400);
  const params = new URLSearchParams({ page: String(page - 1), size: String(pageSize) });
  if (action) params.set('action', action);
  if (actorType) params.set('actorKind', actorType);
  if (actorId) {
    if (!isUuid(actorId)) throw new ApiError('VALIDATION_FAILED', 400);
    params.set('actorId', actorId);
  }
  const dateBound = (value, end) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new ApiError('VALIDATION_FAILED', 400);
    const date = new Date(value + 'T00:00:00Z');
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0,10) !== value) throw new ApiError('VALIDATION_FAILED', 400);
    if (end) date.setUTCDate(date.getUTCDate() + 1);
    return date.toISOString();
  };
  if (fromDate) params.set('from', dateBound(fromDate, false));
  if (toDate) params.set('to', dateBound(toDate, true));
  if (fromDate && toDate && params.get('from') >= params.get('to')) throw new ApiError('VALIDATION_FAILED', 400);
  const raw = await request(`/admin/audit-logs?${params}`, { ...options, accessToken, expectedStatus: 200 });
  if (!raw || !Array.isArray(raw.content) || !Number.isSafeInteger(raw.totalElements) || raw.totalElements < raw.content.length ||
      raw.page !== page - 1 || raw.size !== pageSize || !Number.isSafeInteger(raw.totalPages) ||
      raw.totalPages !== Math.ceil(raw.totalElements / raw.size)) throw new ApiError('INVALID_AUDIT_LOGS_RESPONSE', 500);
  const items = raw.content.map(validateAdminAuditLog);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError('INVALID_AUDIT_LOGS_RESPONSE', 500);
  return { items, total: raw.totalElements, page: raw.page + 1, pageSize: raw.size };
}

export async function fetchAdminAuditDetail(accessToken, id, options = {}) {
  if (!isUuid(id)) throw new ApiError('VALIDATION_FAILED', 400);
  const raw = await request(`/admin/audit-logs/${id}`, { ...options, accessToken, expectedStatus: 200 });
  const event = validateAdminAuditLog(raw?.event);
  if (event.id !== id || (raw.traceId !== null && !isUuid(raw.traceId))) throw new ApiError('INVALID_AUDIT_RECORD', 500);
  return { ...event, traceId: raw.traceId };

}

/**
 * Guarded Lock/Unlock User Mutation.
 * Constraint: Contract & Backend policy for user lock/unlock is currently pending.
 * Returns explicit pending policy error to prevent client-side optimistic fabrication.
 *
 * @param {string} accessToken
 * @param {Object} params
 */
export async function lockAdminUser(accessToken, { userId, reason, signal = null }) {
  void accessToken;
  void userId;
  void reason;
  void signal;
  // Check if live backend supports endpoint or if contract is still pending
  throw new ApiError('LOCK_POLICY_PENDING', 501, {
    message: 'Backend user lock/unlock contract and policy is pending specification (coordinating with Long).',
  });
}
