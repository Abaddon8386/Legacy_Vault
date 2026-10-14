// PS-74 D-API-04/05: caller holds this object in React memory only.
import { readUser } from '../api/contracts.js';
import { ApiError } from '../api/http.js';
export function createSession(result, now = Date.now()) {
  if (typeof result?.accessToken !== 'string' || !result.accessToken.trim() || result.tokenType !== 'Bearer' ||
      !Number.isSafeInteger(result.expiresInSeconds) || result.expiresInSeconds <= 0 ||
      result.expiresInSeconds > Math.floor((Number.MAX_SAFE_INTEGER - now) / 1000)) throw new ApiError('INVALID_AUTH_RESPONSE');
  return { accessToken: result.accessToken, user: readUser(result.user), expiresAt: now + result.expiresInSeconds * 1000 };
}
export const isSessionActive = (session, now = Date.now()) => Boolean(session?.accessToken && session.expiresAt > now);
