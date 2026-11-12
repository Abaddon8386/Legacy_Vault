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

const AUDIT_ACTIONS = new Set(['BENEFICIARY_INVITATION_EMAIL_QUEUED', 'AUTH_RECOVERY_ISSUED', 'AUTH_PASSWORD_RESET', 'AUTH_EMAIL_VERIFICATION_ISSUED', 'AUTH_EMAIL_VERIFIED', 'AUTH_EMAIL_CHANGED', 'AUTH_PASSWORD_CHANGED', 'ASSET_DOCUMENT_ADDED', 'ASSET_DOCUMENT_OPENED', 'ASSET_DOCUMENT_REMOVED', 'RECEIVED_ASSET_OPENED', 'RECEIVED_ASSET_IMAGE_OPENED', 'BENEFICIARY_COUNTER_ATTESTED', 'DISTRIBUTION_DOCUMENTS_REQUESTED', 'DISTRIBUTION_DOCUMENTS_APPROVED', 'DISTRIBUTION_DOCUMENT_SUPPLEMENTATION_REQUESTED', 'DISTRIBUTION_ALLOCATIONS_SUBMITTED', 'DISTRIBUTION_ALLOCATIONS_APPROVED', 'DISTRIBUTION_ALLOCATION_CHANGES_REQUESTED', 'BENEFICIARY_ACCOUNT_CREATED_UNLINKED', 'BENEFICIARY_LINK_REQUESTED', 'BENEFICIARY_LINK_REQUEST_CANCELLED', 'BENEFICIARY_LINK_REQUEST_APPROVED', 'BENEFICIARY_LINK_REQUEST_REJECTED', 'BENEFICIARY_GUARDIAN_RECORDED', 'HANDOVER_GROUP_CHANGED', 'BENEFICIARY_GUARDIAN_REVOKED', 'AUTH_PROFILE_UPDATED', 'INTAKE_ATTACHMENT_UPLOADED', 'EVIDENCE_FILE_READ', 'BENEFICIARY_INVITATION_ISSUED', 'BENEFICIARY_INVITATION_REISSUED', 'BENEFICIARY_INVITATION_REVOKED', 'BENEFICIARY_INVITATION_CONSUMED', 'AUTH_GOOGLE_IDENTITY_LINKED', 'AUTH_PASSWORD_SET', 'SUBSCRIPTION_PAYMENT_CREATED', 'SUBSCRIPTION_PAYMENT_SUCCEEDED', 'SUBSCRIPTION_PAYMENT_FAILED', 'VAULT_HANDOVER_ARCHIVED', 'BENEFICIARY_HANDOVER_CONFIRMED', 'AUTH_REGISTERED', 'AUTH_LOGIN_SUCCEEDED', 'AUTH_LOGIN_FAILED', 'SUBSCRIPTION_UPGRADED', 'SUBSCRIPTION_PLAN_DRAFT_CREATED', 'SUBSCRIPTION_PLAN_DRAFT_UPDATED', 'SUBSCRIPTION_PLAN_PUBLISHED', 'SUBSCRIPTION_PLAN_DEPRECATED', 'VAULT_CREATED', 'VAULT_ALERT_CANCELLED', 'ASSET_IMAGE_ADDED', 'ASSET_IMAGE_OPENED', 'ASSET_IMAGE_REMOVED', 'ASSET_CREATED', 'ASSET_UPDATED', 'ASSET_REVEALED', 'WILL_UPLOADED', 'WILL_VERSION_ADDED', 'WILL_FILE_OPENED', 'REAUTH_FAILED', 'TRUSTEE_APPOINTED', 'TRUSTEE_UPDATED', 'TRUSTEE_REVOKED', 'TRUSTEE_CONTACT_RECORDED', 'CASE_CONTACTS_VIEWED', 'BENEFICIARY_ADDED', 'BENEFICIARY_UPDATED', 'BENEFICIARY_IDENTITY_VERIFIED', 'DMS_CONFIGURED', 'DMS_CHECKED_IN', 'DMS_TRIGGERED', 'DMS_GRACE_PERIOD_EXCEEDED', 'VERIFICATION_CASE_CREATED', 'VERIFICATION_CASE_CLAIMED', 'DEATH_DOCUMENT_RECORDED', 'ORIGINAL_WILL_RECEIVED', 'LEGAL_DEATH_DOCUMENT_DECIDED', 'WILL_COMPARISON_RECORDED', 'LEGAL_BASIS_CLASSIFIED', 'LEGAL_BASIS_RECEIVED', 'LEGAL_BASIS_FORWARDED', 'LEGAL_BASIS_RECLASSIFIED', 'COURT_DECISION_RECORDED', 'LEGAL_BASIS_HELD', 'LEGAL_BASIS_REVIEW_REQUIRED', 'LEGAL_BASIS_REVIEW_RECORDED', 'LEGAL_BASIS_DECIDED', 'LEGAL_VAULT_UNLOCKED', 'HANDOVER_SESSION_OPENED', 'HANDOVER_SESSION_COMPLETED', 'HANDOVER_SESSION_CANCELLED', 'HANDOVER_RECEIPT_STAFF_CONFIRMED', 'HANDOVER_ASSET_DELIVERED', 'BENEFICIARY_ACCOUNT_LINKED', 'BENEFICIARY_ACCOUNT_CREATED', 'ADMIN_USER_CREATED', 'ADMIN_USER_ROLE_CHANGED', 'ADMIN_USER_LOCKED', 'ADMIN_USER_UNLOCKED', 'ADMIN_USER_PASSWORD_RESET', 'LEGACY_EVENT']);
const AUDIT_ROLES = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'BENEFICIARY', 'ADMIN'];
const CASE_NUMBER = /^HS-[0-9]{4}-[0-9]{6}$/;
const AUDIT_ENTITIES = new Set(['USER', 'VAULT', 'ASSET', 'ASSET_VERSION', 'ASSET_IMAGE', 'WILL', 'TRUSTEE', 'BENEFICIARY', 'DMS_CONFIG', 'VERIFICATION_CASE', 'DEATH_DOCUMENT_RECORD', 'LEGAL_VERIFICATION', 'WILL_COMPARISON', 'ORIGINAL_WILL_INTAKE', 'LEGAL_BASIS_DOSSIER', 'LEGAL_BASIS_VERSION', 'COURT_DECISION', 'HANDOVER_SESSION', 'HANDOVER_ITEM', 'HANDOVER_RECEIPT', 'BENEFICIARY_INVITATION', 'SUBSCRIPTION', 'SUBSCRIPTION_PLAN', 'SUBSCRIPTION_PAYMENT', 'OTHER']);

const VALID_ROLES = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];
export const PROCESSING_ACCOUNT_ROLES = ['BENEFICIARY', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER'];
export const ADMIN_VAULT_STATUSES = ['NO_VAULT', 'ACTIVE', 'IN_PROCESS', 'ARCHIVED'];
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

function roleAccountStatuses(role) {
  const normalized = normalizeAdminRole(role);
  return normalized === 'VAULT_OWNER' ? ['ACTIVE', 'LOCKED']
    : PROCESSING_ACCOUNT_ROLES.includes(normalized) ? ['ACTIVE', 'LOCKED', 'IN_PROCESS'] : null;
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
    accountStatus: ['ACTIVE', 'LOCKED', 'IN_PROCESS', 'PENDING', 'DELETED'].includes(raw.accountStatus) ? raw.accountStatus : status,
    vaultStatus: roles.includes('VAULT_OWNER') && ADMIN_VAULT_STATUSES.includes(raw.vaultStatus) ? raw.vaultStatus : null,
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
  // Context fields are optional so an older backend that does not send them still validates.
  const role = raw.actor.role ?? null, ownerId = raw.ownerId ?? null, caseId = raw.caseId ?? null,
    caseNumber = raw.caseNumber ?? null, staffId = raw.staffId ?? null, name = raw.actor.name ?? null;
  if ((role !== null && !AUDIT_ROLES.includes(role)) || [ownerId, caseId, staffId].some(v => v !== null && !isUuid(v)) ||
      (caseNumber !== null && !CASE_NUMBER.test(caseNumber)) || (name !== null && (typeof name !== 'string' || name.length > 150))) throw new ApiError('INVALID_AUDIT_RECORD', 500);
  // Explicit PS-108 whitelist. Never copy arbitrary raw properties or metadata.
  return { id: raw.id, occurredAt: raw.occurredAt, actorType: raw.actor.kind, actorId: raw.actor.userId,
    action: raw.action, entityType: raw.entityType, vaultId: raw.vaultId, actorName: name, actorRole: role, ownerId, caseId, caseNumber, staffId };

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
  { query = '', role = '', status = '', vaultStatus = '', page = 1, pageSize = 20, ...options } = {}
) {
  const allowedStatuses = roleAccountStatuses(role);
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100 ||
      typeof query !== 'string' || query.trim().length > 100 ||
      (role && !VALID_ROLES.includes(normalizeAdminRole(role))) ||
      (status && !['ACTIVE', 'PENDING', 'LOCKED', 'IN_PROCESS', 'DELETED'].includes(status)) ||
      (status && allowedStatuses && !allowedStatuses.includes(status)) ||
      (vaultStatus && (normalizeAdminRole(role) !== 'VAULT_OWNER' || !ADMIN_VAULT_STATUSES.includes(vaultStatus)))) throw new ApiError('VALIDATION_FAILED', 400);
  const urlParams = new URLSearchParams();
  if (query.trim()) urlParams.set('query', query.trim());
  if (role) urlParams.set('role', `ROLE_${normalizeAdminRole(role)}`);
  if (status) urlParams.set('status', status);
  if (vaultStatus) urlParams.set('vaultStatus', vaultStatus);
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
  if (allowedStatuses && items.some(user => !['ACTIVE', 'LOCKED'].includes(user.status) || !allowedStatuses.includes(user.accountStatus))) throw new ApiError('INVALID_USERS_RESPONSE', 500);
  if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError('INVALID_USERS_RESPONSE', 500);

  return {
    items, total: data.totalElements, page: data.page + 1, pageSize: data.size,
  };
}

export async function fetchAdminUserDetail(accessToken, id, { role = '', ...options } = {}) {
  if (!isUuid(id) || (role && !VALID_ROLES.includes(normalizeAdminRole(role)))) throw new ApiError('VALIDATION_FAILED', 400);
  const query = role ? `?${new URLSearchParams({ role: `ROLE_${normalizeAdminRole(role)}` })}` : '';
  const user = validateAdminUser(await request(`/admin/users/${id}${query}`, { ...options, accessToken, expectedStatus: 200 }));
  const allowedStatuses = roleAccountStatuses(role);
  if (allowedStatuses && (!['ACTIVE', 'LOCKED'].includes(user.status) || !allowedStatuses.includes(user.accountStatus))) throw new ApiError('INVALID_USER_RECORD', 500);
  if (user.id !== id) throw new ApiError('INVALID_USER_RECORD', 500);
  return user;
}

/** Roles an Admin may grant when creating an account or changing a role. */
export const ASSIGNABLE_ADMIN_ROLES = ['STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'VAULT_OWNER'];

/**
 * Mirrors the backend PasswordPolicy: 8-72 characters, at most 72 UTF-8 bytes, not blank, no NUL and no unpaired
 * surrogates. Kept here so a password the server would refuse is explained next to the field.
 */
function isAcceptablePassword(password) {
  if (!password.trim() || password.length < 8 || password.length > 72 || password.includes('\0')) return false;
  if (new TextEncoder().encode(password).length > 72) return false;
  for (let i = 0; i < password.length; i++) {
    const unit = password.charCodeAt(i);
    if (unit >= 0xD800 && unit <= 0xDBFF) {
      const next = password.charCodeAt(i + 1);
      if (!(next >= 0xDC00 && next <= 0xDFFF)) return false;
      i++;
    } else if (unit >= 0xDC00 && unit <= 0xDFFF) {
      return false;
    }
  }
  return true;
}

/**
 * Client-side check of the create-account form. Returns { field: reasonCode }; empty means valid.
 * Mirrors the backend rules (the server stays authoritative).
 */
export function validateCreateAdminUserForm({ fullName = '', email = '', phone = '', password = '', confirmPassword, role = '' } = {}) {
  const errors = {};
  if (!fullName.trim()) errors.fullName = 'required';
  else if (fullName.trim().length > 150) errors.fullName = 'tooLong';
  if (!email.trim()) errors.email = 'required';
  else if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'invalid';
  if (phone.trim() && !/^\+?[0-9]{8,15}$/.test(phone.trim())) errors.phone = 'invalid';
  if (!password) errors.password = 'required';
  else if (!isAcceptablePassword(password)) errors.password = 'invalid';
  // Only the form passes confirmPassword; the API helper validates the rest.
  if (confirmPassword !== undefined) {
    if (!confirmPassword) errors.confirmPassword = 'required';
    else if (confirmPassword !== password) errors.confirmPassword = 'mismatch';
  }
  if (!ASSIGNABLE_ADMIN_ROLES.includes(normalizeAdminRole(role))) errors.role = 'required';
  return errors;
}

/**
 * Creates an ACTIVE account with exactly one role (Staff, Legal or Vault Owner).
 * The password is only sent in the request body and is never returned or retained.
 */
export async function createAdminUser(accessToken, { fullName, email, phone = '', password, role, ...options } = {}) {
  if (Object.keys(validateCreateAdminUserForm({ fullName, email, phone, password, role })).length) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const body = { fullName: fullName.trim(), email: email.trim(), phone: phone.trim(), password,
    role: `ROLE_${normalizeAdminRole(role)}` };
  return validateAdminUser(await request('/admin/users', { ...options, method: 'POST', body, accessToken, expectedStatus: 201 }));
}

/**
 * Client-side check of the "reset password" form. Returns { field: reasonCode }; empty means valid.
 *
 * - email: required, at most 254 characters, must look like an address.
 * - newPassword: required and acceptable to the backend password policy (see isAcceptablePassword).
 * - confirmPassword: only checked when the form passes it; must equal newPassword.
 *
 * Mirrors the server rules for fast feedback; the server stays authoritative.
 */
export function validateResetAdminPasswordForm({ email = '', newPassword = '', confirmPassword } = {}) {
  const errors = {};
  if (!email.trim()) errors.email = 'required';
  else if (email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.email = 'invalid';
  if (!newPassword) errors.newPassword = 'required';
  else if (!isAcceptablePassword(newPassword)) errors.newPassword = 'invalid';
  if (confirmPassword !== undefined) {
    if (!confirmPassword) errors.confirmPassword = 'required';
    else if (confirmPassword !== newPassword) errors.confirmPassword = 'mismatch';
  }
  return errors;
}

/**
 * Admin sets a new password for the account with the given e-mail (POST /admin/users/reset-password).
 *
 * The backend hashes the password, ends every session of that account and writes an audit record. The password is
 * only sent in the request body; it is never returned, logged or retained here. Resolves with the validated
 * account record (without any password data).
 *
 * @param {string} accessToken Admin bearer token.
 * @param {{email: string, newPassword: string}} input Target account e-mail and the new password.
 * @returns {Promise<object>} The target account after the change.
 * @throws {ApiError} VALIDATION_FAILED (client check), or the server error (404 unknown e-mail, 409 protected/no-password account).
 */
export async function resetAdminUserPassword(accessToken, { email, newPassword, ...options } = {}) {
  if (Object.keys(validateResetAdminPasswordForm({ email, newPassword })).length) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  return validateAdminUser(await request('/admin/users/reset-password', {
    ...options, method: 'POST', body: { email: email.trim(), newPassword }, accessToken, expectedStatus: 200,
  }));
}

/**
 * Fetches audit logs with action and date filters.
 *
 * @param {string} accessToken
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export async function fetchAdminAuditLogs(accessToken,
  { action = '', actorType = '', actorId = '', vaultId = '', caseNumber = '', fromDate = '', toDate = '', page = 1, pageSize = 20, ...options } = {}) {
  if (!Number.isSafeInteger(page) || page < 1 || !Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100)
    throw new ApiError('VALIDATION_FAILED', 400);
  const params = new URLSearchParams({ page: String(page - 1), size: String(pageSize) });
  if (action) params.set('action', action);
  // The actor filter lists SYSTEM, UNKNOWN or one role; a role is sent as actorRole, anything else as actorKind.
  if (actorType) params.set(AUDIT_ROLES.includes(actorType) ? 'actorRole' : 'actorKind', actorType);
  if (actorId) {
    if (!isUuid(actorId)) throw new ApiError('VALIDATION_FAILED', 400);
    params.set('actorId', actorId);
  }
  if (vaultId) {
    if (!isUuid(vaultId)) throw new ApiError('VALIDATION_FAILED', 400);
    params.set('vaultId', vaultId);
  }
  if (caseNumber) {
    if (!CASE_NUMBER.test(caseNumber.toUpperCase())) throw new ApiError('VALIDATION_FAILED', 400);
    params.set('caseNumber', caseNumber.toUpperCase());
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
 * Locks or unlocks an account. Locking also ends the account's sessions on the server; the optional reason is only
 * sent when locking and is kept in the audit trail.
 */
export async function setAdminUserLocked(accessToken, id, locked, { reason = '', ...options } = {}) {
  if (!isUuid(id) || typeof locked !== 'boolean' || typeof reason !== 'string' || reason.trim().length > 255) {
    throw new ApiError('VALIDATION_FAILED', 400);
  }
  const note = reason.trim();
  const user = validateAdminUser(await request(`/admin/users/${id}/${locked ? 'lock' : 'unlock'}`, {
    ...options, method: 'POST', accessToken, expectedStatus: 200,
    ...(locked && note ? { body: { reason: note } } : {}),
  }));
  if (user.id !== id) throw new ApiError('INVALID_USER_RECORD', 500);
  return user;
}
