// PS-74 D-API-01/03: public base URL; credentials never belong in VITE_*.
export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
export class ApiError extends Error {
  constructor(code, status = 0, detail = {}) {
    super(code);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.traceId = detail.traceId;
    this.messageKey = detail.messageKey;
    this.fieldErrors = Array.isArray(detail.errors) ? detail.errors : [];
  }
}
export async function request(path, options = {}) {
  const { method = 'GET', body, accessToken, lang = 'vi', signal, fetchFn = globalThis.fetch,
    expectedStatus, cache } = options;
  const headers = { Accept: 'application/json', 'Accept-Language': lang === 'en' ? 'en' : 'vi' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let response;
  try {
    response = await fetchFn(`${API_BASE}${path}`, {
      method, headers, signal, ...(cache ? { cache } : {}), credentials: 'omit', body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('NETWORK_ERROR');
  }
  const fallback = { 400: 'VALIDATION_FAILED', 401: 'UNAUTHENTICATED',
    403: 'ACCESS_DENIED', 404: 'RESOURCE_NOT_FOUND', 409: 'CONFLICT', 422: 'BUSINESS_RULE_FAILED' };
  if (!/application\/(?:[\w.+-]*\+)?json/i.test(response.headers?.get?.('content-type') || '')) {
    throw new ApiError(response.ok ? 'INVALID_RESPONSE' : ([401, 403].includes(response.status) ? fallback[response.status] : 'BACKEND_NOT_READY'), response.status);
  }
  let data;
  try { data = await response.json(); }
  catch { throw new ApiError('INVALID_RESPONSE', response.status); }
  if (!response.ok) {
    throw new ApiError(typeof data?.code === 'string' ? data.code : (fallback[response.status] || 'INTERNAL_ERROR'),
      response.status, { ...data, traceId: data?.traceId || response.headers?.get?.('X-Trace-Id') });
  }
  if (expectedStatus && response.status !== expectedStatus) throw new ApiError('INVALID_RESPONSE', response.status);
  return data;
}
