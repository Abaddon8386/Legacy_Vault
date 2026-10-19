// D-API-04 (2026-10-19): preserve the current tab's session across reloads.
import { readUser } from '../api/contracts.js';
import { ApiError } from '../api/http.js';
export function createSession(result, now = Date.now()) {
  if (typeof result?.accessToken !== 'string' || !result.accessToken.trim() || result.tokenType !== 'Bearer' ||
      !Number.isSafeInteger(result.expiresInSeconds) || result.expiresInSeconds <= 0 ||
      result.expiresInSeconds > Math.floor((Number.MAX_SAFE_INTEGER - now) / 1000)) throw new ApiError('INVALID_AUTH_RESPONSE');
  return { accessToken: result.accessToken, user: readUser(result.user), expiresAt: now + result.expiresInSeconds * 1000 };
}
export const isSessionActive = (session, now = Date.now()) => Boolean(session?.accessToken && session.expiresAt > now);

const SESSION_KEY = 'legacyvault.session.v1';
export function storeSession(session, storage) {
  try {
    storage ??= window.sessionStorage;
    if (isSessionActive(session)) storage.setItem(SESSION_KEY, JSON.stringify(session));
    else storage.removeItem(SESSION_KEY);
  } catch { /* Storage may be unavailable; the in-memory session still works. */ }
}

export function readStoredSession(storage, now = Date.now()) {
  try {
    storage ??= window.sessionStorage;
    const value = JSON.parse(storage.getItem(SESSION_KEY) || 'null');
    if (!value) return null;
    if (typeof value.accessToken !== 'string' || !value.accessToken.trim() ||
        !Number.isSafeInteger(value.expiresAt) || !isSessionActive(value, now)) throw new Error('Invalid session');
    return { accessToken: value.accessToken, expiresAt: value.expiresAt, user: readUser(value.user) };
  } catch {
    try { storage?.removeItem(SESSION_KEY); } catch { /* Unavailable storage. */ }
    return null;
  }
}
