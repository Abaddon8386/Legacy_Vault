import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateDmsInterval,
  formatDmsDate,
  dmsStatusMessages,
  DMS_SCENARIOS,
  INTERVAL_PRESETS,
  DEFAULT_INTERVAL_DAYS,
  isSimulationPermitted,
  mockDmsAdapter,
  liveDmsAdapter,
  fetchDmsConfig,
  saveDmsConfig,
  checkInDms,
} from './dmsService.js';

// ============================================================================
// CONSTANTS & EXPORTS
// ============================================================================

test('DMS Constants - Scenario list and interval presets are properly exported', () => {
  assert.ok(Array.isArray(DMS_SCENARIOS));
  assert.ok(DMS_SCENARIOS.length >= 8);
  const ids = DMS_SCENARIOS.map((s) => s.id);
  assert.ok(ids.includes('monitoring'));
  assert.ok(ids.includes('not_configured'));
  assert.ok(ids.includes('triggered'));
  assert.ok(ids.includes('unauthorized'));
  assert.ok(ids.includes('forbidden'));
  assert.ok(ids.includes('beneficiary_required'));
  assert.ok(ids.includes('conflict_not_monitoring'));

  assert.ok(Array.isArray(INTERVAL_PRESETS));
  assert.equal(INTERVAL_PRESETS.length, 4);
  assert.equal(DEFAULT_INTERVAL_DAYS, 30);
});

// ============================================================================
// VALIDATION TESTS
// ============================================================================

test('DMS Validation - Empty input triggers required error (VI and EN)', () => {
  const errVi = validateDmsInterval('', 'vi');
  assert.equal(errVi.check_interval_days, dmsStatusMessages.vi.intervalRequired);

  const errEn = validateDmsInterval('   ', 'en');
  assert.equal(errEn.check_interval_days, dmsStatusMessages.en.intervalRequired);
});

test('DMS Validation - Non-integer and floating values trigger integer error', () => {
  const errFloat = validateDmsInterval('30.5', 'vi');
  assert.equal(errFloat.check_interval_days, dmsStatusMessages.vi.intervalInteger);

  const errText = validateDmsInterval('abc', 'en');
  assert.equal(errText.check_interval_days, dmsStatusMessages.en.intervalInteger);
});

test('DMS Validation - Zero and negative values trigger positive error', () => {
  const errZero = validateDmsInterval(0, 'vi');
  assert.equal(errZero.check_interval_days, dmsStatusMessages.vi.intervalPositive);

  const errNegative = validateDmsInterval(-10, 'en');
  assert.equal(errNegative.check_interval_days, dmsStatusMessages.en.intervalPositive);
});

test('DMS Validation - Valid positive integers pass validation', () => {
  assert.deepEqual(validateDmsInterval(30, 'vi'), {});
  assert.deepEqual(validateDmsInterval('60', 'vi'), {});
  assert.deepEqual(validateDmsInterval(90, 'en'), {});
  assert.deepEqual(validateDmsInterval(180, 'en'), {});
});

// ============================================================================
// DATE FORMATTING HELPER TESTS
// ============================================================================

test('DMS Date Formatter - Handles missing and invalid dates gracefully', () => {
  assert.equal(formatDmsDate(null, 'vi'), 'Chưa xác định');
  assert.equal(formatDmsDate(undefined, 'en'), 'Not set');
  assert.equal(formatDmsDate('invalid-date', 'vi'), 'Không hợp lệ');
  assert.equal(formatDmsDate('invalid-date', 'en'), 'Invalid date');
});

test('DMS Date Formatter - Formats valid ISO date strings', () => {
  const formattedVi = formatDmsDate('2026-10-10T08:00:00Z', 'vi');
  assert.ok(formattedVi.includes('2026'));

  const formattedEn = formatDmsDate('2026-10-10T08:00:00Z', 'en');
  assert.ok(formattedEn.includes('2026'));
});

// ============================================================================
// SIMULATION GUARD & ENVIRONMENT GATE TESTS
// ============================================================================

test('DMS Simulation Guard - Production environment strictly forbids simulation unconditionally', () => {
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isSimulation: true }),
    false
  );
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isDevPreview: true }),
    false
  );
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isDev: true }),
    false
  );
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, scenario: 'monitoring' }),
    false
  );
});

test('DMS Simulation Guard - Clean mode in non-production enforces live adapter', () => {
  assert.equal(isSimulationPermitted({ isDevPreview: false }), false);
  assert.equal(isSimulationPermitted({ scenario: 'monitoring' }), false);
  assert.equal(isSimulationPermitted({}), false);
});

test('DMS Simulation Guard - DEV Preview and isolated test runner allow simulation in non-prod', () => {
  assert.equal(isSimulationPermitted({ isDevPreview: true }), true);
  assert.equal(isSimulationPermitted({ isTest: true }), true);
});

// ============================================================================
// PRODUCTION GUARD INTEGRATION (fetchDmsConfig, saveDmsConfig, checkInDms)
// ============================================================================

test('DMS Production Guard - fetchDmsConfig in production calls live adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gracePeriodDays: 1, nextCheckAt: '2026-11-11T07:00:00Z', status: 'MONITORING', checkIntervalDays: 30 }),
    };
  };

  const result = await fetchDmsConfig({
    testEnv: { PROD: true },
    isDevPreview: true,
    vaultId: 'vlt-real',
    fetchFn: mockFetch,
  });

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.ownerId, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
});

test('DMS Production Guard - saveDmsConfig in production calls live adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gracePeriodDays: 1, nextCheckAt: '2026-11-11T07:00:00Z', status: 'MONITORING', checkIntervalDays: 60 }),
    };
  };

  const result = await saveDmsConfig(
    { check_interval_days: 60 },
    {
      testEnv: { PROD: true },
      isDevPreview: true,
      vaultId: 'vlt-real',
      fetchFn: mockFetch,
    }
  );

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.checkIntervalDays, 60);
});

test('DMS Production Guard - checkInDms in production calls live adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gracePeriodDays: 1, nextCheckAt: '2026-11-11T07:00:00Z', status: 'MONITORING', checkIntervalDays: 30 }),
    };
  };

  const result = await checkInDms({
    testEnv: { PROD: true },
    isDevPreview: true,
    vaultId: 'vlt-real',
    fetchFn: mockFetch,
  });

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
});

// ============================================================================
// MOCK ADAPTER TESTS
// ============================================================================

test('DMS Mock Adapter - fetch: monitoring returns active monitoring details', () => {
  const data = mockDmsAdapter.fetch('monitoring', 'vi');
  assert.ok(data);
  assert.equal(data.status, 'MONITORING');
  assert.equal(data.checkIntervalDays, 30);
  assert.equal(data.isSimulation, true);
  assert.ok(data.nextCheckAt);
});

test('DMS Mock Adapter - fetch: not_configured returns null', () => {
  const data = mockDmsAdapter.fetch('not_configured', 'vi');
  assert.equal(data, null);
});

test('DMS Mock Adapter - fetch: triggered returns TRIGGERED status with graceDeadline', () => {
  const data = mockDmsAdapter.fetch('triggered', 'vi');
  assert.ok(data);
  assert.equal(data.status, 'TRIGGERED');
  assert.ok(data.graceDeadline);
  assert.ok(data.triggeredAt);
});

test('DMS Mock Adapter - fetch: 401 and 403 throw expected error codes', () => {
  assert.throws(
    () => mockDmsAdapter.fetch('unauthorized', 'vi'),
    (err) => err.status === 401 && err.code === 'UNAUTHORIZED'
  );
  assert.throws(
    () => mockDmsAdapter.fetch('forbidden', 'vi'),
    (err) => err.status === 403 && err.code === 'FORBIDDEN'
  );
});

test('DMS Mock Adapter - save: updates interval and computes nextCheckAt', () => {
  const updated = mockDmsAdapter.save(60, 'monitoring', 'vi');
  assert.ok(updated);
  assert.equal(updated.checkIntervalDays, 60);
  assert.equal(updated.status, 'MONITORING');
  assert.equal(updated.isSimulation, true);
});

test('DMS Mock Adapter - save: beneficiary_required scenario throws 422', () => {
  assert.throws(
    () => mockDmsAdapter.save(30, 'beneficiary_required', 'vi'),
    (err) => err.status === 422 && err.code === 'BENEFICIARY_REQUIRED'
  );
});

test('DMS Mock Adapter - checkIn: resets check-in timestamp and countdown', () => {
  const result = mockDmsAdapter.checkIn('monitoring', 'vi');
  assert.ok(result);
  assert.equal(result.status, 'MONITORING');
  assert.equal(result.isSimulation, true);
  assert.ok(result.lastCheckInAt);
});

test('DMS Mock Adapter - checkIn: in TRIGGERED state throws 409 DMS_NOT_MONITORING (D-API-27 / LV-DEATH-001)', () => {
  assert.throws(
    () => mockDmsAdapter.checkIn('triggered', 'vi'),
    (err) => err.status === 409 && err.code === 'DMS_NOT_MONITORING'
  );
});

// ============================================================================
// LIVE ADAPTER TESTS
// ============================================================================

test('DMS Live Adapter - fetch: Non-JSON response triggers BACKEND_NOT_READY', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => 'text/html' },
    json: async () => { throw new Error('Not JSON'); },
  });

  await assert.rejects(
    async () => {
      await liveDmsAdapter.fetch({ vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => err.code === 'BACKEND_NOT_READY'
  );
});

test('DMS Live Adapter - fetch: 404 returns null (unconfigured empty state)', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'application/json' },
    json: async () => ({ message: 'Not found' }),
  });

  const result = await liveDmsAdapter.fetch({ vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
  assert.equal(result, null);
});

test('DMS Live Adapter - save: 422 triggers BENEFICIARY_REQUIRED', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 422,
    headers: { get: () => 'application/json' },
    json: async () => ({ code: 'BENEFICIARY_REQUIRED' }),
  });

  await assert.rejects(
    async () => {
      await liveDmsAdapter.save(30, { vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => err.status === 422 && err.code === 'BENEFICIARY_REQUIRED'
  );
});

test('DMS Live Adapter - save: 409 triggers VAULT_NOT_EDITABLE', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    json: async () => ({ code: 'VAULT_NOT_EDITABLE' }),
  });

  await assert.rejects(
    async () => {
      await liveDmsAdapter.save(30, { vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => err.status === 409 && err.code === 'VAULT_NOT_EDITABLE'
  );
});

test('DMS Live Adapter - checkIn: 409 triggers DMS_NOT_MONITORING', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    json: async () => ({ code: 'DMS_NOT_MONITORING' }),
  });

  await assert.rejects(
    async () => {
      await liveDmsAdapter.checkIn({ vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => err.status === 409 && err.code === 'DMS_NOT_MONITORING'
  );
});

test('DMS Live Adapter - checkIn: Success updates DMS state', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', gracePeriodDays: 1,
      status: 'MONITORING',
      checkIntervalDays: 30,
      lastCheckInAt: '2026-10-12T07:00:00Z',
      nextCheckAt: '2026-11-11T07:00:00Z',
    }),
  });

  const result = await liveDmsAdapter.checkIn({ vaultId: 'vlt-1', fetchFn: mockFetch, lang: 'vi' });
  assert.ok(result);
  assert.equal(result.status, 'MONITORING');
  assert.equal(result.lastCheckInAt, '2026-10-12T07:00:00Z');
  assert.equal(result.isSimulation, false);
});

// ============================================================================
// URL PREVIEW GATING & REGRESSION TESTS
// ============================================================================

test('DMS URL Preview Gating - scenario without isDevPreview enforces live adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: false,
      status: 503,
      headers: { get: () => 'text/html' },
      text: async () => 'Unavailable',
    };
  };

  await assert.rejects(
    async () => {
      // Caller passed scenario="triggered" but isDevPreview is false
      await fetchDmsConfig({ vaultId: 'vlt-test', scenario: 'triggered', isDevPreview: false, fetchFn: mockFetch });
    },
    (err) => err.code === 'BACKEND_NOT_READY'
  );
  assert.equal(liveCalled, true);
});

test('DMS URL Preview Gating - PROD unconditionally ignores preview and scenario parameters', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: false,
      status: 503,
      headers: { get: () => 'text/html' },
      text: async () => 'Unavailable',
    };
  };

  await assert.rejects(
    async () => {
      // In production, isDevPreview: true and scenario: "monitoring" MUST call live adapter
      await fetchDmsConfig({
        vaultId: 'vlt-test',
        scenario: 'monitoring',
        isDevPreview: true,
        testEnv: { PROD: true },
        fetchFn: mockFetch,
      });
    },
    (err) => err.code === 'BACKEND_NOT_READY'
  );
  assert.equal(liveCalled, true);
});
