// PS-74 D-API-01/03: public base URL; credentials never belong in VITE_*.
/**
 * Địa chỉ gốc của API (mặc định {@code /api/v1}, Vite proxy sang backend {@code http://localhost:8080}).
 * Có thể đổi bằng biến môi trường {@code VITE_API_BASE_URL}; dấu {@code /} cuối được bỏ. Không bao giờ đặt thông tin bí mật vào biến {@code VITE_*}.
 */
export const API_BASE = (import.meta.env?.VITE_API_BASE_URL || '/api/v1').replace(/\/$/, '');
/**
 * Lỗi chuẩn của lớp gọi API. Thông điệp ({@code message}) chính là mã lỗi.
 *
 * Các trường:
 * - {@code code}: mã lỗi công khai của backend (tên enum {@code ErrorCode}) hoặc mã nội bộ như {@code NETWORK_ERROR}, {@code INVALID_RESPONSE}.
 * - {@code status}: mã HTTP (0 nếu chưa có phản hồi).
 * - {@code traceId}: mã truy vết do backend trả (hoặc header {@code X-Trace-Id}).
 * - {@code messageKey}: khóa thông điệp i18n phía backend.
 * - {@code fieldErrors}: danh sách lỗi theo trường (từ {@code errors} trong JSON lỗi).
 */
export class ApiError extends Error {
  /**
   * Tạo ApiError.
   * @param {string} code Mã lỗi.
   * @param {number} [status=0] Mã HTTP.
   * @param {{traceId?:string, messageKey?:string, errors?:Array}} [detail={}] Chi tiết lỗi từ backend.
   */
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
/**
 * Hàm gọi API dùng chung cho toàn bộ frontend (mọi service trong {@code utils/*Service.js} và {@code services/} đều đi qua đây).
 *
 * Các bước: dựng header ({@code Accept}, {@code Accept-Language} vi/en, {@code Content-Type} khi có body, {@code Authorization: Bearer}
 * khi có token) -> gọi {@code fetch} tới {@code API_BASE + path} với {@code credentials: omit} -> kiểm tra phản hồi là JSON ->
 * parse JSON -> nếu HTTP lỗi thì ném {@link ApiError} mang mã lỗi của backend; nếu không có mã thì suy ra từ status
 * (400 VALIDATION_FAILED, 401 UNAUTHENTICATED, 403 ACCESS_DENIED, 404 RESOURCE_NOT_FOUND, 409 CONFLICT, 422 BUSINESS_RULE_FAILED).
 *
 * @param {string} path Đường dẫn tương đối so với {@code API_BASE}, ví dụ {@code /vaults}.
 * @param {object} [options] Tùy chọn: {@code method} (mặc định GET), {@code body} (object, được JSON.stringify), {@code accessToken},
 * {@code lang} ("vi" | "en"), {@code signal} (AbortSignal), {@code fetchFn} (để test), {@code expectedStatus} (ép đúng mã thành công), {@code cache}.
 * @returns {Promise<*>} Dữ liệu JSON của phản hồi.
 * @throws {ApiError} {@code NETWORK_ERROR} (mất mạng), {@code INVALID_RESPONSE} (không phải JSON/sai status mong đợi),
 * {@code BACKEND_NOT_READY} (lỗi không phải JSON), hoặc mã lỗi nghiệp vụ của backend. {@code AbortError} được ném lại nguyên vẹn.
 */
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
  catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError(error instanceof TypeError ? 'NETWORK_ERROR' : 'INVALID_RESPONSE', response.status);
  }
  if (!response.ok) {
    throw new ApiError(typeof data?.code === 'string' ? data.code : (fallback[response.status] || 'INTERNAL_ERROR'),
      response.status, { ...data, traceId: data?.traceId || response.headers?.get?.('X-Trace-Id') });
  }
  if (expectedStatus && response.status !== expectedStatus) throw new ApiError('INVALID_RESPONSE', response.status);
  return data;
}
