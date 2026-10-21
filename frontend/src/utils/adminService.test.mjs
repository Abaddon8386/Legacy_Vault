import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeAdminRole, normalizeAdminRoles, validateAdminOverview, validateAdminUser, validateAdminAuditLog,
  fetchAdminOverview, fetchAdminUsers, fetchAdminAuditLogs, fetchAdminAuditDetail, lockAdminUser } from './adminService.js';
const id = '11111111-1111-4111-8111-111111111111';
const event = { id, occurredAt: '2026-10-20T12:00:00Z', actor: { kind: 'UNKNOWN', userId: null },
  action: 'LEGACY_EVENT', entityType: 'OTHER', vaultId: null };
const overview = { totalAccounts: 100, activeVaults: 40, processingCases: 2,
  roleAssignments: { ROLE_ADMIN: 2, ROLE_VAULT_OWNER: 90, ROLE_BENEFICIARY: 30, ROLE_STAFF_EXECUTOR: 5, ROLE_LEGAL_VERIFIER: 3 },
  startedAt: '2026-10-20T12:00:00Z', completedAt: '2026-10-20T12:00:01Z', consistency: 'READ_COMMITTED_COLLECTION_WINDOW' };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
async function withFetch(fn, work) { const previous = globalThis.fetch; globalThis.fetch = fn; try { await work(); } finally { globalThis.fetch = previous; } }

test('roles and user validation preserve multi-role and unknown status', () => {
  assert.equal(normalizeAdminRole('ROLE_ADMIN'), 'ADMIN');
  assert.deepEqual(normalizeAdminRoles(['ADMIN','ROLE_ADMIN']), ['ADMIN']);
  assert.deepEqual(normalizeAdminRoles(null), []);
  assert.equal(validateAdminUser({ id }).status, null);
  assert.throws(() => validateAdminUser({}), /MISSING_USER_ID/);
});
test('PS-107 counts retain their real meaning and role totals may exceed accounts', () => {
  const data = validateAdminOverview(overview);
  assert.equal(data.totalAccounts, 100); assert.equal(data.activeVaults, 40); assert.equal(data.processingCases, 2);
  assert.equal(data.totalRolesAssigned, 130); assert.equal(data.completedAt, overview.completedAt);
  assert.equal(data.activeUsers, undefined);
});
test('missing, coercible or invalid overview counts stay unknown; legitimate zero stays zero', () => {
  for (const value of [null, undefined, '', '0', false, -1, 1.5, [], Number.MAX_SAFE_INTEGER+1]) {
    const data = validateAdminOverview({ totalAccounts: value }); assert.equal(data.totalAccounts, null);
  }
  assert.equal(validateAdminOverview({ totalAccounts: 0 }).totalAccounts, 0);
  assert.equal(validateAdminOverview({ roleAssignments: { ROLE_ADMIN: 1 } }).totalRolesAssigned, null);
  assert.throws(() => validateAdminOverview(null));
});
test('overview uses shared Bearer/locale/base adapter and exact PS-107 DTO', async () => {
  await withFetch(async (url, options) => {
    assert.match(url, /\/api\/v1\/admin\/overview$/); assert.equal(options.headers.Authorization, 'Bearer T');
    assert.equal(options.headers['Accept-Language'], 'en'); return json(overview);
  }, async () => assert.equal((await fetchAdminOverview('T', { lang: 'en' })).totalAccounts, 100));
});
test('audit whitelist preserves UNKNOWN separately from DELETED_USER and removes all extra data', () => {
  const data = validateAdminAuditLog({ ...event, ipAddress: 'sensitive', actorName: 'sensitive', stateBefore: 'sensitive', context: { nested: { password: 'sensitive' } } });
  assert.equal(data.actorType, 'UNKNOWN'); assert.equal(JSON.stringify(data).includes('sensitive'), false);
  assert.equal(validateAdminAuditLog({ ...event, actor: { kind: 'DELETED_USER', userId: id } }).actorType, 'DELETED_USER');
  assert.throws(() => validateAdminAuditLog({ ...event, actor: {} }));
  assert.throws(() => validateAdminAuditLog({ ...event, id: 'internal-db-key' }));
});
test('audit maps page and UTC inclusive date inputs into PS-108 half-open bounds', async () => {
  await withFetch(async (url, options) => {
    const query = new URL(url, 'http://local').searchParams;
    assert.equal(query.get('page'), '1'); assert.equal(query.get('size'), '10');
    assert.equal(query.get('actorKind'), 'UNKNOWN'); assert.equal(query.get('from'), '2026-10-01T00:00:00.000Z');
    assert.equal(query.get('to'), '2026-10-03T00:00:00.000Z'); assert.equal(query.has('pageSize'), false);
    assert.equal(options.headers['Accept-Language'], 'en');
    return json({ content: [event], page: 1, size: 10, totalElements: 11, totalPages: 2 });
  }, async () => { const data = await fetchAdminAuditLogs('T', { page: 2, pageSize: 10, actorType: 'UNKNOWN', fromDate: '2026-10-01', toDate: '2026-10-02', lang: 'en' });
    assert.equal(data.page, 2); assert.equal(data.total, 11); assert.equal(data.items[0].id, id); });
});
test('malformed pages, metadata and duplicate event IDs fail instead of empty success', async () => {
  for (const raw of [{ items: [] }, { content: [] }, { content: [], page: 0, size: 20, totalElements: null, totalPages: 0 },
    { content: [event,event], page: 0, size: 20, totalElements: 2, totalPages: 1 }]) {
    await withFetch(async () => json(raw), () => assert.rejects(() => fetchAdminAuditLogs('T'), /INVALID_AUDIT_LOGS_RESPONSE/));
  }
});
test('invalid date and pagination fail before network', async () => {
  await withFetch(() => { throw Error('unexpected network'); }, async () => {
    for (const params of [{ fromDate: '2026-02-30' }, { fromDate: '2026-10-03', toDate: '2026-10-01' }, { page: 0 }, { pageSize: 101 }])
      await assert.rejects(() => fetchAdminAuditLogs('T', params), /VALIDATION_FAILED/);
  });
});
test('audit detail uses public ID, matches event and whitelists optional trace', async () => {
  await withFetch(async url => { assert.ok(url.endsWith('/'+id)); return json({ event, traceId: null, secret: 'sensitive' }); }, async () => {
    const data = await fetchAdminAuditDetail('T', id); assert.equal(data.traceId, null); assert.equal(data.secret, undefined);
  });
  await withFetch(async () => json({ event: { ...event, id: '22222222-2222-4222-8222-222222222222' }, traceId: null }),
    () => assert.rejects(() => fetchAdminAuditDetail('T', id)));
});
test('read adapters preserve authorization, unavailable and abort failures', async () => {
  for (const status of [401,403,404,500]) await withFetch(async () => new Response('{}', { status, headers: { 'Content-Type': 'application/json' } }), async () => {
    await assert.rejects(() => fetchAdminOverview('T'), error => error.status === status);
  });
  await withFetch(async () => { throw new DOMException('cancelled','AbortError'); }, () => assert.rejects(() => fetchAdminAuditLogs('T'), error => error.name === 'AbortError'));
});
test('provisional user parser rejects malformed lists and user writes remain disabled', async () => {
  await withFetch(async () => json({ bad: true }), () => assert.rejects(() => fetchAdminUsers('T'), /INVALID_USERS_RESPONSE/));
  await assert.rejects(() => lockAdminUser('T', { userId: id }), /LOCK_POLICY_PENDING/);
});
