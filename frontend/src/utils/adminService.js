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
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_OVERVIEW_RESPONSE');
  }

  const totalUsers = Number(raw.totalUsers);
  if (!Number.isFinite(totalUsers) || totalUsers < 0) {
    throw new ApiError('INVALID_TOTAL_USERS');
  }

  const activeUsers = Number(raw.activeUsers ?? totalUsers);
  const lockedUsers = Number(raw.lockedUsers ?? 0);

  // Role distribution object: { VAULT_OWNER: count, BENEFICIARY: count, ... }
  const rawDistribution = raw.roleDistribution || {};
  const roleDistribution = {
    VAULT_OWNER: Number(rawDistribution.VAULT_OWNER || rawDistribution.ROLE_VAULT_OWNER || 0),
    BENEFICIARY: Number(rawDistribution.BENEFICIARY || rawDistribution.ROLE_BENEFICIARY || 0),
    STAFF_EXECUTOR: Number(rawDistribution.STAFF_EXECUTOR || rawDistribution.ROLE_STAFF_EXECUTOR || 0),
    LEGAL_VERIFIER: Number(rawDistribution.LEGAL_VERIFIER || rawDistribution.ROLE_LEGAL_VERIFIER || 0),
    ADMIN: Number(rawDistribution.ADMIN || rawDistribution.ROLE_ADMIN || 0),
  };

  const totalRolesAssigned = Object.values(roleDistribution).reduce((sum, v) => sum + (Number.isFinite(v) ? v : 0), 0);

  return {
    asOf: typeof raw.asOf === 'string' ? raw.asOf : new Date().toISOString(),
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
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_USER_RECORD');
  }

  const id = String(raw.id || '').trim();
  if (!id) {
    throw new ApiError('MISSING_USER_ID');
  }

  const email = String(raw.email || '').trim();
  const fullName = String(raw.fullName || raw.name || '').trim();
  const roles = normalizeAdminRoles(raw.roles);
  const status = String(raw.status || 'ACTIVE').toUpperCase();
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
  if (!raw || typeof raw !== 'object') {
    throw new ApiError('INVALID_AUDIT_RECORD');
  }

  const id = String(raw.id || '').trim();
  if (!id) {
    throw new ApiError('MISSING_AUDIT_ID');
  }

  const occurredAt = raw.occurredAt || raw.timestamp || new Date().toISOString();
  const actorType = String(raw.actorType || 'USER').toUpperCase();
  const actorId = raw.actorId ? String(raw.actorId) : null;
  const actorName = raw.actorName ? String(raw.actorName) : null;
  const actorRoles = normalizeAdminRoles(raw.actorRoles || []);
  const action = String(raw.action || '').trim();
  const entityType = raw.entityType ? String(raw.entityType) : null;
  const entityId = raw.entityId ? String(raw.entityId) : null;
  const traceId = raw.traceId ? String(raw.traceId) : null;
  const ipAddress = raw.ipAddress || raw.ip || null;
  const stateBefore = raw.stateBefore || null;
  const stateAfter = raw.stateAfter || null;
  const context = raw.context || null;

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

  const items = Array.isArray(data?.items || data) ? (data.items || data).map(validateAdminUser) : [];
  const total = Number(data?.total ?? items.length);

  return {
    items,
    total,
    page: Number(data?.page ?? page),
    pageSize: Number(data?.pageSize ?? pageSize),
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

  const items = Array.isArray(data?.items || data) ? (data.items || data).map(validateAdminAuditLog) : [];
  const total = Number(data?.total ?? items.length);

  return {
    items,
    total,
    page: Number(data?.page ?? page),
    pageSize: Number(data?.pageSize ?? pageSize),
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
