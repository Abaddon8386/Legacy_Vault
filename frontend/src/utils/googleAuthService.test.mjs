import test from 'node:test';
import assert from 'node:assert/strict';
import {
  authenticateWithGoogle,
  getAuthMessage,
  authStatusMessages,
} from './loginService.js';
import { ApiError } from '../api/http.js';

test('Google Auth Service - Rejects missing, empty, or whitespace credentials with INVALID_GOOGLE_CREDENTIAL', async () => {
  for (const emptyVal of [null, undefined, '', '   ', {}]) {
    await assert.rejects(
      async () => {
        await authenticateWithGoogle({ credential: emptyVal }, { lang: 'vi' });
      },
      (err) => {
        assert.equal(err.status, 400);
        assert.equal(err.code, 'INVALID_GOOGLE_CREDENTIAL');
        assert.equal(err.message, getAuthMessage('INVALID_GOOGLE_CREDENTIAL', 'vi'));
        return true;
      }
    );
  }
});

test('Google Auth Service - Sends credential to /auth/google and resolves valid session per PS-74/PS-10', async () => {
  let requestedUrl = null;
  let requestedMethod = null;
  let requestedBody = null;

  const mockFetch = async (url, init) => {
    requestedUrl = url;
    requestedMethod = init.method;
    requestedBody = JSON.parse(init.body);
    return new Response(
      JSON.stringify({
        accessToken: 'google-authenticated-jwt-token',
        tokenType: 'Bearer',
        expiresInSeconds: 3600,
        user: {
          id: '12345678-1234-4234-8234-123456789abc',
          fullName: 'Google User',
          email: 'googleuser@gmail.com',
          roles: ['VAULT_OWNER'],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  };

  const result = await authenticateWithGoogle(
    { credential: 'valid.google.id.token' },
    { fetchFn: mockFetch, lang: 'vi' }
  );

  assert.ok(requestedUrl.endsWith('/auth/google'));
  assert.equal(requestedMethod, 'POST');
  assert.equal(requestedBody.credential, 'valid.google.id.token');
  assert.equal(requestedBody.idToken, undefined, 'Redundant idToken field must not be sent');

  assert.equal(result.status, 200);
  assert.equal(result.code, 'SUCCESS');
  assert.equal(result.accessToken, 'google-authenticated-jwt-token');
  assert.equal(result.tokenType, 'Bearer');
  assert.equal(result.expiresInSeconds, 3600);
  assert.equal(result.user.email, 'googleuser@gmail.com');
  assert.equal(result.user.fullName, 'Google User');
  assert.deepEqual(result.user.roles, ['VAULT_OWNER']);
  assert.equal(result.isSimulation, false);
});

test('Google Auth Service - Normalizes ROLE_ prefix to standard FE roles without altering user identity', async () => {
  const mockFetch = async () =>
    new Response(
      JSON.stringify({
        accessToken: 'google-multi-role-jwt',
        tokenType: 'Bearer',
        expiresInSeconds: 7200,
        user: {
          id: '87654321-4321-4321-8321-210987654321',
          fullName: 'Staff Executor Google',
          email: 'staff.google@legacyvault.vn',
          roles: ['ROLE_STAFF_EXECUTOR', 'ROLE_VAULT_OWNER'],
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  const result = await authenticateWithGoogle(
    { credential: 'test.credential' },
    { fetchFn: mockFetch, lang: 'en' }
  );

  assert.deepEqual(result.user.roles, ['STAFF_EXECUTOR', 'VAULT_OWNER']);
});

test('Google Auth Service - Rejects malformed backend response (missing tokens or invalid roles)', async () => {
  const mockFetchMissingUser = async () =>
    new Response(
      JSON.stringify({
        accessToken: 'incomplete-jwt',
        tokenType: 'Bearer',
        expiresInSeconds: 3600,
        // missing user object
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetchMissingUser, lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.code, 'INVALID_AUTH_RESPONSE');
      assert.equal(err.message, getAuthMessage('INVALID_AUTH_RESPONSE', 'vi'));
      return true;
    }
  );
});

test('Google Auth Service - Unready backend (404 / HTML Vite SPA fallback) maps to GOOGLE_SIGNIN_UNAVAILABLE with localized message', async () => {
  const mockFetchHtml404 = async () =>
    new Response('<!DOCTYPE html><html><body>SPA Fallback</body></html>', {
      status: 200,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetchHtml404, lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.code, 'GOOGLE_SIGNIN_UNAVAILABLE');
      assert.match(err.message, /chưa khả dụng/);
      return true;
    }
  );

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetchHtml404, lang: 'en' }
      );
    },
    (err) => {
      assert.equal(err.code, 'GOOGLE_SIGNIN_UNAVAILABLE');
      assert.match(err.message, /currently unavailable/);
      return true;
    }
  );
});

test('Google Auth Service - Structured 404 RESOURCE_NOT_FOUND maps to GOOGLE_SIGNIN_UNAVAILABLE', async () => {
  const mockFetch404 = async () =>
    new Response(
      JSON.stringify({
        status: 404,
        code: 'RESOURCE_NOT_FOUND',
        message: 'Endpoint not found',
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetch404, lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.code, 'GOOGLE_SIGNIN_UNAVAILABLE');
      assert.equal(err.message, getAuthMessage('GOOGLE_SIGNIN_UNAVAILABLE', 'vi'));
      return true;
    }
  );
});

test('Google Auth Service - Network error propagates with status 0 and safe message', async () => {
  const mockFetchNetworkErr = async () => {
    throw new TypeError('Failed to fetch');
  };

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetchNetworkErr, lang: 'en' }
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

test('Google Auth Service - Preserves AbortError without converting to technical error', async () => {
  const controller = new AbortController();
  controller.abort();

  const mockFetchAbort = async (_url, init) => {
    if (init.signal?.aborted) {
      const err = new Error('The operation was aborted');
      err.name = 'AbortError';
      throw err;
    }
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  };

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { signal: controller.signal, fetchFn: mockFetchAbort, lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.name, 'AbortError');
      return true;
    }
  );
});

test('Google Auth Service - Backend 500 does not leak stack traces or internal SQL exceptions', async () => {
  const mockFetch500 = async () =>
    new Response(
      JSON.stringify({
        status: 500,
        code: 'INTERNAL_ERROR',
        message: 'org.hibernate.exception.ConstraintViolationException: column user_email unique',
        traceId: 'trace-leak-check',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );

  await assert.rejects(
    async () => {
      await authenticateWithGoogle(
        { credential: 'google.jwt.token' },
        { fetchFn: mockFetch500, lang: 'vi' }
      );
    },
    (err) => {
      assert.equal(err.status, 500);
      assert.equal(err.code, 'INTERNAL_ERROR');
      assert.equal(err.message, getAuthMessage('INTERNAL_ERROR', 'vi'));
      assert.doesNotMatch(err.message, /ConstraintViolationException/);
      assert.doesNotMatch(err.message, /user_email/);
      return true;
    }
  );
});
