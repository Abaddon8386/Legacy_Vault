import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../api/http.js';
import { createSession, isSessionActive } from './session.js';
import { registerUser } from './registrationService.js';
import { authenticateUser, isValidLoginResponse } from './loginService.js';
import { validateRegistration } from './registrationValidation.js';
import { liveVaultAdapter, validateVaultInput, fetchVault } from './vaultService.js';
import { liveDmsAdapter, getDmsMessage, fetchDmsConfig } from './dmsService.js';

const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const date = '2026-10-13T10:00:00Z';
const user = { id, fullName: 'Demo', email: 'demo@example.test', roles: ['VAULT_OWNER'] };
const login = { accessToken: 'TEST-ONLY', tokenType: 'Bearer', expiresInSeconds: 3600, user };
const vault = { id, name: 'A', status: 'ACTIVE', createdAt: date, updatedAt: date };
const dms = { ownerId: id, status: 'MONITORING', checkIntervalDays: 30, gracePeriodDays: 1, nextCheckAt: date };
const page = content => ({ content, page: 0, size: 20, totalElements: content.length, totalPages: content.length ? 1 : 0 });
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('HTTP forwards Bearer, locale and AbortSignal; errors preserve code/trace without raw SQL', async () => {
  const controller = new AbortController();
  await assert.rejects(request('/vaults', { accessToken: login.accessToken, lang: 'en', signal: controller.signal,
    fetchFn: async (url, options) => {
      assert.equal(url, '/api/v1/vaults'); assert.equal(options.headers.Authorization, 'Bearer TEST-ONLY');
      assert.equal(options.headers['Accept-Language'], 'en'); assert.equal(options.signal, controller.signal);
      assert.equal(options.credentials, 'omit');
      return json({ code: 'ACCESS_DENIED', message: 'SQL secret must not be shown', traceId: 'trace-test' }, 403);
    } }), error => error.status === 403 && error.code === 'ACCESS_DENIED' && error.traceId === 'trace-test' && !error.message.includes('SQL'));
});
test('HTTP rejects HTML/malformed JSON success and preserves request abort', async () => {
  for (const response of [new Response('<html>fallback</html>'), new Response('{', { headers: { 'Content-Type': 'application/json' } })]) {
    await assert.rejects(request('/vaults', { fetchFn: async () => response }), error => error.code === 'INVALID_RESPONSE');
  }
  await assert.rejects(request('/vaults', { fetchFn: async () => { throw new DOMException('Aborted', 'AbortError'); } }), { name: 'AbortError' });
});
test('Login hands token to caller and whitelists user metadata', async () => {
  const result = await authenticateUser({ email: user.email, password: 'synthetic' }, { fetchFn: async () => json({ ...login, extraSecret: 'DROP', user: { ...user, password: 'DROP' } }) });
  assert.equal(result.accessToken, login.accessToken); assert.equal(result.user.password, undefined); assert.equal(result.extraSecret, undefined);
});
test('Session rejects malformed role/user/type/expiry and expires without browser storage', () => {
  for (const bad of [{ ...login, tokenType: 'Basic' }, { ...login, expiresInSeconds: -1 },
    { ...login, user: {} }, { ...login, user: { ...user, roles: ['INVENTED'] } }]) assert.equal(isValidLoginResponse(bad), false);
  const session = createSession(login, 1000);
  assert.equal(isSessionActive(session, 3599999), true); assert.equal(isSessionActive(session, 3601000), false);
  assert.equal(isSessionActive(null), false);
});
test('Registration accepts PS-74 name/phone/password boundaries and rejects maximum violations', () => {
  const values = { fullName: 'A', email: user.email, phone: '+12025550123', password: 'x'.repeat(72), confirmPassword: 'x'.repeat(72), agreeTerms: true };
  assert.deepEqual(validateRegistration(values), {});
  assert.ok(validateRegistration({ ...values, password: 'x'.repeat(73) }).password);
  assert.ok(validateRegistration({ ...values, fullName: 'x'.repeat(151) }).fullName);
  assert.ok(validateRegistration({ ...values, email: 'x'.repeat(250) + '@test.com' }).email);
  assert.deepEqual(validateVaultInput({ name: 'A' }), {});
});
test('Register sends only contract fields and rejects a non-201 or malformed receipt', async () => {
  const values = { fullName: ' Demo ', email: 'DEMO@example.test ', password: '  KEEP  ', phone: '', role: 'ADMIN', confirmPassword: '  KEEP  ' };
  const result = await registerUser(values, { fetchFn: async (url, options) => {
    assert.equal(url, '/api/v1/auth/register'); assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { fullName: 'Demo', email: user.email, password: '  KEEP  ' });
    return json({ ...user, status: 'ACTIVE', createdAt: date }, 201);
  } });
  assert.equal(result.id, id);
  for (const response of [json({}, 201), json({ ...user, status: 'ACTIVE', createdAt: date }, 200)]) {
    await assert.rejects(registerUser(values, { fetchFn: async () => response }));
  }
});
test('Vault live read uses paginated contract and Bearer; empty page means no Vault', async () => {
  const result = await liveVaultAdapter.fetch({ accessToken: login.accessToken, fetchFn: async (url, options) => {
    assert.match(url, /\/vaults\?page=0&size=20&sort=createdAt,desc$/);
    assert.equal(options.headers.Authorization, 'Bearer TEST-ONLY'); return json(page([vault]));
  } });
  assert.equal(result.id, id); assert.equal(result.status, 'ACTIVE');
  assert.equal(await liveVaultAdapter.fetch({ fetchFn: async () => json(page([])) }), null);
});
test('Vault rejects missing ID/timestamps/status and unpaged list; 404 is an error, not fabricated empty data', async () => {
  for (const body of [{}, vault, page([{ ...vault, id: null }]), page([{ ...vault, createdAt: null }]), page([{ ...vault, status: null }])]) {
    await assert.rejects(liveVaultAdapter.fetch({ fetchFn: async () => json(body) }), error => error.code === 'INVALID_RESPONSE');
  }
  await assert.rejects(liveVaultAdapter.fetch({ fetchFn: async () => json({ code: 'RESOURCE_NOT_FOUND' }, 404) }), error => error.status === 404);
});
test('Vault create sends name/description only and requires ACTIVE 201 receipt', async () => {
  const result = await liveVaultAdapter.create(' A ', '', { accessToken: login.accessToken, fetchFn: async (url, options) => {
    assert.equal(url, '/api/v1/vaults'); assert.equal(options.method, 'POST');
    assert.deepEqual(JSON.parse(options.body), { name: 'A', description: '' }); return json(vault, 201);
  } }); assert.equal(result.id, id);
  await assert.rejects(liveVaultAdapter.create('A', '', { fetchFn: async () => json({ ...vault, status: 'TRIGGERED' }, 201) }));
  for (const [status, code] of [[403, 'ACCESS_DENIED'], [409, 'VAULT_ALREADY_EXISTS']]) {
    await assert.rejects(liveVaultAdapter.create('A', '', { fetchFn: async () => json({ code }, status) }), error => error.status === status && error.code === code);
  }
});
test('DMS calls Owner paths, Bearer, no owner/vault body; check-in has no body', async () => {
  const calls = [];
  const options = { ownerId: id, accessToken: login.accessToken, fetchFn: async (url, requestOptions) => {
    calls.push([url, requestOptions]); return json(dms);
  } };
  await liveDmsAdapter.fetch(options); await liveDmsAdapter.save(30, options); await liveDmsAdapter.checkIn(options);
  assert.deepEqual(calls.map(([url, opts]) => [url, opts.method]), [['/api/v1/dms', 'GET'], ['/api/v1/dms', 'PUT'], ['/api/v1/dms/check-in', 'POST']]);
  assert.deepEqual(JSON.parse(calls[1][1].body), { checkIntervalDays: 30 }); assert.equal(calls[2][1].body, undefined);
  for (const [, opts] of calls) assert.equal(opts.headers.Authorization, 'Bearer TEST-ONLY');
});
test('DMS rejects wrong Owner, missing fields and death/unlock states; JSON 404 only means unconfigured', async () => {
  for (const body of [{}, { ...dms, ownerId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' }, { ...dms, status: 'DEATH_CONFIRMED' }, { ...dms, nextCheckAt: null }]) {
    await assert.rejects(liveDmsAdapter.fetch({ ownerId: id, fetchFn: async () => json(body) }), error => error.code === 'INVALID_RESPONSE');
  }
  assert.equal(await liveDmsAdapter.fetch({ fetchFn: async () => json({ code: 'RESOURCE_NOT_FOUND' }, 404) }), null);
  await assert.rejects(liveDmsAdapter.fetch({ fetchFn: async () => new Response('Not found', { status: 404 }) }), error => error.code === 'BACKEND_NOT_READY');
  assert.notEqual(getDmsMessage('CHECKED_IN', 'vi'), getDmsMessage('CHECKED_IN', 'en'));
});
test('Production and authenticated preview flags cannot turn Vault/DMS API failures into simulated success', async () => {
  for (const options of [{ testEnv: { PROD: true }, isDevPreview: true, isTest: true },
    { accessToken: login.accessToken, isDevPreview: true, isTest: true }]) {
    let called = 0;
    const fetchFn = async () => { called++; return json({ code: 'ACCESS_DENIED' }, 403); };
    await assert.rejects(fetchVault({ ...options, scenario: 'exists', fetchFn }), error => error.status === 403);
    await assert.rejects(fetchDmsConfig({ ...options, scenario: 'monitoring', fetchFn }), error => error.status === 403);
    assert.equal(called, 2);
  }
});
test('Vault validates name 1–150 and description up to 1000 without adding a minimum of two', () => {
  assert.deepEqual(validateVaultInput({ name: 'A', description: 'x'.repeat(1000) }), {});
  assert.deepEqual(validateVaultInput({ name: 'x'.repeat(150) }), {});
  assert.ok(validateVaultInput({ name: 'x'.repeat(151) }).vault_name);
  assert.ok(validateVaultInput({ name: 'A', description: 'x'.repeat(1001) }).description);
});

// Regression: PS-9/PS-10 return Spring Security authority names.
test('Register accepts the real BE ROLE_VAULT_OWNER receipt', async () => {
  const result = await registerUser({ fullName: 'Demo', email: user.email, password: 'synthetic' }, {
    fetchFn: async () => json({ ...user, roles: ['ROLE_VAULT_OWNER'], status: 'ACTIVE', createdAt: date }, 201),
  });
  assert.deepEqual(result.roles, ['VAULT_OWNER']);
});

test('Login normalizes known authorities for existing FE guards and preserves response data', async () => {
  const roles = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];
  const response = { ...login, user: { ...user, roles: roles.map(role => `ROLE_${role}`) } };
  const result = await authenticateUser({}, { fetchFn: async () => json(response) });
  assert.deepEqual(result.user.roles, roles);
  assert.deepEqual(createSession(result).user.roles, roles);
  assert.deepEqual(response.user.roles, roles.map(role => `ROLE_${role}`));
  const mixed = createSession({ ...login, user: { ...user, roles: ['VAULT_OWNER', 'ROLE_VAULT_OWNER'] } });
  assert.deepEqual(mixed.user.roles, ['VAULT_OWNER']);
});

test('Authority compatibility rejects unknown and malformed roles; unlinked accounts may have no roles', async () => {
  assert.deepEqual(createSession({ ...login, user: { ...user, roles: [] } }).user.roles, []);
  for (const roles of [['ROLE_INVENTED'], ['ROLE_ROLE_ADMIN'], ['role_ADMIN'], [null], ['ROLE_VAULT_OWNER', 'UNKNOWN']]) {
    await assert.rejects(registerUser({ fullName: 'Demo', email: user.email, password: 'synthetic' }, {
      fetchFn: async () => json({ ...user, roles, status: 'ACTIVE', createdAt: date }, 201),
    }), error => error.code === 'INVALID_AUTH_RESPONSE');
    assert.equal(isValidLoginResponse({ ...login, user: { ...user, roles } }), false);
  }
});
