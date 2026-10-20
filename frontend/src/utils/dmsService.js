import { normalizePreviewScenario, readPreviewSchedule, writePreviewSchedule } from './previewState.js';
import { request, ApiError } from '../api/http.js';
import { isUuid, isUtcDate } from '../api/contracts.js';
/**
 * LegacyVault — Dead Man's Switch (DMS) Service & Validation Adapter (PS-4)
 * Standardized for Jira PS-4: [FE][ST-06–07] Cấu hình và theo dõi DMS
 *
 * ARCHITECTURAL CONTEXT & BUSINESS RULES:
 * - LV-DEATH-001: Missed check-in only indicates a missed vitality check-in signal.
 *   It does NOT prove death, does NOT unlock vault, does NOT decrypt assets,
 *   and does NOT grant beneficiary/trustee access.
 * - PS-74 endpoints:
 *   - GET  /api/v1/dms
 *   - PUT  /api/v1/dms
 *   - POST /api/v1/dms/check-in
 * - Supported DMS statuses: 'MONITORING' (or 'ACTIVE'), 'TRIGGERED', 'GRACE_PERIOD_EXCEEDED', 'DISABLED' / null (unconfigured).
 * - D-API-15: Technical validation requires positive integer (> 0). Official min/max business policy limits are pending formal Backend/BA approval. Default UI preset: 30 days.
 * - D-API-27: Check-in when TRIGGERED is disallowed (rejected with 409 DMS_NOT_MONITORING).
 * - Production builds (import.meta.env.PROD === true) strictly lock out all simulation adapters.
 */

export const DMS_SCENARIOS = [
  { id: 'monitoring', labelVi: 'Đang theo dõi (MONITORING)', labelEn: 'Active Monitoring (MONITORING)' },
  { id: 'not_configured', labelVi: 'Chưa cấu hình (Empty State)', labelEn: 'Not Configured (Empty)' },
  { id: 'triggered', labelVi: 'Quá hạn / Ân hạn (TRIGGERED)', labelEn: 'Triggered (Grace Period)' },
  { id: 'validation_error', labelVi: 'Lỗi xác thực dữ liệu (Validation Error)', labelEn: 'Validation Error' },
  { id: 'beneficiary_required', labelVi: 'HTTP 422: Chưa có người thụ hưởng', labelEn: 'HTTP 422: Beneficiary Required' },
  { id: 'conflict_not_monitoring', labelVi: 'HTTP 409: Không ở trạng thái theo dõi', labelEn: 'HTTP 409: Not Monitoring' },
  { id: 'unauthorized', labelVi: 'Lỗi 401: Hết phiên làm việc (Unauthorized)', labelEn: 'HTTP 401: Session Expired' },
  { id: 'forbidden', labelVi: 'Lỗi 403: Không có quyền truy cập (Forbidden)', labelEn: 'HTTP 403: Access Denied' },
  { id: 'not_found', labelVi: 'Lỗi 404: Không tìm thấy kho / DMS', labelEn: 'HTTP 404: Vault/DMS Not Found' },
  { id: 'network_error', labelVi: 'Lỗi mạng / Mất kết nối (Network Error)', labelEn: 'Network Error / Offline' },
  { id: 'loading', labelVi: 'Đang tải dữ liệu (Loading State)', labelEn: 'Loading Records (Loading)' },
];

export const INTERVAL_PRESETS = [
  { days: 30, labelVi: '30 ngày', labelEn: '30 days' },
  { days: 60, labelVi: '60 ngày', labelEn: '60 days' },
  { days: 90, labelVi: '90 ngày', labelEn: '90 days' },
  { days: 180, labelVi: '180 ngày', labelEn: '180 days' },
];

export const DEFAULT_INTERVAL_DAYS = 30;
export const DEFAULT_GRACE_PERIOD_DAYS = 7;

export const dmsStatusMessages = {
  vi: {
    intervalRequired: 'Vui lòng nhập chu kỳ kiểm tra định kỳ.',
    intervalInteger: 'Chu kỳ kiểm tra phải là một số nguyên ngày.',
    intervalPositive: 'Chu kỳ kiểm tra phải là số nguyên dương lớn hơn 0.',
    intervalMax: 'Chu kỳ kiểm tra không được vượt quá 180 ngày.',
    unauthorized: 'Phiên làm việc đã hết hạn hoặc chưa được xác thực. Vui lòng đăng nhập lại.',
    forbidden: 'Bạn không có quyền truy cập cấu hình giám sát của kho này.',
    notFound: 'Không tìm thấy thông tin cấu hình giám sát của kho di sản.',
    networkError: 'Không thể kết nối đến máy chủ LegacyVault. Vui lòng kiểm tra đường truyền.',
    serverError: 'Máy chủ gặp sự cố nội bộ (HTTP 500). Vui lòng thử lại sau.',
    backendNotReady: 'Dịch vụ giám sát hoạt động (DMS) hiện đang trong quá trình tích hợp máy chủ. Vui lòng thử lại sau.',
    saveSuccess: 'Cấu hình chu kỳ kiểm tra đã được lưu thành công. Thời hạn tiếp theo đã được thiết lập.',
    checkInSuccess: 'Xác nhận hoạt động thành công. Bộ đếm chu kỳ tiếp theo đã được làm mới.',
    notMonitoring: 'Không thể thực hiện check-in vì hệ thống giám sát hiện không ở trạng thái theo dõi bình thường (DMS_NOT_MONITORING).',
    beneficiaryRequired: 'Bạn cần chỉ định ít nhất một người thụ hưởng trước khi kích hoạt giám sát hoạt động (BENEFICIARY_REQUIRED).',
    vaultNotEditable: 'Kho di sản đang ở trạng thái không thể chỉnh sửa cấu hình (VAULT_NOT_EDITABLE).',
  },
  en: {
    intervalRequired: 'Please enter a check-in interval.',
    intervalInteger: 'Check-in interval must be a whole number of days.',
    intervalPositive: 'Check-in interval must be a positive integer greater than 0.',
    intervalMax: 'Check-in interval cannot exceed 180 days.',
    unauthorized: 'Session has expired or authentication is required. Please sign in again.',
    forbidden: 'You do not have permission to access the vitality monitor for this vault.',
    notFound: 'Vitality monitor configuration not found for this vault.',
    networkError: 'Unable to connect to LegacyVault server. Please check your network connection.',
    serverError: 'Internal server error occurred (HTTP 500). Please try again later.',
    backendNotReady: 'Vitality monitoring service (DMS) is currently under server integration. Please try again later.',
    saveSuccess: 'Check-in interval saved successfully. Next deadline has been updated.',
    checkInSuccess: 'Vitality confirmed successfully. Next check-in countdown has been refreshed.',
    notMonitoring: 'Cannot check in because the vitality monitor is not in an active monitoring state (DMS_NOT_MONITORING).',
    beneficiaryRequired: 'You must designate at least one beneficiary before enabling vitality monitoring (BENEFICIARY_REQUIRED).',
    vaultNotEditable: 'The heritage vault is currently not in an editable state (VAULT_NOT_EDITABLE).',
  },
};

/**
 * Technical validation for DMS interval input.
 * Client validation enforces whole positive integer (> 0).
 * Business min/max days are validated by backend configuration (PS-74 D-API-15).
 * @param {number|string} intervalInput
 * @param {'vi'|'en'} lang
 * @returns {Object} validation errors keyed by field
 */
export function validateDmsInterval(intervalInput, lang = 'vi') {
  const msgs = dmsStatusMessages[lang] || dmsStatusMessages.vi;
  const errors = {};
  const raw = String(intervalInput === undefined || intervalInput === null ? '' : intervalInput).trim();

  if (!raw) {
    errors.check_interval_days = msgs.intervalRequired;
    return errors;
  }

  const num = Number(raw);
  if (!Number.isSafeInteger(num) || isNaN(num)) {
    errors.check_interval_days = msgs.intervalInteger;
    return errors;
  }

  if (num <= 0) {
    errors.check_interval_days = msgs.intervalPositive;
  } else if (num > 180) {
    errors.check_interval_days = msgs.intervalMax;
  }

  return errors;
}

/**
 * Format ISO date string into readable local representation
 * @param {string|null|undefined} isoString
 * @param {'vi'|'en'} lang
 * @returns {string}
 */
export function formatDmsDate(isoString, lang = 'vi') {
  if (!isoString) {
    return lang === 'vi' ? 'Chưa xác định' : 'Not set';
  }

  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) {
      return lang === 'vi' ? 'Không hợp lệ' : 'Invalid date';
    }

    if (lang === 'vi') {
      const hours = String(d.getHours()).padStart(2, '0');
      const minutes = String(d.getMinutes()).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      const month = String(d.getMonth() + 1).padStart(2, '0');
      const year = d.getFullYear();
      return `${hours}:${minutes}, ${day}/${month}/${year}`;
    } else {
      return d.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
      });
    }
  } catch {
    return lang === 'vi' ? 'Không hợp lệ' : 'Invalid date';
  }
}

/**
 * Strict Environment & Simulation Gate
 * Rules:
 * 1. If runtime is Production (import.meta.env?.PROD === true or testEnv?.PROD === true),
 *    simulation is 100% UNCONDITIONALLY FORBIDDEN.
 * 2. In non-production runtime (DEV mode or Node test runner):
 *    Simulation is ONLY permitted if:
 *      a) options.isDevPreview === true (explicit DEV Preview toolbar mode with ?preview=true)
 *      OR
 *      b) options.isTest === true (isolated unit test runner)
 * 3. Having options.scenario alone NEVER triggers simulation.
 * 4. Passing options.isDev: true when in production has ZERO EFFECT.
 *
 * @param {Object} options
 * @returns {boolean}
 */
export function isSimulationPermitted(options = {}) {
  if (options.accessToken) return false;
  const isViteProd =
    typeof import.meta !== 'undefined' &&
    Boolean(import.meta.env?.PROD);

  const isTestProd = Boolean(options.testEnv?.PROD);

  if (isViteProd || isTestProd) {
    return false;
  }

  const isDevPreview = Boolean(options.isDevPreview);
  const isTestRunner = Boolean(options.isTest);

  return isDevPreview || isTestRunner;
}

// ============================================================================
// MOCK ADAPTER (Strictly for DEV Preview & isolated test scenarios)
// ============================================================================
export const mockDmsAdapter = {
  fetch(scenario = 'monitoring', lang = 'vi') {
    const msgs = dmsStatusMessages[lang] || dmsStatusMessages.vi;

    switch (scenario) {
      case 'not_configured':
        return null;

      case 'unauthorized': {
        const err = new Error(msgs.unauthorized);
        err.status = 401;
        err.code = 'UNAUTHORIZED';
        throw err;
      }

      case 'forbidden': {
        const err = new Error(msgs.forbidden);
        err.status = 403;
        err.code = 'FORBIDDEN';
        throw err;
      }

      case 'not_found': {
        const err = new Error(msgs.notFound);
        err.status = 404;
        err.code = 'RESOURCE_NOT_FOUND';
        throw err;
      }

      case 'network_error': {
        const err = new Error(msgs.networkError);
        err.status = 0;
        err.code = 'NETWORK_ERROR';
        throw err;
      }

      case 'triggered':
        return {
          vaultId: 'vlt-9c1f0b6e-4a2b',
          status: 'TRIGGERED',
          checkIntervalDays: 30,
          lastCheckInAt: '2026-09-09T08:00:00Z',
          nextCheckAt: '2026-10-09T08:00:00Z',
          triggeredAt: '2026-10-09T08:00:00Z',
          graceDeadline: '2026-10-16T08:00:00Z',
          gracePeriodDays: 7,
          isSimulation: true,
        };

      case 'monitoring':
      case 'active':
      default:
        return {
          vaultId: 'vlt-9c1f0b6e-4a2b',
          status: 'MONITORING',
          checkIntervalDays: 30,
          lastCheckInAt: '2026-10-10T08:00:00Z',
          nextCheckAt: '2026-11-09T08:00:00Z',
          triggeredAt: null,
          graceDeadline: null,
          gracePeriodDays: 7,
          isSimulation: true,
        };
    }
  },

  save(days, scenario = 'monitoring', lang = 'vi') {
    const msgs = dmsStatusMessages[lang] || dmsStatusMessages.vi;

    if (scenario === 'network_error') {
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    if (scenario === 'beneficiary_required') {
      const err = new Error(msgs.beneficiaryRequired);
      err.status = 422;
      err.code = 'BENEFICIARY_REQUIRED';
      throw err;
    }

    if (scenario === 'forbidden') {
      const err = new Error(msgs.vaultNotEditable);
      err.status = 409;
      err.code = 'VAULT_NOT_EDITABLE';
      throw err;
    }

    const now = new Date();
    const nextCheck = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);

    return {
      vaultId: 'vlt-9c1f0b6e-4a2b',
      status: 'MONITORING',
      checkIntervalDays: days,
      lastCheckInAt: now.toISOString(),
      nextCheckAt: nextCheck.toISOString(),
      triggeredAt: null,
      graceDeadline: null,
      gracePeriodDays: 7,
      isSimulation: true,
      message: msgs.saveSuccess,
    };
  },

  checkIn(scenario = 'monitoring', lang = 'vi') {
    const msgs = dmsStatusMessages[lang] || dmsStatusMessages.vi;

    if (scenario === 'triggered' || scenario === 'conflict_not_monitoring') {
      const err = new Error(msgs.notMonitoring);
      err.status = 409;
      err.code = 'DMS_NOT_MONITORING';
      throw err;
    }

    if (scenario === 'network_error') {
      const err = new Error(msgs.networkError);
      err.status = 0;
      err.code = 'NETWORK_ERROR';
      throw err;
    }

    const now = new Date();
    const nextCheck = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

    return {
      vaultId: 'vlt-9c1f0b6e-4a2b',
      status: 'MONITORING',
      checkIntervalDays: 30,
      lastCheckInAt: now.toISOString(),
      nextCheckAt: nextCheck.toISOString(),
      triggeredAt: null,
      graceDeadline: null,
      gracePeriodDays: 7,
      isSimulation: true,
      message: msgs.checkInSuccess,
    };
  },
};

// ============================================================================
// LIVE ADAPTER (Connects to Spring Boot Backend API)
// ============================================================================
export function readDms(raw, options = {}) {
  if (!isUuid(raw?.ownerId) || (options.ownerId && raw.ownerId !== options.ownerId) ||
      !['MONITORING', 'TRIGGERED', 'GRACE_PERIOD_EXCEEDED'].includes(raw.status) ||
      !Number.isSafeInteger(raw.checkIntervalDays) || raw.checkIntervalDays <= 0 ||
      !Number.isSafeInteger(raw.gracePeriodDays) || raw.gracePeriodDays <= 0 || !isUtcDate(raw.nextCheckAt) ||
      ['lastCheckInAt', 'triggeredAt', 'graceDeadline', 'updatedAt'].some(key => raw[key] != null && !isUtcDate(raw[key]))) {
    throw new ApiError('INVALID_RESPONSE');
  }
  return { ownerId: raw.ownerId, status: raw.status, checkIntervalDays: raw.checkIntervalDays,
    gracePeriodDays: raw.gracePeriodDays, nextCheckAt: raw.nextCheckAt,
    lastCheckInAt: raw.lastCheckInAt ?? null, triggeredAt: raw.triggeredAt ?? null,
    graceDeadline: raw.graceDeadline ?? null, updatedAt: raw.updatedAt ?? null, isSimulation: false };
}
export const liveDmsAdapter = {
  async fetch(options = {}) {
    try { return readDms(await request('/dms', { ...options, expectedStatus: 200 }), options); }
    catch (error) { if (error.status === 404 && error.code === 'RESOURCE_NOT_FOUND') return null; throw error; }
  },
  async save(days, options = {}) {
    const result = readDms(await request('/dms', { ...options, method: 'PUT', expectedStatus: 200,
      body: { checkIntervalDays: days } }), options);
    if (result.status !== 'MONITORING') throw new ApiError('INVALID_RESPONSE');
    return result;
  },
  async checkIn(options = {}) {
    const result = readDms(await request('/dms/check-in', { ...options, method: 'POST', expectedStatus: 200 }), options);
    if (result.status !== 'MONITORING') throw new ApiError('INVALID_RESPONSE');
    return result;
  },
};
export function getDmsMessage(code, lang = 'vi') {
  const vi = { SAVED: 'Đã lưu chu kỳ kiểm tra.', CHECKED_IN: 'Đã xác nhận hoạt động và cập nhật lịch kiểm tra.',
    BENEFICIARY_REQUIRED: 'Hãy khai báo ít nhất một người thụ hưởng trước khi bật giám sát.',
    DMS_NOT_MONITORING: 'Chỉ có thể check-in khi đang theo dõi hoạt động.',
    VAULT_NOT_EDITABLE: 'Kho di sản hiện không cho phép thay đổi.',
    UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
    ACCESS_DENIED: 'Bạn không có quyền thực hiện thao tác này.',
    VALIDATION_FAILED: 'Chu kỳ kiểm tra không được máy chủ chấp nhận.' };
  const en = { SAVED: 'Check-in interval saved.', CHECKED_IN: 'Activity confirmed and next check updated.',
    BENEFICIARY_REQUIRED: 'Add at least one beneficiary before enabling monitoring.',
    DMS_NOT_MONITORING: 'Check-in is only available while monitoring.',
    VAULT_NOT_EDITABLE: 'This vault currently cannot be changed.',
    UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
    ACCESS_DENIED: 'You do not have permission to perform this action.',
    VALIDATION_FAILED: 'The check-in interval was rejected by the server.' };
  return (lang === 'en' ? en : vi)[code] || (lang === 'en' ? 'Unable to complete the request. Please try again.' : 'Không thể hoàn tất yêu cầu. Vui lòng thử lại.');
}

/**
 * Fetch DMS configuration and monitor status for authenticated owner
 * @param {Object} options - { scenario, isDevPreview, isTest, testEnv, lang, fetchFn, vaultId }
 * @returns {Promise<Object|null>}
 */
export async function fetchDmsConfig(options = {}) {
  const lang = options.lang || 'vi';

  if (isSimulationPermitted(options)) {
    await new Promise((resolve) => setTimeout(resolve, 350));
    const scenario = normalizePreviewScenario(options.scenario);
    return options.isTest ? mockDmsAdapter.fetch(scenario, lang) : readPreviewSchedule(scenario, key => mockDmsAdapter.fetch(key, lang));
  }

  return liveDmsAdapter.fetch(options);
}

/**
 * Save / Update DMS configuration
 * @param {Object} input - { check_interval_days } or { checkIntervalDays }
 * @param {Object} options - { scenario, isDevPreview, isTest, testEnv, lang, fetchFn, vaultId }
 * @returns {Promise<Object>}
 */
export async function saveDmsConfig(input = {}, options = {}) {
  const lang = options.lang || 'vi';
  const rawDays = input.check_interval_days !== undefined ? input.check_interval_days : input.checkIntervalDays;

  const errors = validateDmsInterval(rawDays, lang);
  if (Object.keys(errors).length > 0) {
    const err = new Error(
      lang === 'vi'
        ? 'Dữ liệu cấu hình chu kỳ không hợp lệ. Vui lòng kiểm tra lại.'
        : 'Invalid check-in interval data. Please verify your inputs.'
    );
    err.status = 400;
    err.code = 'VALIDATION_FAILED';
    err.fieldErrors = errors;
    throw err;
  }

  const days = Number(rawDays);

  if (isSimulationPermitted(options)) {
    await new Promise((resolve) => setTimeout(resolve, 450));
    const scenario = normalizePreviewScenario(options.scenario);
    const updated = mockDmsAdapter.save(days, scenario, lang);
    return options.isTest ? updated : writePreviewSchedule(scenario, updated);
  }

  return liveDmsAdapter.save(days, options);
}

/**
 * Execute DMS vitality check-in for authenticated owner
 * @param {Object} options - { scenario, isDevPreview, isTest, testEnv, lang, fetchFn, vaultId }
 * @returns {Promise<Object>}
 */
export async function checkInDms(options = {}) {
  const lang = options.lang || 'vi';

  if (isSimulationPermitted(options)) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const scenario = normalizePreviewScenario(options.scenario);
    const current = options.isTest ? null : readPreviewSchedule(scenario, key => mockDmsAdapter.fetch(key, lang));
    const updated = mockDmsAdapter.checkIn(scenario, lang);
    if (current?.checkIntervalDays) {
      updated.checkIntervalDays = current.checkIntervalDays;
      updated.nextCheckAt = new Date(Date.parse(updated.lastCheckInAt) + current.checkIntervalDays * 86400000).toISOString();
    }
    return options.isTest ? updated : writePreviewSchedule(scenario, updated);
  }

  return liveDmsAdapter.checkIn(options);
}
