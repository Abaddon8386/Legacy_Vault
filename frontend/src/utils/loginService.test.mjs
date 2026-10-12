import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateUser,
  PREVIEW_SCENARIOS,
  getAuthMessage,
  isValidLoginResponse,
} from './loginService.js';

test('Login Service - Scenario list is properly exported', () => {
  assert.ok(Array.isArray(PREVIEW_SCENARIOS));
  assert.ok(PREVIEW_SCENARIOS.length >= 5);
  const successScenario = PREVIEW_SCENARIOS.find((s) => s.id === 'success');
  assert.ok(successScenario);
  assert.match(successScenario.labelVi, /Mô phỏng đăng nhập thành công/);
});

test('Login Service - isValidLoginResponse correctly validates PS-74 proposed contract schema', () => {
  // Invalid values
  assert.equal(isValidLoginResponse(null), false);
  assert.equal(isValidLoginResponse(undefined), false);
  assert.equal(isValidLoginResponse('string'), false);
  assert.equal(isValidLoginResponse([]), false);
  assert.equal(isValidLoginResponse({}), false);

  // Missing fields
  assert.equal(
    isValidLoginResponse({
      accessToken: 'token-123',
      // missing tokenType, expiresInSeconds, user
    }),
    false
  );
  assert.equal(
    isValidLoginResponse({
      accessToken: 'token-123',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      // missing user
    }),
    false
  );

  // Valid PS-74 Login Response
  assert.equal(
    isValidLoginResponse({
      accessToken: 'valid-jwt-token-xyz',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: 'user-uuid-1',
        email: 'vaultowner@legacyvault.vn',
        fullName: 'Nguyen Van An',
        roles: ['VAULT_OWNER'],
      },
    }),
    true
  );
});

test('Login Service - DEV Preview: Simulated success remains distinct and does not fabricate token', async () => {
  let fetchCalled = false;
  const mockFetch = async () => {
    fetchCalled = true;
    throw new Error('Live fetch should not be called');
  };

  const result = await authenticateUser(
    { email: 'owner@vault.vn', password: 'secretPassword' },
    { scenario: 'success', isDevPreview: true, lang: 'vi', fetchFn: mockFetch }
  );

  assert.equal(fetchCalled, false);
  assert.equal(result.status, 200);
  assert.equal(result.user.email, 'owner@vault.vn');
  assert.equal(result.user.role, 'VAULT_OWNER');
  assert.equal(result.isSimulation, true);
  assert.equal(result.code, 'SIMULATED_SUCCESS');
  assert.match(result.message, /Mô phỏng đăng nhập thành công/);
  // Guarantee no JWT or password token is fabricated
  assert.equal(result.token, undefined);
  assert.equal(result.accessToken, undefined);
});

test('Login Service - Normal mode: HTTP 200 returning HTML (Vite SPA fallback) throws ENDPOINT_NOT_IMPLEMENTED', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'text/html; charset=utf-8' },
    json: async () => {
      throw new Error('Unexpected token < in JSON at position 0');
    },
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 200);
      assert.equal(err.code, 'ENDPOINT_NOT_IMPLEMENTED');
      assert.match(err.message, /Dịch vụ đăng nhập hiện chưa sẵn sàng/);
      return true;
    }
  );
});

test('Login Service - Normal mode: HTTP 200 returning empty JSON throws INVALID_AUTH_RESPONSE and does not grant success', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({}),
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 200);
      assert.equal(err.code, 'INVALID_AUTH_RESPONSE');
      assert.match(err.message, /không đúng định dạng/);
      return true;
    }
  );
});

test('Login Service - Normal mode: HTTP 200 with incomplete contract payload throws INVALID_AUTH_RESPONSE', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      user: { id: '123', email: 'user@legacyvault.vn' },
      // Missing accessToken, tokenType, expiresInSeconds
    }),
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'en', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 200);
      assert.equal(err.code, 'INVALID_AUTH_RESPONSE');
      assert.match(err.message, /invalid format/);
      return true;
    }
  );
});

test('Login Service - Normal mode: HTTP 200 returning valid PS-74 Login Response succeeds safely without fake session', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    json: async () => ({
      accessToken: 'valid-jwt-token-sample',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: '3f2b8c1e-0a4d-4c8e-9b1a-6a1d2f3e4b5c',
        fullName: 'Nguyen Van A',
        email: 'user@legacyvault.vn',
        roles: ['VAULT_OWNER'],
      },
    }),
  });

  const result = await authenticateUser(
    { email: 'user@legacyvault.vn', password: 'Password123!' },
    { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
  );

  assert.equal(result.status, 200);
  assert.equal(result.code, 'SUCCESS');
  assert.equal(result.user.email, 'user@legacyvault.vn');
  assert.equal(result.tokenType, 'Bearer');
  assert.equal(result.expiresInSeconds, 3600);
  assert.equal(result.isSimulation, false);
});

test('Login Service - Unauthorized (401) throws expected error with PS-74 code', async () => {
  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'owner@vault.vn', password: 'wrong' },
        { scenario: 'unauthorized', lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'INVALID_CREDENTIALS');
      assert.match(err.message, /không chính xác/);
      return true;
    }
  );
});

test('Login Service - Network error scenario throws status 0', async () => {
  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'owner@vault.vn', password: 'test' },
        { scenario: 'network_error', lang: 'en' }
      );
    },
    (err) => {
      assert.equal(err.status, 0);
      assert.equal(err.code, 'NETWORK_ERROR');
      assert.match(err.message, /Unable to connect/);
      return true;
    }
  );
});

test('Login Service - Session expired scenario throws 401 SESSION_EXPIRED', async () => {
  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'owner@vault.vn', password: 'test' },
        { scenario: 'session_expired', lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.status, 401);
      assert.equal(err.code, 'SESSION_EXPIRED');
      assert.match(err.message, /hết hạn/);
      return true;
    }
  );
});

test('Login Service - Normal mode: Unimplemented login endpoint (HTML/raw 404) displays friendly service unavailable message', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'text/html' },
    json: async () => {
      throw new Error('Not JSON');
    },
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'ENDPOINT_NOT_IMPLEMENTED');
      assert.match(err.message, /Dịch vụ đăng nhập hiện chưa sẵn sàng trên máy chủ/);
      return true;
    }
  );
});

test('Login Service - Normal mode: PS-74 structured 404 RESOURCE_NOT_FOUND is not equated with unready endpoint', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 404,
    headers: { get: () => 'application/json' },
    json: async () => ({
      status: 404,
      code: 'RESOURCE_NOT_FOUND',
      message: 'Tài khoản người dùng không tồn tại.',
      traceId: 'trace-404-test',
    }),
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 404);
      assert.equal(err.code, 'RESOURCE_NOT_FOUND');
      assert.equal(err.message, 'Tài khoản người dùng không tồn tại.');
      assert.equal(err.traceId, 'trace-404-test');
      return true;
    }
  );
});

test('Login Service - Normal mode: 500 error does not expose raw exception or stack trace', async () => {
  const mockFetch = async () => ({
    ok: false,
    status: 500,
    headers: { get: () => 'application/json' },
    json: async () => ({
      status: 500,
      code: 'INTERNAL_ERROR',
      message: 'org.springframework.dao.DataIntegrityViolationException: sensitive db column info',
      traceId: 'trace-500-abc',
    }),
  });

  await assert.rejects(
    async () => {
      await authenticateUser(
        { email: 'user@legacyvault.vn', password: 'Password123!' },
        { isDevPreview: false, lang: 'vi', fetchFn: mockFetch }
      );
    },
    (err) => {
      assert.equal(err.status, 500);
      assert.equal(err.code, 'INTERNAL_ERROR');
      // Must use generic safe message, not leak SQL/Spring exception
      assert.equal(err.message, getAuthMessage('INTERNAL_ERROR', 'vi'));
      assert.doesNotMatch(err.message, /DataIntegrityViolationException/);
      return true;
    }
  );
});