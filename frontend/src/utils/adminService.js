/**
 * Admin Service & Contract Validators (PS-110)
 * Architecture notes:
 * - Strictly front-end client calling Admin REST endpoints.
 * - Handles authentication headers, AbortSignal, and status mapping (401, 403, 404, 501).
 * - Distinguishes between live API, network/backend unready (404/501), and authentication failure.
 * - Multi-role aware: validates that accounts can possess multiple roles simultaneously.
 * - Append-only invariant: Audit logs are strictly read-only, without mutations or deletions.
 */

import { ApiError } from '../api/http.js';

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

  const totalUsers = Number(raw.totalUsers);
  if (!Number.isFinite(totalUsers) || totalUsers < 0) {
    throw new ApiError('INVALID_TOTAL_USERS', 500);
  }

  // Do NOT default activeUsers to totalUsers or 0! If missing, keep null.
  const activeUsers =
    raw.activeUsers !== undefined && raw.activeUsers !== null && Number.isFinite(Number(raw.activeUsers))
      ? Number(raw.activeUsers)
      : null;

  // Do NOT default lockedUsers to 0! If missing, keep null.
  const lockedUsers =
    raw.lockedUsers !== undefined && raw.lockedUsers !== null && Number.isFinite(Number(raw.lockedUsers))
      ? Number(raw.lockedUsers)
      : null;

  // Role distribution object: do NOT default missing counts to 0!
  const rawDistribution = raw.roleDistribution && typeof raw.roleDistribution === 'object' ? raw.roleDistribution : {};
  const parseCount = (v) =>
    v !== undefined && v !== null && Number.isFinite(Number(v)) ? Number(v) : null;

  const roleDistribution = {
    VAULT_OWNER: parseCount(rawDistribution.VAULT_OWNER ?? rawDistribution.ROLE_VAULT_OWNER),
    BENEFICIARY: parseCount(rawDistribution.BENEFICIARY ?? rawDistribution.ROLE_BENEFICIARY),
    STAFF_EXECUTOR: parseCount(rawDistribution.STAFF_EXECUTOR ?? rawDistribution.ROLE_STAFF_EXECUTOR),
    LEGAL_VERIFIER: parseCount(rawDistribution.LEGAL_VERIFIER ?? rawDistribution.ROLE_LEGAL_VERIFIER),
    ADMIN: parseCount(rawDistribution.ADMIN ?? rawDistribution.ROLE_ADMIN),
  };

  const validCounts = Object.values(roleDistribution).filter((v) => v !== null);
  const totalRolesAssigned = validCounts.length > 0 ? validCounts.reduce((sum, v) => sum + v, 0) : null;

  // Do NOT default asOf to new Date().toISOString()!
  const asOf = typeof raw.asOf === 'string' && raw.asOf.trim() ? raw.asOf.trim() : null;

  return {
    asOf,
    totalUsers,
    activeUsers,
    lockedUsers,
    roleDistribution,
    totalRolesAssigned,
    subscriptionsSummary: raw.subscriptionsSummary || null,
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

  const id = String(raw.id || '').trim();
  if (!id) {
    throw new ApiError('MISSING_USER_ID', 500);
  }

  const email = String(raw.email || '').trim();
  const fullName = String(raw.fullName || raw.name || '').trim();
  const roles = normalizeAdminRoles(raw.roles);

  // Do NOT default status to 'ACTIVE'!
  const status =
    raw.status && typeof raw.status === 'string' && raw.status.trim()
      ? raw.status.trim().toUpperCase()
      : null;

  const createdAt = raw.createdAt || raw.createdDate || null;
  const lastLoginAt = raw.lastLoginAt || raw.lastLogin || null;

  return {
    id,
    email,
    fullName,
    roles,
    status,
    createdAt,
    lastLoginAt,
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

  const id = String(raw.id || '').trim();
  if (!id) {
    throw new ApiError('MISSING_AUDIT_ID', 500);
  }

  // Do NOT default occurredAt to new Date().toISOString()!
  const occurredAt =
    typeof raw.occurredAt === 'string' && raw.occurredAt.trim()
      ? raw.occurredAt.trim()
      : typeof raw.timestamp === 'string' && raw.timestamp.trim()
        ? raw.timestamp.trim()
        : null;

  // Do NOT default actorType to 'USER'!
  const actorType =
    raw.actorType && typeof raw.actorType === 'string' && raw.actorType.trim()
      ? raw.actorType.trim().toUpperCase()
      : null;

  const actorId = raw.actorId ? String(raw.actorId).trim() : null;
  const actorName = raw.actorName ? String(raw.actorName).trim() : null;
  const actorRoles = normalizeAdminRoles(raw.actorRoles || []);
  const action = String(raw.action || '').trim();
  const entityType = raw.entityType ? String(raw.entityType).trim() : null;
  const entityId = raw.entityId ? String(raw.entityId).trim() : null;
  const traceId = raw.traceId ? String(raw.traceId).trim() : null;
  const ipAddress = raw.ipAddress || raw.ip || null;
  const stepId = raw.stepId ? String(raw.stepId).trim() : null;
  const ruleId = raw.ruleId ? String(raw.ruleId).trim() : null;

  // Whitelist check: filter out any secrets (password, token, jwt, secret, secretKey, privateKey)
  const sanitizeAuditMeta = (data) => {
    if (!data) return null;
    if (typeof data !== 'object') return data;
    const clean = Array.isArray(data) ? [] : {};
    for (const [k, v] of Object.entries(data)) {
      const lower = k.toLowerCase();
      if (
        lower.includes('password') ||
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('jwt') ||
        lower.includes('privatekey')
      ) {
        continue; // Strictly omit secret fields per PS-13
      }
      clean[k] = v;
    }
    return clean;
  };

  const stateBefore = sanitizeAuditMeta(raw.stateBefore);
  const stateAfter = sanitizeAuditMeta(raw.stateAfter);
  const context = sanitizeAuditMeta(raw.context);

  return {
    id,
    occurredAt,
    actorType,
    actorId,
    actorName,
    actorRoles,
    action,
    entityType,
    entityId,
    traceId,
    ipAddress,
    stepId,
    ruleId,
    stateBefore,
    stateAfter,
    context,
  };
}

/**
 * Executes an authenticated Admin request, handling standard error codes.
 */
async function executeAdminFetch(url, { accessToken, method = 'GET', body = null, signal = null } = {}) {
  const headers = {
    Accept: 'application/json',
  };

  if (accessToken) {
    headers['Authorization'] = `Bearer ${accessToken}`;
  }

  if (body) {
    headers['Content-Type'] = 'application/json';
  }

  let response;
  try {
    response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : null,
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') {
      throw err;
    }
    // Network or server unreachable
    throw new ApiError('BACKEND_NOT_READY', 0, { cause: err });
  }

  if (response.status === 401) {
    throw new ApiError('UNAUTHENTICATED', 401);
  }

  if (response.status === 403) {
    throw new ApiError('FORBIDDEN', 403);
  }

  if (response.status === 404 || response.status === 501) {
    throw new ApiError('API_NOT_AVAILABLE', response.status);
  }

  if (!response.ok) {
    let payload = null;
    try {
      payload = await response.json();
    } catch {
      // ignore
    }
    throw new ApiError(payload?.code || 'ADMIN_API_ERROR', response.status, {
      details: payload,
    });
  }

  return response.json();
}

/**
 * Fetches admin overview statistics.
 *
 * @param {string} accessToken
 * @param {Object} [options]
 * @returns {Promise<Object>}
 */
export async function fetchAdminOverview(accessToken, { signal = null } = {}) {
  const data = await executeAdminFetch('/api/v1/admin/overview', {
    accessToken,
    signal,
  });
  return validateAdminOverview(data);
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
  { query = '', role = '', status = '', page = 1, pageSize = 20, signal = null } = {}
) {
  const urlParams = new URLSearchParams();
  if (query) urlParams.set('q', query);
  if (role) urlParams.set('role', role);
  if (status) urlParams.set('status', status);
  urlParams.set('page', String(page));
  urlParams.set('pageSize', String(pageSize));

  const data = await executeAdminFetch(`/api/v1/admin/users?${urlParams.toString()}`, {
    accessToken,
    signal,
  });

  if (!data || typeof data !== 'object') {
    throw new ApiError('INVALID_USERS_RESPONSE', 500);
  }

  const rawList = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : null);
  if (!rawList) {
    throw new ApiError('INVALID_USERS_RESPONSE', 500);
  }

  const items = rawList.map(validateAdminUser);
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : items.length;

  return {
    items,
    total,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : Number(page),
    pageSize: Number.isFinite(Number(data.pageSize)) ? Number(data.pageSize) : Number(pageSize),
  };
}

/**
 * Fetches audit logs with action and date filters.
 *
 * @param {string} accessToken
 * @param {Object} [params]
 * @returns {Promise<Object>}
 */
export async function fetchAdminAuditLogs(
  accessToken,
  { action = '', actorType = '', fromDate = '', toDate = '', page = 1, pageSize = 20, signal = null } = {}
) {
  const urlParams = new URLSearchParams();
  if (action) urlParams.set('action', action);
  if (actorType) urlParams.set('actorType', actorType);
  if (fromDate) urlParams.set('fromDate', fromDate);
  if (toDate) urlParams.set('toDate', toDate);
  urlParams.set('page', String(page));
  urlParams.set('pageSize', String(pageSize));

  const data = await executeAdminFetch(`/api/v1/admin/audit-logs?${urlParams.toString()}`, {
    accessToken,
    signal,
  });

  if (!data || typeof data !== 'object') {
    throw new ApiError('INVALID_AUDIT_LOGS_RESPONSE', 500);
  }

  const rawList = Array.isArray(data.items) ? data.items : (Array.isArray(data) ? data : null);
  if (!rawList) {
    throw new ApiError('INVALID_AUDIT_LOGS_RESPONSE', 500);
  }

  const items = rawList.map(validateAdminAuditLog);
  const total = Number.isFinite(Number(data.total)) ? Number(data.total) : items.length;

  return {
    items,
    total,
    page: Number.isFinite(Number(data.page)) ? Number(data.page) : Number(page),
    pageSize: Number.isFinite(Number(data.pageSize)) ? Number(data.pageSize) : Number(pageSize),
  };
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
