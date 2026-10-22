import { request, ApiError } from '../api/http.js';
import { getAuthMessage } from './loginService.js';

/**
 * PS-85: Google Account Self-Service Linking Service for LegacyVault.
 *
 * CONTRACT & SAFETY RULES:
 * 1. Links only a verified Google credential (ID token) to the currently authenticated account.
 * 2. Requires a valid JWT Bearer token in the Authorization header.
 * 3. Never decodes credential in client to invent identity or auto-link by email.
 * 4. Only an explicit receipt with { linked: true } from POST /api/v1/auth/google/link
 *    indicates successful linking.
 * 5. Credentials and Bearer tokens are NEVER logged, stored in web storage, or exposed in URLs.
 * 6. Supports AbortSignal for prompt cancellation on logout, account switch, or component unmount.
 *
 * @param {Object} payload - { credential: string, accessToken: string }
 * @param {Object} options - { lang: 'vi'|'en', signal?: AbortSignal, fetchFn?: Function }
 * @returns {Promise<{ linked: boolean, code: string, message: string }>}
 */
export async function linkGoogleAccount({ credential, accessToken } = {}, options = {}) {
  const lang = options.lang || 'vi';
  const token = typeof credential === 'string' ? credential.trim() : '';
  const bearer = typeof accessToken === 'string' ? accessToken.trim() : '';

  if (!token) {
    const err = new ApiError('INVALID_GOOGLE_CREDENTIAL', 400);
    err.message = getAuthMessage('INVALID_GOOGLE_CREDENTIAL', lang);
    throw err;
  }

  if (!bearer) {
    const err = new ApiError('UNAUTHENTICATED', 401);
    err.message = getAuthMessage('UNAUTHENTICATED', lang);
    throw err;
  }

  try {
    const data = await request('/auth/google/link', {
      ...options,
      method: 'POST',
      accessToken: bearer,
      body: { credential: token },
      expectedStatus: 200,
    });

    if (!data || data.linked !== true) {
      const err = new ApiError('INVALID_AUTH_RESPONSE', 200);
      err.message = getAuthMessage('INVALID_AUTH_RESPONSE', lang);
      throw err;
    }

    return {
      linked: true,
      code: 'GOOGLE_LINK_SUCCESS',
      message: getAuthMessage('GOOGLE_LINK_SUCCESS', lang),
    };
  } catch (error) {
    if (error.name === 'AbortError') throw error;

    let safeCode = error.code;
    if (
      ['BACKEND_NOT_READY', 'RESOURCE_NOT_FOUND', 'ENDPOINT_NOT_IMPLEMENTED', 'INVALID_RESPONSE'].includes(error.code) ||
      error.status === 404
    ) {
      safeCode = 'GOOGLE_SIGNIN_UNAVAILABLE';
    } else if (error.code === 'INVALID_AUTH_RESPONSE') {
      safeCode = 'INVALID_AUTH_RESPONSE';
    }

    const safeError = new ApiError(safeCode, error.status || 0, { traceId: error.traceId });
    safeError.message = getAuthMessage(safeCode, lang);
    throw safeError;
  }
}
