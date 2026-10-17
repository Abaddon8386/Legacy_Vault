import { ApiError } from '../api/http.js';

/**
 * LegacyVault — Dead Man's Switch (DMS) Owner Cancel Alert Service (PS-24)
 * Jira: PS-24 [FE] Owner Cancel Alert (phối hợp BE PS-33)
 *
 * ARCHITECTURAL CONTEXT & BUSINESS RULES:
 * - PS-24: Owner còn sống có thể hủy cảnh báo trong trạng thái cho phép; có confirm dialog.
 * - Thành công khôi phục trạng thái nghiệp vụ bình thường và không giữ workflow tử vong / intake cũ.
 * - CẤM tự động fallback trạng thái trong môi trường production nếu backend chưa cung cấp capability chính thức.
 * - CẤM coi mọi Promise resolve là thành công; từ chối { status: 'FAILED' }, { success: false }, undefined, null.
 * - isOwner = false luôn luôn bị chặn tuyệt đối, kể cả khi canCancel = true.
 * - Adapter rogue bỏ qua AbortSignal phải bị từ chối ngay khi signal.aborted = true.
 */

export const cancelAlertMessages = {
  vi: {
    buttonLabel: 'Hủy cảnh báo (Tôi vẫn an toàn)',
    buttonSub: 'Xác nhận bạn còn an toàn để dừng quy trình cảnh báo',
    modalTitle: 'Xác nhận hủy cảnh báo hoạt động',
    modalDesc:
      'Hệ thống ghi nhận bạn đã phản hồi an toàn. Thao tác này sẽ hủy chu trình cảnh báo khẩn cấp hiện tại, đưa hệ thống về trạng thái theo dõi bình thường và hủy các quy trình tiếp nhận/xác minh liên quan.',
    confirmQuestion: 'Bạn có chắc chắn muốn hủy cảnh báo này không?',
    confirmBtn: 'Xác nhận hủy cảnh báo',
    confirmingBtn: 'Đang xử lý hủy cảnh báo…',
    cancelBtn: 'Đóng / Giữ nguyên',
    successNotice: 'Đã hủy cảnh báo thành công. Trạng thái theo dõi hoạt động đang được làm mới.',
    unauthorized: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
    forbidden: 'Chỉ chủ sở hữu kho di sản mới có quyền thực hiện thao tác này.',
    invalidStatus:
      'Trạng thái cảnh báo hiện tại không cho phép hủy hoặc đã được xử lý từ trước.',
    networkError: 'Không thể kết nối đến máy chủ LegacyVault. Vui lòng kiểm tra đường truyền.',
    backendNotReady:
      'Tính năng hủy cảnh báo hiện đang được cập nhật trên hệ thống máy chủ. Vui lòng thử lại sau.',
    invalidResponse: 'Dữ liệu phản hồi từ máy chủ không hợp lệ. Vui lòng kiểm tra lại trạng thái.',
    genericError: 'Không thể hoàn tất thao tác hủy cảnh báo lúc này. Vui lòng thử lại sau.',
  },
  en: {
    buttonLabel: "Cancel Alert (I'm Safe)",
    buttonSub: 'Confirm vitality to halt emergency notification workflow',
    modalTitle: 'Confirm Cancel Activity Alert',
    modalDesc:
      'The system will record your safe presence response. This action will cancel the active emergency alert cycle, return the monitor to active surveillance, and discard any pending intake/verification workflows.',
    confirmQuestion: 'Are you sure you want to cancel this activity alert?',
    confirmBtn: 'Confirm Cancel Alert',
    confirmingBtn: 'Processing cancellation…',
    cancelBtn: 'Dismiss / Keep Alert',
    successNotice: 'Activity alert cancelled successfully. Monitoring status is refreshing.',
    unauthorized: 'Your session has expired. Please sign in again.',
    forbidden: 'Only the heritage vault owner is authorized to perform this action.',
    invalidStatus:
      'Current monitor status does not permit alert cancellation or has already been resolved.',
    networkError: 'Unable to connect to LegacyVault server. Please check your network connection.',
    backendNotReady:
      'Cancel alert service is currently being updated on the server. Please try again later.',
    invalidResponse: 'Invalid response data received from server. Please verify monitor status.',
    genericError: 'Unable to complete alert cancellation at this time. Please try again.',
  },
};

/**
 * Validates adapter response structure strictly.
 * Rules:
 * - Must be a non-null object, not an array.
 * - Explicit failure indicators (success: false or cancelled: false) MUST BE REJECTED.
 * - Explicit positive confirmation flags (success: true or cancelled: true) are accepted.
 * - Normalized active vitality statuses ('MONITORING', 'ACTIVE') are accepted.
 * - Any other status strings (such as 'FAILED', 'ERROR', 'TRIGGERED', etc.) ARE REJECTED.
 *
 * @param {any} raw
 * @returns {boolean}
 */
export function isValidCancelAlertResponse(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return false;
  }

  // Explicit failure flags must be rejected immediately
  if (raw.success === false || raw.cancelled === false) {
    return false;
  }

  // Contradictory or unknown status cannot be overridden by a positive flag.
  if (raw.status !== undefined && !['MONITORING', 'ACTIVE'].includes(raw.status)) return false;

  // Explicit affirmative confirmation flags
  if (raw.success === true || raw.cancelled === true) {
    return true;
  }

  // Only recognized normal monitoring statuses are permitted
  const ALLOWED_SUCCESS_STATUSES = ['MONITORING', 'ACTIVE'];
  if (typeof raw.status === 'string' && ALLOWED_SUCCESS_STATUSES.includes(raw.status.trim().toUpperCase())) {
    return true;
  }

  return false;
}

/**
 * Evaluates whether alert cancellation capability is permitted.
 * Rules:
 * 1. isOwner = false ALWAYS returns false, unconditionally overriding any canCancel or customCapability flags.
 * 2. If customCapability callback or boolean is provided via prop/adapter, it is evaluated (only when isOwner = true).
 * 3. Fallback testing capability (checking TRIGGERED / GRACE_PERIOD_EXCEEDED) is STRICTLY limited to non-production
 *    DEV preview mode or isolated test runner. In production, fallback returns false.
 *
 * @param {Object} params
 * @param {string} [params.status] - DMS status ('TRIGGERED', 'MONITORING', etc.)
 * @param {boolean|Function} [params.customCapability] - Explicit capability from props/BE
 * @param {boolean} [params.isOwner=true] - Whether current user is verified owner
 * @param {boolean} [params.isDevPreview=false] - Explicit DEV Preview flag
 * @param {boolean} [params.isTest=false] - Unit test runner flag
 * @param {Object} [params.testEnv] - Environment override for testing
 * @returns {boolean}
 */
export function checkCancelAlertCapability({
  status,
  customCapability,
  isOwner = true,
  isDevPreview = false,
  isTest = false,
  testEnv = {},
} = {}) {
  // Rule 1: Non-owner is strictly forbidden under all circumstances
  if (isOwner === false) {
    return false;
  }

  // Rule 2: Explicit capability from BE/props
  if (typeof customCapability === 'function') {
    try { return customCapability({ status, isOwner: true }) === true; } catch { return false; }
  }

  if (typeof customCapability === 'boolean') {
    return customCapability;
  }

  // Rule 3: Guard against production fallback
  const isViteProd = typeof import.meta !== 'undefined' && Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(testEnv?.PROD);
  if (isViteProd || isTestProd) {
    // In production, capability MUST be explicitly granted by BE contract; no status fallback
    return false;
  }

  // Permitted ONLY in DEV preview or test runner
  const canUseFallback = Boolean(isDevPreview || isTest || testEnv.DEV);
  if (!canUseFallback) {
    return false;
  }

  return status === 'TRIGGERED' || status === 'GRACE_PERIOD_EXCEEDED';
}

/**
 * Executes cancel alert request using provided adapter.
 * Re-evaluates capability immediately prior to network execution.
 * Respects AbortSignal even if adapter is rogue and fails to honor signal.
 * Validates response to ensure non-empty valid payload.
 *
 * @param {Object} options
 * @param {Function} [options.adapter] - Custom adapter: (signal) => Promise<result>
 * @param {AbortSignal} [options.signal] - Abort signal to cancel in-flight request
 * @param {'vi'|'en'} [options.lang='vi'] - UI language
 * @param {Function} [options.onUnauthorized] - 401 callback
 * @param {string} [options.status] - Current DMS status
 * @param {boolean|Function} [options.customCapability] - Capability flag
 * @param {boolean} [options.isOwner=true] - Ownership verification
 * @param {boolean} [options.isDevPreview=false] - DEV Preview flag
 * @param {boolean} [options.isTest=false] - Test runner flag
 * @returns {Promise<Object>}
 */
export async function executeCancelAlert(options = {}) {
  const lang = options.lang || 'vi';
  const msgs = cancelAlertMessages[lang] || cancelAlertMessages.vi;

  // Immediate pre-submit capability verification
  const isAllowed = checkCancelAlertCapability({
    status: options.status,
    customCapability: options.customCapability,
    isOwner: options.isOwner,
    isDevPreview: options.isDevPreview,
    isTest: options.isTest,
    testEnv: options.testEnv,
  });

  if (!isAllowed) {
    const err = new ApiError('FORBIDDEN', 403);
    err.message = msgs.forbidden;
    throw err;
  }

  // Early abort check
  if (options.signal?.aborted) {
    const abortErr = new Error('The operation was aborted');
    abortErr.name = 'AbortError';
    throw abortErr;
  }

  if (typeof options.adapter === 'function') {
    try {
      const result = await options.adapter(options.signal);

      // Check if signal was aborted while adapter was executing (rogue adapter protection)
      if (options.signal?.aborted) {
        const abortErr = new Error('The operation was aborted');
        abortErr.name = 'AbortError';
        throw abortErr;
      }

      // Verify adapter response structure
      if (!isValidCancelAlertResponse(result)) {
        const invalidErr = new ApiError('INVALID_RESPONSE', 500);
        invalidErr.message = msgs.invalidResponse;
        throw invalidErr;
      }

      return result;
    } catch (err) {
      if (options.signal?.aborted) {
        throw Object.assign(new Error('Aborted'), { name: 'AbortError' });
      }
      if (err.name === 'AbortError') {
        throw err;
      }
      if (err.status === 401 || err.code === 'UNAUTHENTICATED' || err.code === 'UNAUTHORIZED') {
        options.onUnauthorized?.();
      }
      throw err;
    }
  }

  // If no adapter provided, endpoint is pending official BE contract agreement
  const pendingError = new ApiError('BACKEND_NOT_READY', 503);
  pendingError.message = msgs.backendNotReady;
  throw pendingError;
}

/**
 * Returns localized message corresponding to error code or fallback
 * @param {string|number} code
 * @param {'vi'|'en'} lang
 * @returns {string}
 */
export function getCancelAlertMessage(code, lang = 'vi') {
  const msgs = cancelAlertMessages[lang] || cancelAlertMessages.vi;

  switch (code) {
    case 'UNAUTHENTICATED':
    case 'UNAUTHORIZED':
    case 401:
      return msgs.unauthorized;
    case 'ACCESS_DENIED':
    case 'FORBIDDEN':
    case 403:
      return msgs.forbidden;
    case 'DMS_NOT_TRIGGERED':
    case 'INVALID_STATUS':
    case 409:
      return msgs.invalidStatus;
    case 'INVALID_RESPONSE':
      return msgs.invalidResponse;
    case 'NETWORK_ERROR':
    case 0:
      return msgs.networkError;
    case 'BACKEND_NOT_READY':
    case 503:
      return msgs.backendNotReady;
    case 'SUCCESS':
      return msgs.successNotice;
    default:
      return msgs.genericError;
  }
}
