// How long before the access token expires the user is warned. The token lasts one hour and cannot be renewed
// from the browser, so the warning is the only chance to save work before the automatic sign-out.
export const SESSION_WARNING_MS = 5 * 60 * 1000;

// Returns null when no warning is due, otherwise the minutes left (rounded up, at least 1) and whether it is the last minute.
export function sessionExpiryState(expiresAt, now = Date.now(), warningMs = SESSION_WARNING_MS) {
  if (!Number.isSafeInteger(expiresAt)) return null;
  const remaining = expiresAt - now;
  if (remaining <= 0 || remaining > warningMs) return null;
  return { minutes: Math.max(1, Math.ceil(remaining / 60000)), lastMinute: remaining <= 60000 };
}
