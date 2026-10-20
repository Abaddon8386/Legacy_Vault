import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdminRole,
  normalizeAdminRoles,
  validateAdminOverview,
  validateAdminUser,
  validateAdminAuditLog,
  fetchAdminOverview,
  fetchAdminUsers,
  fetchAdminAuditLogs,
  lockAdminUser,
} from './adminService.js';

test('normalizeAdminRole strips ROLE_ prefix and keeps valid roles', () => {
  assert.equal(normalizeAdminRole('ROLE_ADMIN'), 'ADMIN');
  assert.equal(normalizeAdminRole('ADMIN'), 'ADMIN');
  assert.equal(normalizeAdminRole('ROLE_VAULT_OWNER'), 'VAULT_OWNER');
  assert.equal(normalizeAdminRole('BENEFICIARY'), 'BENEFICIARY');
  assert.equal(normalizeAdminRole(''), '');
  assert.equal(normalizeAdminRole(null), '');
});

test('normalizeAdminRoles dedupes and normalizes arrays', () => {
  const input = ['ROLE_VAULT_OWNER', 'VAULT_OWNER', 'ROLE_BENEFICIARY'];
  const output = normalizeAdminRoles(input);
  assert.deepEqual(output, ['VAULT_OWNER', 'BENEFICIARY']);
  assert.deepEqual(normalizeAdminRoles(null), []);
});

test('validateAdminOverview validates metrics and handles multi-role distribution correctly', () => {
  const raw = {
    asOf: '2026-10-20T12:00:00Z',
    totalUsers: 100,
    activeUsers: 95,
    lockedUsers: 5,
    roleDistribution: {
      VAULT_OWNER: 80,
      BENEFICIARY: 60, // 80 + 60 = 140 > 100 total users (multi-role users)
      STAFF_EXECUTOR: 10,
      LEGAL_VERIFIER: 5,
      ADMIN: 2,
    },
  };

  const overview = validateAdminOverview(raw);
  assert.equal(overview.totalUsers, 100);
  assert.equal(overview.activeUsers, 95);
  assert.equal(overview.lockedUsers, 5);
  // Total assigned roles (157) legitimately exceeds totalUsers (100)
  assert.equal(overview.totalRolesAssigned, 157);
  assert.equal(overview.roleDistribution.VAULT_OWNER, 80);
  assert.equal(overview.roleDistribution.BENEFICIARY, 60);
});

test('validateAdminOverview rejects invalid total users count', () => {
  assert.throws(() => validateAdminOverview({ totalUsers: -5 }), /INVALID_TOTAL_USERS/);
  assert.throws(() => validateAdminOverview(null), /INVALID_OVERVIEW_RESPONSE/);
});

test('validateAdminUser validates user record and normalizes roles', () => {
  const raw = {
    id: 'u-123',
    email: 'user@example.com',
    fullName: 'Nguyen Van A',
    roles: ['ROLE_VAULT_OWNER', 'ROLE_BENEFICIARY'],
    status: 'active',
    createdAt: '2026-10-01T00:00:00Z',
  };

  const user = validateAdminUser(raw);
  assert.equal(user.id, 'u-123');
  assert.equal(user.email, 'user@example.com');
  assert.equal(user.fullName, 'Nguyen Van A');
  assert.deepEqual(user.roles, ['VAULT_OWNER', 'BENEFICIARY']);
  assert.equal(user.status, 'ACTIVE');
});

test('validateAdminUser rejects missing ID', () => {
  assert.throws(() => validateAdminUser({ email: 'no-id@example.com' }), /MISSING_USER_ID/);
});

test('validateAdminAuditLog validates audit entry conforming to PS-13', () => {
  const raw = {
    id: 'aud-456',
    occurredAt: '2026-10-20T12:00:00Z',
    actorType: 'USER',
    actorId: 'u-123',
    actorRoles: ['ROLE_VAULT_OWNER'],
    action: 'VAULT_CREATED',
    entityType: 'Vault',
    entityId: 'v-789',
    traceId: 'tr-999',
    stateAfter: { status: 'ACTIVE' },
  };

  const log = validateAdminAuditLog(raw);
  assert.equal(log.id, 'aud-456');
  assert.equal(log.action, 'VAULT_CREATED');
  assert.equal(log.entityType, 'Vault');
  assert.equal(log.entityId, 'v-789');
  assert.equal(log.traceId, 'tr-999');
  assert.deepEqual(log.actorRoles, ['VAULT_OWNER']);
});

test('validateAdminAuditLog rejects record without ID', () => {
  assert.throws(() => validateAdminAuditLog({ action: 'VAULT_CREATED' }), /MISSING_AUDIT_ID/);
});

test('fetchAdminOverview handles 200 success response', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url, options) => {
    assert.ok(url.includes('/api/v1/admin/overview'));
    assert.equal(options.headers['Authorization'], 'Bearer test-token');
    return new Response(
      JSON.stringify({
        totalUsers: 42,
        activeUsers: 40,
        lockedUsers: 2,
        roleDistribution: { VAULT_OWNER: 40, BENEFICIARY: 10 },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const data = await fetchAdminOverview('test-token');
    assert.equal(data.totalUsers, 42);
    assert.equal(data.activeUsers, 40);
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('fetchAdminOverview propagates 401 UNAUTHENTICATED', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 401 });

  try {
    await assert.rejects(() => fetchAdminOverview('expired-token'), (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'UNAUTHENTICATED');
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('fetchAdminOverview handles 404/501 as API_NOT_AVAILABLE without fabricating mock data', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response('', { status: 404 });

  try {
    await assert.rejects(() => fetchAdminOverview('token'), (err) => {
      assert.equal(err.code, 'API_NOT_AVAILABLE');
      assert.equal(err.status, 404);
      return true;
    });
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('fetchAdminUsers passes query params and validates item list', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes('q=alice'));
    assert.ok(url.includes('role=VAULT_OWNER'));
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'u-1',
            email: 'alice@example.com',
            fullName: 'Alice',
            roles: ['ROLE_VAULT_OWNER'],
            status: 'ACTIVE',
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const res = await fetchAdminUsers('token', { query: 'alice', role: 'VAULT_OWNER' });
    assert.equal(res.total, 1);
    assert.equal(res.items.length, 1);
    assert.equal(res.items[0].fullName, 'Alice');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('fetchAdminAuditLogs sends action and date filters', async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    assert.ok(url.includes('action=VAULT_CREATED'));
    assert.ok(url.includes('fromDate=2026-10-01'));
    return new Response(
      JSON.stringify({
        items: [
          {
            id: 'log-1',
            action: 'VAULT_CREATED',
            actorType: 'USER',
            actorId: 'u-1',
            occurredAt: '2026-10-01T10:00:00Z',
          },
        ],
        total: 1,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  try {
    const res = await fetchAdminAuditLogs('token', {
      action: 'VAULT_CREATED',
      fromDate: '2026-10-01',
    });
    assert.equal(res.total, 1);
    assert.equal(res.items[0].action, 'VAULT_CREATED');
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test('lockAdminUser rejects mutation with LOCK_POLICY_PENDING', async () => {
  await assert.rejects(
    () => lockAdminUser('token', { userId: 'u-1', reason: 'Violation' }),
    (err) => {
      assert.equal(err.code, 'LOCK_POLICY_PENDING');
      assert.equal(err.status, 501);
      return true;
    }
  );
});
