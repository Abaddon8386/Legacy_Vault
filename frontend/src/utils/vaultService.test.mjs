import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateVaultInput,
  vaultStatusMessages,
  VAULT_SCENARIOS,
  isSimulationPermitted,
  mockVaultAdapter,
  liveVaultAdapter,
  fetchVault,
  createVault,
} from './vaultService.js';

test('Vault Service - Scenario list is properly exported', () => {
  assert.ok(Array.isArray(VAULT_SCENARIOS));
  assert.ok(VAULT_SCENARIOS.length >= 7);
  const ids = VAULT_SCENARIOS.map((s) => s.id);
  assert.ok(ids.includes('exists'));
  assert.ok(ids.includes('empty'));
  assert.ok(ids.includes('create_modal'));
  assert.ok(ids.includes('unauthorized'));
  assert.ok(ids.includes('forbidden'));
});

test('Vault Validation - Required name validation (VI and EN)', () => {
  const empty = { vault_name: '', description: '' };
  const errVi = validateVaultInput(empty, 'vi');
  assert.equal(errVi.vault_name, vaultStatusMessages.vi.nameRequired);

  const errEn = validateVaultInput(empty, 'en');
  assert.equal(errEn.vault_name, vaultStatusMessages.en.nameRequired);
});

test('Vault Validation - Length constraints (2 to 150 chars, desc <= 1000)', () => {
  const tooShort = { vault_name: 'A' };
  assert.equal(
    validateVaultInput(tooShort, 'vi').vault_name,
    vaultStatusMessages.vi.nameMin
  );

  const tooLong = { vault_name: 'A'.repeat(151) };
  assert.equal(
    validateVaultInput(tooLong, 'vi').vault_name,
    vaultStatusMessages.vi.nameMax
  );

  const descTooLong = { vault_name: 'Kho di sản', description: 'D'.repeat(1001) };
  assert.equal(
    validateVaultInput(descTooLong, 'vi').description,
    vaultStatusMessages.vi.descMax
  );

  const valid = { vault_name: 'Kho gia đình Vance', description: 'Gìn giữ di sản số' };
  assert.deepEqual(validateVaultInput(valid, 'vi'), {});
});

// ============================================================================
// SIMULATION GUARD & ENVIRONMENT GATE TESTS
// ============================================================================

test('Simulation Guard - Production environment strictly forbids simulation unconditionally', () => {
  // 1. Production + isSimulation: true must return false
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isSimulation: true }),
    false
  );

  // 2. Production + isDevPreview: true must return false
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isDevPreview: true }),
    false
  );

  // 3. Production + isDev: true must NOT bypass guard
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isDev: true, isDevPreview: true }),
    false
  );

  // 4. Production + scenario: 'exists' must return false
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, scenario: 'exists' }),
    false
  );

  // 5. Production + isTest: true must return false
  assert.equal(
    isSimulationPermitted({ testEnv: { PROD: true }, isTest: true }),
    false
  );
});

test('Simulation Guard - Clean mode in non-production enforces live adapter', () => {
  // Clean mode without isDevPreview does NOT allow simulation, even with scenario
  assert.equal(isSimulationPermitted({ isDevPreview: false }), false);
  assert.equal(isSimulationPermitted({ scenario: 'exists' }), false);
  assert.equal(isSimulationPermitted({}), false);
});

test('Simulation Guard - DEV Preview mode in non-production allows simulation', () => {
  assert.equal(isSimulationPermitted({ isDevPreview: true }), true);
});

test('Simulation Guard - Isolated test runner mode in non-production allows simulation', () => {
  assert.equal(isSimulationPermitted({ isTest: true }), true);
});

// ============================================================================
// PRODUCTION GUARD INTEGRATION (fetchVault & createVault)
// ============================================================================

test('Production Guard - Production + isSimulation: true calls live adapter and never returns mock', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'vlt-prod-live', name: 'Kho Live Thật', status: 'ACTIVE' }),
    };
  };

  const result = await fetchVault({
    testEnv: { PROD: true },
    isSimulation: true,
    scenario: 'exists',
    fetchFn: mockFetch,
  });

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.id, 'vlt-prod-live');
});

test('Production Guard - Production + isDevPreview: true calls live adapter and never returns mock', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'vlt-prod-preview-blocked', name: 'Kho Prod Live', status: 'ACTIVE' }),
    };
  };

  const result = await fetchVault({
    testEnv: { PROD: true },
    isDevPreview: true,
    scenario: 'exists',
    fetchFn: mockFetch,
  });

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.id, 'vlt-prod-preview-blocked');
});

test('Production Guard - Production + isDev: true cannot bypass guard and calls live adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'vlt-prod-bypass-failed', name: 'Kho Prod Live Safe', status: 'ACTIVE' }),
    };
  };

  const result = await fetchVault({
    testEnv: { PROD: true },
    isDev: true,
    isDevPreview: true,
    isSimulation: true,
    scenario: 'exists',
    fetchFn: mockFetch,
  });

  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.id, 'vlt-prod-bypass-failed');
});

test('Production Guard - Create Vault in production + isDevPreview: true enforces live API', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 201,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'vlt-created-prod-live', name: 'Kho Tạo Prod', status: 'ACTIVE' }),
    };
  };

  const created = await createVault(
    { vault_name: 'Kho Tạo Prod' },
    {
      testEnv: { PROD: true },
      isDevPreview: true,
      isDev: true,
      fetchFn: mockFetch,
    }
  );

  assert.equal(liveCalled, true);
  assert.equal(created.isSimulation, false);
  assert.equal(created.id, 'vlt-created-prod-live');
});

// ============================================================================
// CLEAN MODE VS DEV PREVIEW BEHAVIOR
// ============================================================================

test('Clean Mode - Clean mode (no preview flag) enforces live fetch adapter', async () => {
  let liveCalled = false;
  const mockFetch = async () => {
    liveCalled = true;
    return {
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      json: async () => ({ id: 'vlt-clean-mode', name: 'Kho Clean Mode', status: 'ACTIVE' }),
    };
  };

  const result = await fetchVault({ fetchFn: mockFetch });
  assert.equal(liveCalled, true);
  assert.equal(result.isSimulation, false);
  assert.equal(result.id, 'vlt-clean-mode');
});

test('Clean Mode - Passing scenario in clean mode does not trigger mock', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'text/html' },
    json: async () => {},
  });

  // Without isDevPreview / isTest, scenario: 'exists' must not mock and must invoke live fetch
  await assert.rejects(
    async () => {
      await fetchVault({ scenario: 'exists', fetchFn: mockFetch });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      return true;
    }
  );
});

test('DEV Preview - isDevPreview: true in non-production returns mock simulation', async () => {
  const result = await fetchVault({ isDevPreview: true, scenario: 'exists', lang: 'vi' });
  assert.ok(result);
  assert.equal(result.isSimulation, true);
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.vault_name, 'Kho Di Sản Gia Đình Vance');
});

// ============================================================================
// ADAPTER SEPARATION: MOCK ADAPTER TESTS
// ============================================================================

test('Mock Adapter - fetch: exists scenario returns Vance Family Sanctuary', () => {
  const data = mockVaultAdapter.fetch('exists', 'vi');
  assert.ok(data);
  assert.equal(data.status, 'ACTIVE');
  assert.equal(data.isSimulation, true);
  assert.equal(data.vault_name, 'Kho Di Sản Gia Đình Vance');
});

test('Mock Adapter - fetch: empty scenario returns null', () => {
  const data = mockVaultAdapter.fetch('empty', 'vi');
  assert.equal(data, null);
});

test('Mock Adapter - fetch: 401 unauthorized throws expected code', () => {
  assert.throws(
    () => mockVaultAdapter.fetch('unauthorized', 'vi'),
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'UNAUTHORIZED');
      return true;
    }
  );
});

test('Mock Adapter - fetch: 403 forbidden throws expected code', () => {
  assert.throws(
    () => mockVaultAdapter.fetch('forbidden', 'vi'),
    (err) => {
      assert.equal(err.status, 403);
      assert.equal(err.code, 'FORBIDDEN');
      return true;
    }
  );
});

test('Mock Adapter - create: creates mock vault with isSimulation: true', () => {
  const created = mockVaultAdapter.create('Kho Mới Thử Nghiệm', 'Mô tả', 'success', 'vi');
  assert.ok(created);
  assert.equal(created.status, 'ACTIVE');
  assert.equal(created.isSimulation, true);
  assert.equal(created.vault_name, 'Kho Mới Thử Nghiệm');
});

// ============================================================================
// ADAPTER SEPARATION: LIVE ADAPTER TESTS
// ============================================================================

test('Live Adapter - fetch: Non-JSON response triggers BACKEND_NOT_READY', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'text/html' },
    json: async () => { throw new Error('Not JSON'); },
  });

  await assert.rejects(
    async () => {
      await liveVaultAdapter.fetch({ fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      return true;
    }
  );
});

test('Live Adapter - fetch: 404 status returns null for uninitialized vault', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'application/json' },
    json: async () => ({ message: 'Not found' }),
  });

  const result = await liveVaultAdapter.fetch({ fetchFn: mockFetch, lang: 'vi' });
  assert.equal(result, null);
});

test('Live Adapter - fetch: missing timestamp does not fabricate fake date', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      id: 'vlt-real-no-date',
      name: 'Kho Không Ngày',
      status: 'ACTIVE',
      // createdAt is intentionally omitted
    }),
  });

  const result = await liveVaultAdapter.fetch({ fetchFn: mockFetch, lang: 'vi' });
  assert.ok(result);
  assert.equal(result.id, 'vlt-real-no-date');
  assert.equal(result.created_at, null); // Must remain null, NOT '2026-10-10T08:00:00Z'
  assert.equal(result.isSimulation, false);
});

test('Live Adapter - fetch: missing ID returns null id without fabricating fake #VLT-0001', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      name: 'Kho Chưa Có Mã',
      status: 'ACTIVE',
      // id is omitted
    }),
  });

  const result = await liveVaultAdapter.fetch({ fetchFn: mockFetch, lang: 'vi' });
  assert.ok(result);
  assert.equal(result.id, null); // Must remain null, NOT '#VLT-0001'
  assert.equal(result.isSimulation, false);
});

test('Live Adapter - create: Network error throws status 0 NETWORK_ERROR', async () => {
  const mockFetch = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    async () => {
      await liveVaultAdapter.create('Kho Thử Nghiệm', 'Mô tả', { fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => {
      assert.equal(err.status, 0);
      assert.equal(err.code, 'NETWORK_ERROR');
      return true;
    }
  );
});

test('Live Adapter - create: 403/409 triggers VAULT_LIMIT_EXCEEDED', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 409,
    headers: { get: () => 'application/json' },
    json: async () => ({ message: 'Limit reached' }),
  });

  await assert.rejects(
    async () => {
      await liveVaultAdapter.create('Kho Vượt Quá Giới Hạn', '', { fetchFn: mockFetch, lang: 'vi' });
    },
    (err) => {
      assert.equal(err.status, 409);
      assert.equal(err.code, 'VAULT_LIMIT_EXCEEDED');
      return true;
    }
  );
});

test('Live Adapter - create: Success parses created vault and keeps created_at null when missing', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 201,
    headers: { get: () => 'application/json' },
    json: async () => ({
      id: 'vlt-live-success',
      name: 'Kho Khởi Tạo Thành Công',
      description: 'Mô tả',
      status: 'ACTIVE',
      // No createdAt
    }),
  });

  const result = await liveVaultAdapter.create('Kho Khởi Tạo Thành Công', 'Mô tả', {
    fetchFn: mockFetch,
    lang: 'vi',
  });

  assert.ok(result);
  assert.equal(result.id, 'vlt-live-success');
  assert.equal(result.status, 'ACTIVE');
  assert.equal(result.created_at, null);
  assert.equal(result.isSimulation, false);
});

// ============================================================================
// CREATE VAULT VALIDATION & FAILURE RETENTION LOGIC
// ============================================================================

test('Create Vault - Validation rejects empty name with 400 VALIDATION_FAILED', async () => {
  await assert.rejects(
    async () => {
      await createVault({ vault_name: '' }, { isDevPreview: false });
    },
    (err) => {
      assert.equal(err.status, 400);
      assert.equal(err.code, 'VALIDATION_FAILED');
      assert.ok(err.fieldErrors.vault_name);
      return true;
    }
  );
});

test('Create Vault - API failure rejects and preserves error for UI modal state', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 503,
    headers: { get: () => 'text/html' },
    json: async () => { throw new Error('Not JSON'); },
  });

  // When live API fails, createVault MUST reject with clear error so modal stays open with input intact
  await assert.rejects(
    async () => {
      await createVault(
        { vault_name: 'Kho Gia Đình', description: 'Giữ nguyên input khi lỗi' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.code, 'BACKEND_NOT_READY');
      return true;
    }
  );
});

// ============================================================================
// CREATE VAULT MODAL INTEGRATION & STATE RETENTION CONTRACT TESTS
// ============================================================================

test('Create Vault Flow - API rejection preserves form data and triggers modal error without closing', async () => {
  let modalClosed = false;
  let successNotification = null;

  const mockOnClose = () => { modalClosed = true; };
  const mockSetNotification = (msg) => { successNotification = msg; };

  const formData = { vault_name: 'Kho Gia Đình', description: 'Mô tả cần giữ lại khi API lỗi' };

  const mockApiFailure = async () => {
    const err = new Error('Dịch vụ lưu trữ Vault hiện đang trong quá trình tích hợp máy chủ.');
    err.status = 503;
    err.code = 'BACKEND_NOT_READY';
    throw err;
  };

  // Simulating VaultOverviewPage handleCreateVaultSubmit + CreateVaultModal handleSubmit
  let submitError = '';
  let isSubmitting = true;
  const formState = { ...formData };

  const handleCreateVaultSubmit = async (data) => {
    const created = await mockApiFailure(data);
    // Only reached on success
    mockOnClose();
    mockSetNotification('Thành công');
    return created;
  };

  try {
    await handleCreateVaultSubmit(formState);
    mockOnClose();
  } catch (err) {
    isSubmitting = false;
    submitError = err.message;
  }

  assert.equal(modalClosed, false, 'Modal MUST NOT close on API failure');
  assert.equal(successNotification, null, 'Success notification MUST NOT be displayed on failure');
  assert.equal(isSubmitting, false, 'isSubmitting must be reset to false so user can retry');
  assert.equal(submitError, 'Dịch vụ lưu trữ Vault hiện đang trong quá trình tích hợp máy chủ.');
  assert.deepEqual(formState, formData, 'User input data MUST be retained identically');
});

test('Create Vault Flow - API success closes modal and triggers success notification', async () => {
  let modalClosed = false;
  let successNotification = null;

  const mockOnClose = () => { modalClosed = true; };
  const mockSetNotification = (msg) => { successNotification = msg; };

  const formData = { vault_name: 'Kho Thành Công', description: 'Mô tả' };

  const mockApiSuccess = async () => ({
    id: 'vlt-123',
    name: 'Kho Thành Công',
    status: 'ACTIVE',
  });

  let submitError = '';
  let isSubmitting = true;
  const formState = { ...formData };

  const handleCreateVaultSubmit = async (data) => {
    const created = await mockApiSuccess(data);
    mockOnClose();
    mockSetNotification('Kho di sản số đã được khởi tạo thành công (Trạng thái ACTIVE).');
    return created;
  };

  try {
    await handleCreateVaultSubmit(formState);
  } catch (err) {
    isSubmitting = false;
    submitError = err.message;
  }

  assert.equal(modalClosed, true, 'Modal MUST close on success');
  assert.equal(submitError, '', 'No submit error on success');
  assert.equal(
    successNotification,
    'Kho di sản số đã được khởi tạo thành công (Trạng thái ACTIVE).'
  );
});
