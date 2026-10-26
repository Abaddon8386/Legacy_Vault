import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SUBSCRIPTION_PLANS,
  SUBSCRIPTION_SCENARIOS,
  subscriptionMessages,
  formatStorageBytes,
  isSimulationPermitted,
  readSubscription,
  mockSubscriptionAdapter,
  liveSubscriptionAdapter,
  fetchSubscription,
  subscriptionScenario,
  subscriptionStatusLabel,
  subscriptionErrorMessage,
} from './subscriptionService.js';

test('Subscription Constants - 3 Plans with Clean User-Facing Descriptions', () => {
  assert.equal(SUBSCRIPTION_PLANS.length, 3);
  const codes = SUBSCRIPTION_PLANS.map((p) => p.code);
  assert.deepEqual(codes, ['BASIC', 'STANDARD', 'EXTENDED']);

  // Every single plan must enforce maxVaultsLifetime === 1 and maxFileSizeMB === 10
  for (const plan of SUBSCRIPTION_PLANS) {
    assert.equal(plan.maxVaultsLifetime, 1, `Plan ${plan.code} must strictly allow 1 vault lifetime`);
    assert.equal(plan.maxFileSizeMB, 10, `Plan ${plan.code} must enforce 10MB per file`);
    // No unapproved popular badge on any plan
    assert.equal(plan.isPopular, false, `Plan ${plan.code} must not have isPopular set`);
    // No internal D-PKG-01 code in user-facing feature bullets
    for (const feat of [...plan.featuresVi, ...plan.featuresEn]) {
      assert.ok(!feat.includes('D-PKG-01'), `Feature bullet must not expose internal code D-PKG-01: ${feat}`);
    }
  }

  // Basic plan checks
  const basic = SUBSCRIPTION_PLANS.find((p) => p.code === 'BASIC');
  assert.equal(basic.maxAssets, 5);
  assert.equal(basic.maxStorageBytes, 100 * 1024 * 1024);
  assert.equal(basic.purchasePriceVND, 0);

  // Standard plan checks
  const standard = SUBSCRIPTION_PLANS.find((p) => p.code === 'STANDARD');
  assert.equal(standard.maxAssets, 50);
  assert.equal(standard.maxStorageBytes, 1024 * 1024 * 1024);
  assert.equal(standard.purchasePriceVND, 499000);

  // Extended plan checks
  const extended = SUBSCRIPTION_PLANS.find((p) => p.code === 'EXTENDED');
  assert.equal(extended.maxAssets, 200);
  assert.equal(extended.maxStorageBytes, 5 * 1024 * 1024 * 1024);
  assert.equal(extended.purchasePriceVND, 999000);
});

test('Subscription Scenarios - All required testing states are defined', () => {
  assert.ok(SUBSCRIPTION_SCENARIOS.length >= 8);
  const scenarioIds = SUBSCRIPTION_SCENARIOS.map((s) => s.id);
  assert.ok(scenarioIds.includes('active_basic'));
  assert.ok(scenarioIds.includes('active_standard'));
  assert.ok(scenarioIds.includes('active_extended'));
  assert.ok(scenarioIds.includes('near_quota'));
  assert.ok(scenarioIds.includes('empty'));
  assert.ok(scenarioIds.includes('loading'));
  assert.ok(scenarioIds.includes('unauthorized'));
  assert.ok(scenarioIds.includes('forbidden'));
  assert.ok(scenarioIds.includes('network_error'));
  assert.ok(scenarioIds.includes('backend_not_ready'));
});

test('formatStorageBytes - correctly formats bytes into MB and GB', () => {
  assert.equal(formatStorageBytes(0), '0 MB');
  assert.equal(formatStorageBytes(-100), '0 MB');
  assert.equal(formatStorageBytes(1024 * 1024), '1 MB');
  assert.equal(formatStorageBytes(24 * 1024 * 1024), '24 MB');
  assert.equal(formatStorageBytes(1024 * 1024 * 1024), '1 GB');
  assert.equal(formatStorageBytes(1.5 * 1024 * 1024 * 1024), '1.5 GB');
  assert.equal(formatStorageBytes(5 * 1024 * 1024 * 1024), '5 GB');
});

test('readSubscription - validates and normalizes plan payload with single vault rule', () => {
  const result = readSubscription({
    subscriptionId: 'sub-test-1',
    maxAssets: 50, maxStorageBytes: 1024 ** 3, maxVaultsLifetime: 1, expiresAt: null,
    planCode: 'STANDARD',
    status: 'ACTIVE',
    assetsUsed: 12,
    storageUsedBytes: 250 * 1024 * 1024,
    vaultsCreatedLifetime: 1,
  });

  assert.equal(result.planCode, 'STANDARD');
  assert.equal(result.maxAssets, 50);
  assert.equal(result.assetsUsed, 12);
  assert.equal(result.maxVaultsLifetime, 1);
  assert.equal(result.vaultsCreatedLifetime, 1);
  assert.equal(result.isTrialGrant, false);
});

test('Simulation Guard - Production environment strictly forbids simulation unconditionally', () => {
  assert.equal(isSimulationPermitted({ isDevPreview: true, testEnv: { PROD: true } }), false);
  assert.equal(isSimulationPermitted({ isTest: true, testEnv: { PROD: true } }), false);
  assert.equal(isSimulationPermitted({ isDevPreview: true, accessToken: 'real-token-123' }), false);
});

test('Simulation Guard - isDevPreview and test runner allow simulation in non-prod', () => {
  assert.equal(isSimulationPermitted({ isDevPreview: true }), true);
  assert.equal(isSimulationPermitted({ isTest: true }), true);
  assert.equal(isSimulationPermitted({ testEnv: true }), true);
  assert.equal(isSimulationPermitted({}), false);
});

test('Mock Adapter - fetch scenarios return expected simulation models', () => {
  // basic
  const basic = mockSubscriptionAdapter.fetch('active_basic', 'vi');
  assert.equal(basic.planCode, 'BASIC');
  assert.equal(basic.isSimulation, true);
  assert.equal(basic.maxVaultsLifetime, 1);

  // standard
  const standard = mockSubscriptionAdapter.fetch('active_standard', 'vi');
  assert.equal(standard.planCode, 'STANDARD');
  assert.equal(standard.isTrialGrant, true);
  assert.equal(standard.assetsUsed, 18);
  assert.equal(standard.grantedBy, null);

  // extended
  const extended = mockSubscriptionAdapter.fetch('active_extended', 'en');
  assert.equal(extended.planCode, 'EXTENDED');
  assert.equal(extended.isTrialGrant, true);
  assert.equal(extended.maxAssets, 200);
  assert.equal(extended.grantedBy, null);

  // near_quota
  const nearQuota = mockSubscriptionAdapter.fetch('near_quota', 'vi');
  assert.equal(nearQuota.assetsUsed, 5);
  assert.equal(nearQuota.storageUsedBytes, 98 * 1024 * 1024);

  // empty
  const empty = mockSubscriptionAdapter.fetch('empty', 'vi');
  assert.equal(empty, null);

  // error scenarios
  assert.throws(() => mockSubscriptionAdapter.fetch('unauthorized', 'vi'), (err) => err.status === 401);
  assert.throws(() => mockSubscriptionAdapter.fetch('forbidden', 'vi'), (err) => err.status === 403);
  assert.throws(() => mockSubscriptionAdapter.fetch('network_error', 'vi'), (err) => err.status === 0);
  assert.throws(() => mockSubscriptionAdapter.fetch('backend_not_ready', 'vi'), (err) => err.status === 404);
});

test('Live Adapter - handles unready backend without fabricating simulated success', async () => {
  const fetchMock = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'text/html' },
    text: async () => '<html>Not Found</html>',
  });

  await assert.rejects(
    async () => {
      await liveSubscriptionAdapter.fetch({ fetchFn: fetchMock });
    },
    (err) => err.code === 'BACKEND_NOT_READY' || err.status === 404
  );
});

test('fetchSubscription - dev preview routes to mock, clean mode routes to live', async () => {
  // Preview mode
  const previewData = await fetchSubscription({ isDevPreview: true, scenario: 'active_standard' });
  assert.equal(previewData.planCode, 'STANDARD');
  assert.equal(previewData.isSimulation, true);

  // Clean mode with mock fetch function
  const fetchMock = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      subscriptionId: 'sub-live-999',
      maxAssets: 200, maxStorageBytes: 5 * 1024 ** 3, maxVaultsLifetime: 1, expiresAt: null,
      planCode: 'EXTENDED',
      status: 'ACTIVE',
      assetsUsed: 42,
      storageUsedBytes: 500 * 1024 * 1024,
      vaultsCreatedLifetime: 1,
    }),
  });

  const liveData = await fetchSubscription({
    isDevPreview: false,
    fetchFn: fetchMock,
  });

  assert.equal(liveData.planCode, 'EXTENDED');
  assert.equal(liveData.assetsUsed, 42);
  assert.equal(liveData.isSimulation, false);
});

test('fetchSubscription - live mode failure strictly propagates error and never secretly falls back to mock', async () => {
  const fetchMockFail = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => ({ message: 'Server Internal Error' }),
  });

  await assert.rejects(
    async () => {
      await fetchSubscription({
        isDevPreview: false,
        fetchFn: fetchMockFail,
      });
    },
    (err) => err.status === 500
  );
});

function validSubscription(overrides = {}) {
  return { planCode: 'BASIC', status: 'ACTIVE', expiresAt: null,
    assetsUsed: 0, storageUsedBytes: 0, vaultsCreatedLifetime: 0,
    maxAssets: 5, maxStorageBytes: 100 * 1024 ** 2, maxVaultsLifetime: 1, ...overrides };
}

test('Subscription receipt rejects malformed or incomplete success instead of inventing Basic/zero usage', () => {
  for (const raw of [null, [], {}, '', { ...validSubscription(), planCode: 'UNKNOWN' }]) {
    assert.throws(() => readSubscription(raw), { code: 'INVALID_RESPONSE' });
  }
  for (const key of ['planCode', 'status', 'expiresAt', 'assetsUsed', 'storageUsedBytes',
    'vaultsCreatedLifetime', 'maxAssets', 'maxStorageBytes', 'maxVaultsLifetime']) {
    const raw = validSubscription(); delete raw[key];
    assert.throws(() => readSubscription(raw), { code: 'INVALID_RESPONSE' }, key);
  }
});

test('Subscription receipt rejects unsafe counters, invalid limits, dates and lifetime vault violations', () => {
  for (const patch of [
    { assetsUsed: -1 }, { assetsUsed: 1.2 }, { storageUsedBytes: '100' },
    { storageUsedBytes: Number.MAX_SAFE_INTEGER + 1 }, { maxAssets: 0 },
    { maxStorageBytes: -1 }, { vaultsCreatedLifetime: 2 }, { maxVaultsLifetime: 2 },
    { expiresAt: 'not-a-date' }, { isTrialGrant: 'false' }, { status: '' },
  ]) assert.throws(() => readSubscription(validSubscription(patch)), { code: 'INVALID_RESPONSE' });
});

test('Subscription uses server quotas and preserves over-limit usage, no-vault and non-active status', () => {
  const receipt = readSubscription(validSubscription({ maxAssets: 4, maxStorageBytes: 1024,
    assetsUsed: 8, storageUsedBytes: 2048, status: 'EXPIRED' }));
  assert.equal(receipt.maxAssets, 4);
  assert.equal(receipt.maxStorageBytes, 1024);
  assert.equal(receipt.assetsUsed, 8);
  assert.equal(receipt.storageUsedBytes, 2048);
  assert.equal(receipt.vaultsCreatedLifetime, 0);
  assert.equal(receipt.status, 'EXPIRED');
  assert.equal(receipt.subscriptionId, null);
  assert.equal(receipt.startedAt, undefined);
});

test('Live subscription receipt cannot claim simulated data even for a successful HTTP response', async () => {
  const fetchFn = async () => ({ ok: true, status: 200,
    headers: { get: () => 'application/json' },
    json: async () => validSubscription({ isSimulation: true }) });
  await assert.rejects(liveSubscriptionAdapter.fetch({ fetchFn }), { code: 'INVALID_RESPONSE' });
});

test('Live adapter sends Bearer, locale and AbortSignal and preserves safe backend failures', async () => {
  const controller = new AbortController();
  let call;
  const fetchFn = async (url, init) => {
    call = { url, init };
    return { ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => validSubscription() };
  };
  await liveSubscriptionAdapter.fetch({ fetchFn, accessToken: 'synthetic-review-token', lang: 'en', signal: controller.signal });
  assert.match(call.url, /\/subscriptions\/me$/);
  assert.equal(call.init.headers.Authorization, 'Bearer synthetic-review-token');
  assert.equal(call.init.headers['Accept-Language'], 'en');
  assert.equal(call.init.signal, controller.signal);
  assert.equal(call.init.credentials, 'omit');
  for (const status of [401, 403, 404, 409, 500]) {
    await assert.rejects(liveSubscriptionAdapter.fetch({ fetchFn: async () => ({ ok: false, status,
      headers: { get: () => 'application/json' }, json: async () => ({ code: 'SAFE_CODE', traceId: 'test-trace' }) }) }),
    error => error.status === status && error.traceId === 'test-trace');
  }
});

test('Authenticated preview requests use real adapter and do not enter endless mock loading', async () => {
  const receipt = await fetchSubscription({ accessToken: 'synthetic-review-token', isDevPreview: true, scenario: 'loading',
    fetchFn: async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => validSubscription() }) });
  assert.equal(receipt.isSimulation, false);
});

test('Preview loading and delayed requests abort cleanly when leaving/changing scenario', async () => {
  for (const scenario of ['loading', 'near_quota']) {
    const controller = new AbortController();
    const pending = fetchSubscription({ isDevPreview: true, scenario, signal: controller.signal });
    controller.abort();
    await assert.rejects(pending, { name: 'AbortError' });
    await assert.rejects(fetchSubscription({ isDevPreview: true, scenario, signal: controller.signal }), { name: 'AbortError' });
  }
});

test('Scenario URL resets to Basic after removal/invalid value and preserves near-quota on load', () => {
  assert.equal(subscriptionScenario('?preview=true&scenario=near_quota'), 'near_quota');
  assert.equal(subscriptionScenario('?preview=true'), 'active_basic');
  assert.equal(subscriptionScenario('?scenario=unknown'), 'active_basic');
});

test('Status and error messages use locale without claiming Active or exposing diagnostic codes', () => {
  assert.equal(subscriptionStatusLabel('ACTIVE', 'en'), 'Active');
  assert.equal(subscriptionStatusLabel('EXPIRED', 'en'), 'Expired');
  assert.notEqual(subscriptionStatusLabel('UNKNOWN', 'en'), 'Active');
  const raw = { status: 500, message: 'SQL detail', code: 'INTERNAL_ERROR' };
  assert.equal(subscriptionErrorMessage(raw, 'en'), subscriptionMessages.en.backendNotReady);
  assert.equal(subscriptionErrorMessage({ status: 403 }, 'en'), subscriptionMessages.en.forbidden);
  assert.ok(!subscriptionErrorMessage(raw, 'vi').includes('SQL'));
});


test('Actual production build disables simulation even when caller supplies test/preview overrides', async () => {
  const { build } = await import('vite');
  const { fileURLToPath } = await import('node:url');
  const result = await build({ configFile: false, logLevel: 'silent', mode: 'production',
    build: { ssr: fileURLToPath(new URL('./subscriptionService.js', import.meta.url)), write: false, minify: false } });
  const chunk = result.output.find(item => item.type === 'chunk' && item.isEntry);
  const compiled = await import(`data:text/javascript;base64,${Buffer.from(chunk.code).toString('base64')}`);
  assert.equal(compiled.isSimulationPermitted({ isDevPreview: true, isTest: true, testEnv: { PROD: false } }), false);
  let calls = 0;
  await assert.rejects(compiled.fetchSubscription({ isDevPreview: true, scenario: 'loading',
    fetchFn: async () => { calls++; return { ok: true, status: 200,
      headers: { get: () => 'application/json' }, json: async () => ({}) }; } }), { code: 'INVALID_RESPONSE' });
  assert.equal(calls, 1);
});

// Current develop PS-77 deliberately keeps entitlements disabled until policy agreement.
test('Live policy-pending response stays an error without synthetic entitlements or writes', async () => {
  const calls = [];
  await assert.rejects(fetchSubscription({ accessToken: 'synthetic', isDevPreview: true,
    fetchFn: async (url, init) => { calls.push({ url, init }); return { ok: false, status: 409,
      headers: { get: () => 'application/json' }, json: async () => ({ code: 'SUBSCRIPTION_POLICY_PENDING' }) }; }
  }), { code: 'SUBSCRIPTION_POLICY_PENDING', status: 409 });
  assert.equal(calls.length, 1); assert.equal(calls[0].init.method, 'GET');
  for (const lang of ['vi', 'en']) {
    const message = subscriptionErrorMessage({ code: 'SUBSCRIPTION_POLICY_PENDING', status: 409 }, lang);
    assert.equal(message, subscriptionMessages[lang].policyPending);
    assert.ok(!message.includes('SUBSCRIPTION_POLICY_PENDING'));
  }
});
