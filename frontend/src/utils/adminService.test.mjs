import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeAdminRole, normalizeAdminRoles, validateAdminOverview, validateAdminUser, validateAdminAuditLog,
  fetchAdminOverview, fetchAdminUsers, fetchAdminUserDetail, fetchAdminAuditLogs, fetchAdminAuditDetail, setAdminUserLocked } from './adminService.js';
const id = '11111111-1111-4111-8111-111111111111';
const event = { id, occurredAt: '2026-10-20T12:00:00Z', actor: { kind: 'UNKNOWN', userId: null },
  action: 'LEGACY_EVENT', entityType: 'OTHER', vaultId: null };
test('all audit actions emitted by the current backend remain readable without relaxing the DTO whitelist', () => {
  const source = readFileSync(new URL('../../../backend/src/main/java/com/legacyvault/audit/AuditAction.java', import.meta.url), 'utf8');
  const actions = [...source.matchAll(/^\s+([A-Z][A-Z0-9_]+),?\s*$/gm)].map(match => match[1]);
  assert.ok(actions.includes('HANDOVER_GROUP_CHANGED'));
  for (const action of actions) assert.equal(validateAdminAuditLog({ ...event, action }).action, action);
  assert.throws(() => validateAdminAuditLog({ ...event, action: 'UNREVIEWED_ACTION' }));
});
const overview = { totalAccounts: 100, activeVaults: 40, processingCases: 2,
  roleAssignments: { ROLE_ADMIN: 2, ROLE_VAULT_OWNER: 90, ROLE_BENEFICIARY: 30, ROLE_STAFF_EXECUTOR: 5, ROLE_LEGAL_VERIFIER: 3 },
  startedAt: '2026-10-20T12:00:00Z', completedAt: '2026-10-20T12:00:01Z', consistency: 'READ_COMMITTED_COLLECTION_WINDOW' };
const json = data => new Response(JSON.stringify(data), { headers: { 'Content-Type': 'application/json' } });
test('the first-password audit from Google signup does not invalidate the Admin log', async () => {
  await withFetch(async () => json({ content: [{ ...event, action: 'AUTH_PASSWORD_SET' }], page: 0, size: 20, totalElements: 1, totalPages: 1 }), async () => {
    const result = await fetchAdminAuditLogs('T');
    assert.equal(result.items[0].action, 'AUTH_PASSWORD_SET');
  });
});
async function withFetch(fn, work) { const previous = globalThis.fetch; globalThis.fetch = fn; try { await work(); } finally { globalThis.fetch = previous; } }

test('roles and user validation preserve multi-role and unknown status', () => {
  assert.equal(normalizeAdminRole('ROLE_ADMIN'), 'ADMIN');
  assert.deepEqual(normalizeAdminRoles(['ADMIN','ROLE_ADMIN']), ['ADMIN']);
  assert.deepEqual(normalizeAdminRoles(null), []);
  assert.equal(validateAdminUser({ publicId: id }).status, null);
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
test('user parser rejects malformed lists', async () => {
  await withFetch(async () => json({ bad: true }), () => assert.rejects(() => fetchAdminUsers('T'), /INVALID_USERS_RESPONSE/));
});

const wireUser = { publicId: id, fullName: 'Account', email: 'account@example.test', roles: ['ROLE_ADMIN'], status: 'DELETED', createdAt: '2026-10-20T12:00:00Z' };

test('scoped business roles reject legacy filters and legacy receipts without hiding records after pagination', async () => {
  for (const role of ['VAULT_OWNER', 'BENEFICIARY', 'LEGAL_VERIFIER', 'STAFF_EXECUTOR']) {
    for (const status of ['PENDING', 'DELETED']) {
      await withFetch(() => assert.fail('invalid role/status must not request data'),
        () => assert.rejects(() => fetchAdminUsers('T', {role, status}), /VALIDATION_FAILED/));
      const user = {...wireUser, roles:['ROLE_'+role], status, accountStatus:status};
      await withFetch(async () => json({content:[user],page:0,size:20,totalElements:1,totalPages:1}),
        () => assert.rejects(() => fetchAdminUsers('T', {role}), /INVALID_USERS_RESPONSE/));
      await withFetch(async () => json(user),
        () => assert.rejects(() => fetchAdminUserDetail('T', id, {role}), /INVALID_USER_RECORD/));
      await withFetch(async () => json({content:[{...user,accountStatus:'ACTIVE'}],page:0,size:20,totalElements:1,totalPages:1}),
        () => assert.rejects(() => fetchAdminUsers('T', {role}), /INVALID_USERS_RESPONSE/));
      await withFetch(async () => json(user),
        async () => assert.equal((await fetchAdminUserDetail('T', id)).accountStatus,status));
    }
  }
  await withFetch(() => assert.fail('Owner processing belongs to the vault filter'),
    () => assert.rejects(() => fetchAdminUsers('T', {role:'VAULT_OWNER',status:'IN_PROCESS'}), /VALIDATION_FAILED/));
});

test('processing display state preserves authentication state and detail requests keep the selected role', async () => {
  const actor = { ...wireUser, roles: ['ROLE_LEGAL_VERIFIER'], status: 'ACTIVE', accountStatus: 'IN_PROCESS' };
  const user = validateAdminUser(actor);
  assert.equal(user.status, 'ACTIVE');
  assert.equal(user.accountStatus, 'IN_PROCESS');
  await withFetch(async url => {
    const target = new URL(url, 'http://local');
    assert.ok(target.pathname.endsWith('/' + id));
    assert.equal(target.searchParams.get('role'), 'ROLE_LEGAL_VERIFIER');
    return json(actor);
  }, async () => assert.equal((await fetchAdminUserDetail('T', id, {role:'LEGAL_VERIFIER'})).accountStatus, 'IN_PROCESS'));
});

test('owner vault filters are independent from locked accounts and never fabricate missing vault state', async () => {
  for (const vaultStatus of ['NO_VAULT', 'ACTIVE', 'IN_PROCESS', 'ARCHIVED']) {
    await withFetch(async url => {
      const params = new URL(url, 'http://local').searchParams;
      assert.equal(params.get('role'), 'ROLE_VAULT_OWNER');
      assert.equal(params.get('status'), 'LOCKED');
      assert.equal(params.get('vaultStatus'), vaultStatus);
      return json({ content: [{ ...wireUser, roles: ['ROLE_VAULT_OWNER', 'ROLE_BENEFICIARY'], status: 'LOCKED', vaultStatus }], page: 0, size: 20, totalElements: 1, totalPages: 1 });
    }, async () => {
      const result = await fetchAdminUsers('T', { role: 'VAULT_OWNER', status: 'LOCKED', vaultStatus });
      assert.equal(result.items[0].vaultStatus, vaultStatus);
      assert.equal(result.items[0].status, 'LOCKED');
    });
  }
  for (const vaultStatus of [null, undefined, 'UNKNOWN']) {
    assert.equal(validateAdminUser({ ...wireUser, roles: ['ROLE_VAULT_OWNER'], vaultStatus }).vaultStatus, null);
  }
  assert.equal(validateAdminUser({ ...wireUser, vaultStatus: 'ACTIVE' }).vaultStatus, null);
  await withFetch(() => assert.fail('invalid filters must not send a request'), async () => {
    for (const params of [{ vaultStatus: 'ACTIVE' }, { role: 'ADMIN', vaultStatus: 'NO_VAULT' }, { role: 'VAULT_OWNER', vaultStatus: 'UNKNOWN' }]) {
      await assert.rejects(() => fetchAdminUsers('T', params), /VALIDATION_FAILED/);
    }
  });
});
test('PS-109 user search maps pagination and role, uses shared authentication and strips unexpected fields', async () => {
  await withFetch(async (url, options) => {
    const q = new URL(url, 'http://local').searchParams;
    assert.equal(q.get('page'), '1'); assert.equal(q.get('size'), '10');
    assert.equal(q.get('query'), 'Account'); assert.equal(q.get('role'), 'ROLE_ADMIN'); assert.equal(q.get('status'), 'DELETED');
    assert.equal(q.has('q'), false); assert.equal(q.has('pageSize'), false);
    assert.equal(options.headers.Authorization, 'Bearer T'); assert.equal(options.headers['Accept-Language'], 'en');
    return json({ content: [{ ...wireUser, passwordHash: 'secret' }], page: 1, size: 10, totalElements: 11, totalPages: 2 });
  }, async () => {
    const result = await fetchAdminUsers('T', { query: ' Account ', role: 'ADMIN', status: 'DELETED', page: 2, pageSize: 10, lang: 'en' });
    assert.equal(result.items[0].id, id); assert.equal(result.items[0].passwordHash, undefined);
    assert.equal(result.items[0].status, 'DELETED'); assert.equal(result.page, 2);
  });
});

test('PS-109 detail is fetched by public UUID and refuses a mismatched receipt', async () => {
  await withFetch(async url => { assert.ok(url.endsWith('/' + id)); return json(wireUser); }, async () => {
    assert.equal((await fetchAdminUserDetail('T', id)).id, id);
  });
  await withFetch(async () => json({ ...wireUser, publicId: '22222222-2222-4222-8222-222222222222' }),
    () => assert.rejects(() => fetchAdminUserDetail('T', id), /INVALID_USER_RECORD/));
});

test('PS-109 rejects malformed paging, duplicate records and invalid request parameters', async () => {
  for (const raw of [{ items: [] }, { content: [] }, { content: [wireUser, wireUser], page: 0, size: 20, totalElements: 2, totalPages: 1 }]) {
    await withFetch(async () => json(raw), () => assert.rejects(() => fetchAdminUsers('T'), /INVALID_USERS_RESPONSE/));
  }
  await withFetch(() => { throw Error('unexpected network'); }, async () => {
    for (const params of [{ page: 0 }, { pageSize: 101 }, { status: 'DISABLED' }, { role: 'GUARDIAN' }, { query: 'x'.repeat(101) }])
      await assert.rejects(() => fetchAdminUsers('T', params), /VALIDATION_FAILED/);
    await assert.rejects(() => fetchAdminAuditLogs('T', { actorId: 'bad-id' }), /VALIDATION_FAILED/);
  });
});

test('audit actor filter is a public user UUID; a vault ID never becomes the entity ID', async () => {
  const row = { ...event, entityType: 'ASSET', vaultId: id };
  await withFetch(async url => {
    assert.equal(new URL(url, 'http://local').searchParams.get('actorId'), id);
    return json({ content: [row], page: 0, size: 20, totalElements: 1, totalPages: 1 });
  }, async () => {
    const result = await fetchAdminAuditLogs('T', { actorId: id });
    assert.equal(result.items[0].vaultId, id); assert.equal(result.items[0].entityId, undefined);
  });
});

test('PS-103 attachment audit actions do not invalidate the Admin log after an evidence read', () => {
  for (const action of ['INTAKE_ATTACHMENT_UPLOADED', 'EVIDENCE_FILE_READ'])
    assert.equal(validateAdminAuditLog({ ...event, action }).action, action);
  assert.throws(() => validateAdminAuditLog({ ...event, action: 'UNREVIEWED_ACTION' }));
});

test('PS-79 profile updates remain readable in the Admin audit log', () => {
  assert.equal(validateAdminAuditLog({ ...event, action: 'AUTH_PROFILE_UPDATED' }).action, 'AUTH_PROFILE_UPDATED');
});

test('setAdminUserLocked posts lock with an optional trimmed reason and unlock without a body', async () => {
  const record = { publicId: id, fullName: 'Account', email: 'account@example.test', roles: ['ROLE_STAFF_EXECUTOR'], status: 'LOCKED', createdAt: '2026-10-20T12:00:00Z' };
  const calls = [];
  await withFetch(async (url, options) => { calls.push({ url, options }); return json(record); }, async () => {
    const locked = await setAdminUserLocked('T', id, true, { reason: '  Policy review  ' });
    assert.equal(locked.status, 'LOCKED');
    assert.match(calls[0].url, new RegExp(`/admin/users/${id}/lock$`));
    assert.equal(calls[0].options.method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].options.body), { reason: 'Policy review' });
    await setAdminUserLocked('T', id, true, { reason: '   ' });
    assert.equal(calls[1].options.body, undefined);
    await setAdminUserLocked('T', id, false, { reason: 'ignored' });
    assert.match(calls[2].url, new RegExp(`/admin/users/${id}/unlock$`));
    assert.equal(calls[2].options.body, undefined);
    await assert.rejects(() => setAdminUserLocked('T', 'not-a-uuid', true), /VALIDATION_FAILED/);
    await assert.rejects(() => setAdminUserLocked('T', id, true, { reason: 'x'.repeat(256) }), /VALIDATION_FAILED/);
    await assert.rejects(() => setAdminUserLocked('T', id, 'yes'), /VALIDATION_FAILED/);
  });
  await withFetch(async () => json({ ...record, publicId: '99999999-9999-4999-8999-999999999999' }),
    () => assert.rejects(() => setAdminUserLocked('T', id, true), /INVALID_USER_RECORD/));
});

test('audit events keep the actor role, owner, case and assigned Staff, and reject malformed context', () => {
  const full = { ...event, actor: { kind: 'USER', userId: id, role: 'LEGAL_VERIFIER' }, ownerId: id, caseId: id,
    caseNumber: 'HS-2026-000001', staffId: id };
  const data = validateAdminAuditLog(full);
  assert.deepEqual([data.actorRole, data.ownerId, data.caseId, data.caseNumber, data.staffId], ['LEGAL_VERIFIER', id, id, 'HS-2026-000001', id]);
  assert.equal(validateAdminAuditLog(event).caseNumber, null); // older backend without the new fields
  assert.throws(() => validateAdminAuditLog({ ...full, actor: { ...full.actor, role: 'ROOT' } }));
  assert.throws(() => validateAdminAuditLog({ ...full, caseNumber: 'HS-1' }));
  assert.throws(() => validateAdminAuditLog({ ...full, staffId: 'x' }));
});

test('every audit action has a Vietnamese and an English label with a capital first letter', async () => {
  const { adminActionLabel } = await import('../pages/admin/adminPresentation.js');
  const source = readFileSync(new URL('../../../backend/src/main/java/com/legacyvault/audit/AuditAction.java', import.meta.url), 'utf8');
  const codes = [...source.matchAll(/^\s+([A-Z][A-Z0-9_]+),?\s*$/gm)].map(match => match[1]);
  for (const code of [...codes, 'LEGACY_EVENT']) {
    for (const lang of ['vi', 'en']) {
      const label = adminActionLabel(code, lang);
      assert.notEqual(label, code, `${code} has no ${lang} label`);
      assert.equal(label[0], label[0].toLocaleUpperCase(lang), `${code}: first letter must be a capital`);
    }
  }
});

test('audit events keep the actor name only when it is a short string', () => {
  const named = { ...event, actor: { kind: 'USER', userId: id, role: 'STAFF_EXECUTOR', name: 'Nguyen Van A' } };
  assert.equal(validateAdminAuditLog(named).actorName, 'Nguyen Van A');
  assert.equal(validateAdminAuditLog(event).actorName, null);
  assert.throws(() => validateAdminAuditLog({ ...named, actor: { ...named.actor, name: 42 } }));
});

test('the actor filter sends a role as actorRole and SYSTEM or UNKNOWN as actorKind', async () => {
  const urls = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url) => { urls.push(String(url)); return new Response(JSON.stringify({ content: [], page: 0, size: 20, totalElements: 0, totalPages: 0 }), { status: 200, headers: { 'Content-Type': 'application/json' } }); };
  try {
    await fetchAdminAuditLogs('T', { actorType: 'STAFF_EXECUTOR' });
    await fetchAdminAuditLogs('T', { actorType: 'SYSTEM' });
  } finally { globalThis.fetch = original; }
  assert.match(urls[0], /actorRole=STAFF_EXECUTOR/);
  assert.doesNotMatch(urls[0], /actorKind/);
  assert.match(urls[1], /actorKind=SYSTEM/);
});
