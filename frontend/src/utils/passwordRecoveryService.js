import { API_BASE, ApiError } from '../api/http.js';

export function readRecoveryCredential(hash) {
  const params = new URLSearchParams(hash.replace(/^#/, ''));
  const value = params.get('token');
  return params.getAll('token').length === 1 && /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/.test(value || '') ? value : null;
}

async function post(path, body, expectedStatus, { signal, lang = 'vi', fetchFn = globalThis.fetch } = {}) {
  let response;
  try {
    response = await fetchFn(`${API_BASE}/auth/password-recovery/${path}`, {
      method: 'POST', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer', signal,
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'Accept-Language': lang === 'en' ? 'en' : 'vi' },
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (response.status === 204 && expectedStatus === 204) return;
  let data;
  try { data = await response.json(); } catch { throw new ApiError(response.status === 429 ? 'RATE_LIMITED' : 'INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    const passwordError = data?.code === 'VALIDATION_FAILED' && Array.isArray(data.errors) && data.errors.some(item => item.field === 'password');
    throw new ApiError(passwordError ? 'PASSWORD_POLICY' : data?.code || 'RECOVERY_UNAVAILABLE', response.status);
  }
  if (response.status !== expectedStatus || data?.messageKey !== 'auth.recovery.requestAccepted') throw new ApiError('INVALID_RESPONSE', response.status);
}

export const requestPasswordRecovery = ({ email }, options = {}) => post('requests', { email, locale: options.lang === 'en' ? 'en' : 'vi' }, 202, options);
export const resetRecoveredPassword = (credential, { password }, options) => {
  if (!readRecoveryCredential(`#token=${credential || ''}`)) return Promise.reject(new ApiError('RECOVERY_INVALID'));
  return post('reset', { credential, password }, 204, options);
};
