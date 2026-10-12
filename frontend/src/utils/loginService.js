/**
 * LegacyVault — Authentication & Login Service Interface (PS-2)
 *
 * ARCHITECTURAL BOUNDARY & SAFETY COMPLIANCE:
 * - Official backend auth implementation follows PS-10 / PS-74 contracts.
 * - In accordance with PS-2 safety requirements:
 *     1. Never treat HTTP 200 as successful if response is HTML (Vite SPA fallback),
 *        empty JSON, or missing required authentication fields.
 *     2. Validate proposed PS-74 Login Response schema (accessToken, tokenType, expiresInSeconds, user).
 *     3. No plain-text passwords or secret keys are logged or persisted.
 *     4. No artificial/fabricated JWT tokens or sessions are stored in storage.
 *     5. DEV Preview simulation works strictly separately under ?preview=true in DEV mode.
 */

export const PREVIEW_SCENARIOS = [
  { id: 'success', labelVi: 'Mô phỏng đăng nhập thành công (DEV)', labelEn: 'Simulated Login Success (DEV)' },
  { id: 'unauthorized', labelVi: 'HTTP 401: Sai mật khẩu / Email', labelEn: 'HTTP 401: Invalid Credentials' },
  { id: 'session_expired', labelVi: 'HTTP 401: Phiên làm việc hết hạn', labelEn: 'HTTP 401: Session Expired' },
  { id: 'account_locked', labelVi: 'HTTP 403: Tài khoản bị khóa tạm thời', labelEn: 'HTTP 403: Account Locked' },
  { id: 'server_error', labelVi: 'HTTP 500: Lỗi máy chủ nội bộ', labelEn: 'HTTP 500: Server Internal Error' },
  { id: 'network_error', labelVi: 'Lỗi kết nối (Network Error / Offline)', labelEn: 'Network Error / Offline' },
];

export const authStatusMessages = {
  vi: {
    SIMULATED_SUCCESS: 'Mô phỏng đăng nhập thành công (Chế độ DEV Preview). Hệ thống chưa kích hoạt phiên đăng nhập thực tế.',
    INVALID_CREDENTIALS: 'Địa chỉ email hoặc mật khẩu không chính xác. Vui lòng kiểm tra lại.',
    UNAUTHENTICATED: 'Phiên làm việc chưa được xác thực hoặc đã hết hạn. Vui lòng đăng nhập lại.',
    SESSION_EXPIRED: 'Phiên làm việc trước đó đã hết hạn. Vui lòng đăng nhập lại để tiếp tục.',
    ACCESS_DENIED: 'Tài khoản không có quyền truy cập hoặc tạm thời bị khóa. Vui lòng liên hệ quản trị viên.',
    ACCOUNT_LOCKED: 'Tài khoản tạm thời bị khóa do nhiều lần thử không thành công. Vui lòng liên hệ quản trị viên.',
    ENDPOINT_NOT_IMPLEMENTED: 'Dịch vụ đăng nhập hiện chưa sẵn sàng trên máy chủ (API đang trong quá trình tích hợp). Vui lòng thử lại sau.',
    RESOURCE_NOT_FOUND: 'Không tìm thấy tài nguyên yêu cầu trên máy chủ.',
    VALIDATION_FAILED: 'Thông tin đăng nhập không hợp lệ theo quy tắc hệ thống.',
    INTERNAL_ERROR: 'Máy chủ gặp sự cố nội bộ. Vui lòng thử lại sau.',
    NETWORK_ERROR: 'Không thể kết nối đến máy chủ xác thực. Vui lòng kiểm tra kết nối mạng hoặc thử lại sau.',
    SERVICE_UNAVAILABLE: 'Dịch vụ xác thực tạm thời không thể kết nối. Vui lòng thử lại sau.',
    INVALID_AUTH_RESPONSE: 'Phản hồi xác thực từ máy chủ không đúng định dạng quy chuẩn. Vui lòng thử lại sau.',
    SUCCESS: 'Đăng nhập thành công.',
  },
  en: {
    SIMULATED_SUCCESS: 'Simulated login successful (DEV Preview Mode). Real authentication session is not activated.',
    INVALID_CREDENTIALS: 'Invalid email address or password. Please try again.',
    UNAUTHENTICATED: 'Session is unauthenticated or has expired. Please sign in again.',
    SESSION_EXPIRED: 'Your previous session has expired. Please sign in again to continue.',
    ACCESS_DENIED: 'Access denied or account is temporarily locked. Please contact support.',
    ACCOUNT_LOCKED: 'Account is temporarily locked due to excessive failed attempts. Please contact support.',
    ENDPOINT_NOT_IMPLEMENTED: 'Login service is currently unavailable on the server (API integration in progress). Please try again later.',
    RESOURCE_NOT_FOUND: 'Requested resource was not found on the server.',
    VALIDATION_FAILED: 'Login information does not meet system validation rules.',
    INTERNAL_ERROR: 'Internal server error occurred. Please try again later.',
    NETWORK_ERROR: 'Unable to connect to the authentication server. Please check your network connection or try again later.',
    SERVICE_UNAVAILABLE: 'Authentication service temporarily unavailable. Please try again later.',
    INVALID_AUTH_RESPONSE: 'Authentication response from server has an invalid format. Please try again later.',
    SUCCESS: 'Login successful.',
  },
};

/**
 * Get translated message for a status/error code.
 * @param {string} code
 * @param {string} lang
 * @returns {string}
 */
export function getAuthMessage(code, lang = 'vi') {
  const dictionary = authStatusMessages[lang] || authStatusMessages.vi;
  return dictionary[code] || dictionary.INTERNAL_ERROR;
}

/**
 * Validate that response matches the proposed PS-74 Login Response schema:
 * {
 *   accessToken: string,
 *   tokenType: string,
 *   expiresInSeconds: number,
 *   user: { id, email, fullName, roles }
 * }
 * @param {any} data
 * @returns {boolean}
 */
export function isValidLoginResponse(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return false;
  }
  const hasToken = typeof data.accessToken === 'string' && data.accessToken.trim().length > 0;
  const hasTokenType = typeof data.tokenType === 'string' && data.tokenType.trim().length > 0;
  const hasExpires = typeof data.expiresInSeconds === 'number' && !Number.isNaN(data.expiresInSeconds);
  const hasUser = Boolean(data.user && typeof data.user === 'object' && !Array.isArray(data.user));

  return Boolean(hasToken && hasTokenType && hasExpires && hasUser);
}

/**
 * Execute login in preview/development mode or via backend API when configured.
 * @param {Object} credentials - { email, password }
 * @param {Object} options - { scenario: string, isDevPreview: boolean, lang: 'vi'|'en', fetchFn: function, isTest: boolean }
 * @returns {Promise<Object>} resolved login result
 */
export async function authenticateUser({ email, password: _password }, options = {}) {
  // Void password reference in simulation to prevent secret leakage
  void _password;
  const scenario = options.scenario;
  const lang = options.lang || 'vi';
  const isDevPreview = Boolean(options.isDevPreview);
  const isTest = typeof window === 'undefined' || Boolean(options.isTest);

  // Chế độ mô phỏng chỉ hoạt động khi có isDevPreview (DEV mode + ?preview=true) hoặc trong test runner có scenario
  if ((isDevPreview || isTest) && scenario) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    switch (scenario) {
      case 'unauthorized': {
        const err = new Error(getAuthMessage('INVALID_CREDENTIALS', lang));
        err.status = 401;
        err.code = 'INVALID_CREDENTIALS';
        throw err;
      }

      case 'session_expired': {
        const err = new Error(getAuthMessage('SESSION_EXPIRED', lang));
        err.status = 401;
        err.code = 'SESSION_EXPIRED';
        throw err;
      }

      case 'account_locked': {
        const err = new Error(getAuthMessage('ACCOUNT_LOCKED', lang));
        err.status = 403;
        err.code = 'ACCOUNT_LOCKED';
        throw err;
      }

      case 'server_error': {
        const err = new Error(getAuthMessage('INTERNAL_ERROR', lang));
        err.status = 500;
        err.code = 'INTERNAL_ERROR';
        throw err;
      }

      case 'network_error': {
        const err = new Error(getAuthMessage('NETWORK_ERROR', lang));
        err.status = 0;
        err.code = 'NETWORK_ERROR';
        throw err;
      }

      case 'success':
      default: {
        return {
          status: 200,
          user: {
            email: (email || '').trim(),
            role: 'VAULT_OWNER',
            displayName: (email || '').split('@')[0],
          },
          code: 'SIMULATED_SUCCESS',
          message: getAuthMessage('SIMULATED_SUCCESS', lang),
          isSimulation: true,
        };
      }
    }
  }

  // Chế độ bình thường: Gọi trực tiếp Backend API
  const activeFetch = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  if (!activeFetch) {
    const err = new Error(getAuthMessage('NETWORK_ERROR', lang));
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    throw err;
  }

  try {
    const response = await activeFetch('/api/v1/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        email: (email || '').trim(),
        password: _password,
      }),
    });

    const contentType = response.headers?.get?.('content-type') || '';
    const isJson = contentType.includes('application/json');

    // 1. Nếu phản hồi là HTML (Vite SPA fallback hoặc route Backend chưa tồn tại),
    // kể cả khi HTTP status là 200 hay 404
    if (!isJson) {
      const err = new Error(getAuthMessage('ENDPOINT_NOT_IMPLEMENTED', lang));
      err.status = response.status;
      err.code = 'ENDPOINT_NOT_IMPLEMENTED';
      throw err;
    }

    let errorData = null;
    try {
      errorData = await response.json();
    } catch {
      // JSON hỏng / không parse được
      const err = new Error(getAuthMessage('INVALID_AUTH_RESPONSE', lang));
      err.status = response.status;
      err.code = 'INVALID_AUTH_RESPONSE';
      throw err;
    }

    if (!response.ok) {
      // 1. Phân biệt HTTP 404: Endpoint chưa triển khai vs Tài nguyên không tìm thấy
      if (response.status === 404) {
        if (errorData?.code === 'RESOURCE_NOT_FOUND') {
          const err = new Error(
            errorData.message || getAuthMessage('RESOURCE_NOT_FOUND', lang)
          );
          err.status = 404;
          err.code = 'RESOURCE_NOT_FOUND';
          err.traceId = errorData.traceId;
          throw err;
        }

        const err = new Error(getAuthMessage('ENDPOINT_NOT_IMPLEMENTED', lang));
        err.status = 404;
        err.code = 'ENDPOINT_NOT_IMPLEMENTED';
        throw err;
      }

      // 2. HTTP 401: Sai credentials hoặc phiên hết hạn (PS-74)
      if (response.status === 401) {
        const code = errorData?.code === 'UNAUTHENTICATED' ? 'UNAUTHENTICATED' : 'INVALID_CREDENTIALS';
        const err = new Error(getAuthMessage(code, lang));
        err.status = 401;
        err.code = code;
        err.traceId = errorData?.traceId;
        throw err;
      }

      // 3. HTTP 403: Thiếu quyền truy cập / Tài khoản bị khóa (PS-74)
      if (response.status === 403) {
        const err = new Error(getAuthMessage('ACCESS_DENIED', lang));
        err.status = 403;
        err.code = errorData?.code || 'ACCESS_DENIED';
        err.traceId = errorData?.traceId;
        throw err;
      }

      // 4. HTTP 400: Dữ liệu không hợp lệ (VALIDATION_FAILED)
      if (response.status === 400) {
        const msg = errorData?.message || getAuthMessage('VALIDATION_FAILED', lang);
        const err = new Error(msg);
        err.status = 400;
        err.code = errorData?.code || 'VALIDATION_FAILED';
        err.traceId = errorData?.traceId;
        err.errors = errorData?.errors;
        throw err;
      }

      // 5. HTTP 500: Lỗi nội bộ máy chủ (INTERNAL_ERROR - không lộ thông tin nhạy cảm)
      if (response.status === 500) {
        const err = new Error(getAuthMessage('INTERNAL_ERROR', lang));
        err.status = 500;
        err.code = 'INTERNAL_ERROR';
        err.traceId = errorData?.traceId;
        throw err;
      }

      // 6. Các mã lỗi HTTP khác
      const err = new Error(getAuthMessage('SERVICE_UNAVAILABLE', lang));
      err.status = response.status;
      err.code = errorData?.code || 'SERVICE_UNAVAILABLE';
      err.traceId = errorData?.traceId;
      throw err;
    }

    // Response là HTTP 200 OK: Bắt buộc kiểm tra cấu trúc Login Response theo PS-74
    if (!isValidLoginResponse(errorData)) {
      const err = new Error(getAuthMessage('INVALID_AUTH_RESPONSE', lang));
      err.status = 200;
      err.code = 'INVALID_AUTH_RESPONSE';
      throw err;
    }

    return {
      status: 200,
      user: errorData.user,
      tokenType: errorData.tokenType,
      expiresInSeconds: errorData.expiresInSeconds,
      code: 'SUCCESS',
      message: getAuthMessage('SUCCESS', lang),
      isSimulation: false,
    };
  } catch (error) {
    if (error.status !== undefined) {
      throw error;
    }
    // Lỗi mạng hoặc server không phản hồi
    const err = new Error(getAuthMessage('NETWORK_ERROR', lang));
    err.status = 0;
    err.code = 'NETWORK_ERROR';
    throw err;
  }
}