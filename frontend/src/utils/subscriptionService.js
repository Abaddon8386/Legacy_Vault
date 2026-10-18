import { request, ApiError } from '../api/http.js';

/**
 * LegacyVault — Subscription Management Service & Adapter (CR-01)
 *
 * ARCHITECTURAL CONTEXT & BUSINESS RULES:
 * - Aligned with docs/SUBSCRIPTION-PLANS.md (D-PKG-01).
 * - Lifetime Single Vault Rule (D-PKG-01): Every account is permitted at most 1 vault
 *   across its entire lifetime. Closing, archiving, or soft-deleting a vault does not grant
 *   permission to create a new vault.
 * - 3 Defined Plans:
 *   1. BASIC (Cơ bản): Free, 1 vault, 5 assets, 100 MB storage, 10 MB/file.
 *   2. STANDARD (Tiêu chuẩn): 29,000 VND/mo, 1 vault, 50 assets, 1 GB storage, 10 MB/file.
 *   3. EXTENDED (Mở rộng): 59,000 VND/mo, 1 vault, 200 assets, 5 GB storage, 10 MB/file.
 * - Production builds (import.meta.env.PROD === true) strictly lock out all simulation adapters.
 * - Live mode calls proposed endpoint /api/v1/subscriptions/me.
 * - If backend endpoint is not yet ready, falls back safely to BACKEND_NOT_READY without fabricating live data.
 */

import { SUBSCRIPTION_PLANS } from './subscriptionPlans.js';
export { SUBSCRIPTION_PLANS } from './subscriptionPlans.js';

export const SUBSCRIPTION_SCENARIOS = [
  { id: 'active_basic', labelVi: 'Gói Cơ bản (Hoạt động bình thường)', labelEn: 'Basic Plan (Active Normal)' },
  { id: 'active_standard', labelVi: 'Gói Tiêu chuẩn (Dùng thử nghiệm)', labelEn: 'Standard Plan (Active Trial)' },
  { id: 'active_extended', labelVi: 'Gói Mở rộng (Dùng thử nghiệm)', labelEn: 'Extended Plan (Active Trial)' },
  { id: 'near_quota', labelVi: 'Sắp hết hạn mức (98% dung lượng)', labelEn: 'Near Quota Limit (98% Storage)' },
  { id: 'empty', labelVi: 'Chưa có thông tin gói (Empty State)', labelEn: 'No Subscription (Empty State)' },
  { id: 'loading', labelVi: 'Đang tải dữ liệu (Loading State)', labelEn: 'Loading State' },
  { id: 'unauthorized', labelVi: 'Lỗi 401: Hết phiên làm việc (Unauthorized)', labelEn: 'HTTP 401: Unauthorized' },
  { id: 'forbidden', labelVi: 'Lỗi 403: Không có quyền truy cập (Forbidden)', labelEn: 'HTTP 403: Forbidden' },
  { id: 'network_error', labelVi: 'Lỗi mạng / Mất kết nối (Network Error)', labelEn: 'Network Error / Offline' },
  { id: 'backend_not_ready', labelVi: 'Dịch vụ chưa sẵn sàng (Pending)', labelEn: 'Service Unavailable (Pending)' },
];

export const subscriptionMessages = {
  vi: {
    title: 'Gói Sử Dụng & Hạn Mức',
    subtitle: 'Quản lý thông tin gói cước, hạn mức tài sản số và dung lượng lưu trữ của kho di sản.',
    currentPlanBadge: 'Gói hiện tại',
    lifetimeRuleNotice: 'Lưu ý: Mỗi tài khoản sở hữu duy nhất 1 kho di sản trong suốt vòng đời. Việc nâng hoặc hạ gói không làm thay đổi kho và dữ liệu hiện có.',
    trialGrantNotice: 'Tài khoản đang được kích hoạt gói dùng thử nghiệm.',
    usageSectionTitle: 'Mức Độ Sử Dụng Hạn Mức',
    assetsUsage: 'Số lượng tài sản',
    storageUsage: 'Dung lượng lưu trữ',
    vaultsUsage: 'Số lượng kho di sản',
    vaultsUsageDesc: '1/1 Kho (Cố định trọn đời tài khoản)',
    expiryDate: 'Thời hạn gói',
    lifetimeExpiry: 'Vĩnh viễn',
    plansComparisonTitle: 'Bảng So Sánh Các Gói Dịch Vụ',
    plansComparisonDesc: 'Thông tin so sánh hạn mức tài sản và dung lượng lưu trữ giữa các gói.',
    currentPlanBtn: 'Đang sử dụng',
    unauthorized: 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.',
    forbidden: 'Bạn không có quyền truy cập thông tin gói dịch vụ.',
    notFound: 'Chưa tải được thông tin gói dịch vụ. Vui lòng thử lại sau.',
    networkError: 'Không thể kết nối đến máy chủ LegacyVault. Vui lòng kiểm tra kết nối mạng.',
    policyPending: 'Gói sử dụng đang chờ thống nhất chính sách. Tài khoản chưa được áp dụng các hạn mức gói đề xuất.',
    backendNotReady: 'Dịch vụ thông tin gói hiện chưa sẵn sàng. Vui lòng thử lại sau.',
    devSimulationBadge: 'MÔ PHỎNG DEV PREVIEW — DỮ LIỆU THỬ NGHIỆM',
  },
  en: {
    title: 'Subscription Plans & Quotas',
    subtitle: 'Manage your active subscription plan, digital asset quotas, and vault storage limits.',
    currentPlanBadge: 'Current Plan',
    lifetimeRuleNotice: 'Important notice: Each account is permitted strictly 1 heritage vault across its lifetime. Upgrading, downgrading, or expiration preserves your existing vault and records.',
    trialGrantNotice: 'Account is currently active with a trial grant.',
    usageSectionTitle: 'Current Usage & Limits',
    assetsUsage: 'Assets count',
    storageUsage: 'Storage space',
    vaultsUsage: 'Heritage vaults count',
    vaultsUsageDesc: '1/1 Vault (Fixed across account lifetime)',
    expiryDate: 'Plan expiration',
    lifetimeExpiry: 'Lifetime / Permanent',
    plansComparisonTitle: 'Compare Subscription Tiers',
    plansComparisonDesc: 'Comparative overview of asset and document storage capacities across tiers.',
    currentPlanBtn: 'Current Plan',
    unauthorized: 'Your session has expired. Please sign in again.',
    forbidden: 'You do not have permission to view subscription details.',
    notFound: 'Unable to load subscription details. Please try again later.',
    networkError: 'Unable to connect to LegacyVault server. Please check your network connection.',
    policyPending: 'Subscription policy is pending agreement. Proposed plan limits are not currently applied to your account.',
    backendNotReady: 'Subscription service is currently unavailable. Please try again later.',
    devSimulationBadge: 'DEV PREVIEW SIMULATION — TEST DATA ONLY',
  },
};

/**
 * Formats byte values into human-readable MB / GB
 * @param {number} bytes
 * @returns {string}
 */
export function formatStorageBytes(bytes = 0) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1) {
    return `${gb.toFixed(gb % 1 === 0 ? 0 : 1)} GB`;
  }
  const mb = bytes / (1024 * 1024);
  return `${mb.toFixed(mb % 1 === 0 ? 0 : 1)} MB`;
}

/**
 * Checks whether simulation is permitted
 * @param {Object} options
 * @returns {boolean}
 */
export function isSimulationPermitted(options = {}) {
  if (options?.accessToken) return false;
  const isViteProd =
    typeof import.meta !== 'undefined' &&
    Boolean(import.meta.env?.PROD);
  const isTestProd = Boolean(options?.testEnv?.PROD);

  if (isViteProd || isTestProd) {
    return false;
  }
  return Boolean(options?.isDevPreview || options?.isTest || options?.testEnv);
}

/**
 * Normalizes and validates subscription payload
 * @param {Object} raw
 * @returns {Object}
 */
export function readSubscription(raw) {
  const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) invalid();
  const matchedPlan = SUBSCRIPTION_PLANS.find((p) => p.code === raw.planCode);
  if (!matchedPlan || typeof raw.status !== 'string' || !/^[A-Z_]{1,32}$/.test(raw.status)) invalid();
  for (const key of ['assetsUsed', 'storageUsedBytes', 'vaultsCreatedLifetime']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] < 0) invalid();
  }
  for (const key of ['maxAssets', 'maxStorageBytes']) {
    if (!Number.isSafeInteger(raw[key]) || raw[key] <= 0) invalid();
  }
  if (raw.maxVaultsLifetime !== 1 || raw.vaultsCreatedLifetime > 1) invalid();
  if (!Object.hasOwn(raw, 'expiresAt') || (raw.expiresAt !== null &&
      (typeof raw.expiresAt !== 'string' || !Number.isFinite(Date.parse(raw.expiresAt))))) invalid();
  if (raw.isTrialGrant !== undefined && typeof raw.isTrialGrant !== 'boolean') invalid();
  return {
    subscriptionId: typeof raw.subscriptionId === 'string' ? raw.subscriptionId : null,
    planCode: matchedPlan.code,
    planNameVi: matchedPlan.nameVi,
    planNameEn: matchedPlan.nameEn,
    status: raw.status,
    isTrialGrant: raw.isTrialGrant === true,
    grantedBy: typeof raw.grantedBy === 'string' ? raw.grantedBy : null,
    expiresAt: raw.expiresAt,
    assetsUsed: raw.assetsUsed,
    maxAssets: raw.maxAssets,
    storageUsedBytes: raw.storageUsedBytes,
    maxStorageBytes: raw.maxStorageBytes,
    vaultsCreatedLifetime: raw.vaultsCreatedLifetime,
    maxVaultsLifetime: raw.maxVaultsLifetime,
    isSimulation: raw.isSimulation === true,
  };
}

// Proposed adapter shape, pending FE/BE agreement. Mock quotas are never live defaults.
function readMockSubscription(raw) {
  const plan = SUBSCRIPTION_PLANS.find((p) => p.code === raw.planCode);
  return readSubscription({ maxAssets: plan.maxAssets, maxStorageBytes: plan.maxStorageBytes,
    maxVaultsLifetime: 1, ...raw });
}

export function subscriptionScenario(search = '') {
  const value = new URLSearchParams(search).get('scenario');
  return SUBSCRIPTION_SCENARIOS.some((item) => item.id === value) ? value : 'active_basic';
}

export function subscriptionStatusLabel(status, lang = 'vi') {
  const labels = { ACTIVE: ['Đang hoạt động', 'Active'], EXPIRED: ['Đã hết hạn', 'Expired'],
    INACTIVE: ['Chưa hoạt động', 'Inactive'], CANCELLED: ['Đã hủy', 'Cancelled'] };
  return labels[status]?.[lang === 'en' ? 1 : 0] || (lang === 'en' ? 'Status unavailable' : 'Chưa có thông tin trạng thái');
}

export function subscriptionErrorMessage(error, lang = 'vi') {
  const t = subscriptionMessages[lang] || subscriptionMessages.vi;
  if (error?.status === 401) return t.unauthorized;
  if (error?.code === 'SUBSCRIPTION_POLICY_PENDING') return t.policyPending;
  if (error?.status === 403) return t.forbidden;
  if (error?.code === 'BACKEND_NOT_READY' || error?.status >= 500) return t.backendNotReady;
  if (error?.status === 404) return t.notFound;
  if (error?.code === 'NETWORK_ERROR') return t.networkError;
  return lang === 'en' ? 'Unable to load subscription details. Please try again.' : 'Chưa tải được thông tin gói. Vui lòng thử lại.';
}

// ============================================================================
// MOCK ADAPTER (Strictly for DEV Preview & isolated unit tests)
// ============================================================================
export const mockSubscriptionAdapter = {
  fetch(scenario = 'active_basic', lang = 'vi') {
    const msgs = subscriptionMessages[lang] || subscriptionMessages.vi;
    switch (scenario) {
      case 'empty':
        return null;

      case 'unauthorized': {
        const err = new ApiError('UNAUTHORIZED', 401);
        err.message = msgs.unauthorized;
        throw err;
      }

      case 'forbidden': {
        const err = new ApiError('ACCESS_DENIED', 403);
        err.message = msgs.forbidden;
        throw err;
      }

      case 'network_error': {
        const err = new ApiError('NETWORK_ERROR', 0);
        err.message = msgs.networkError;
        throw err;
      }

      case 'backend_not_ready': {
        const err = new ApiError('BACKEND_NOT_READY', 404);
        err.message = msgs.backendNotReady;
        throw err;
      }

      case 'active_standard':
        return readMockSubscription({
          subscriptionId: 'sub-mock-standard-001',
          planCode: 'STANDARD',
          status: 'ACTIVE',
          isTrialGrant: true,
          grantedBy: null,
          startedAt: new Date(Date.now() - 8 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 22 * 86400000).toISOString(),
          assetsUsed: 18,
          storageUsedBytes: 340 * 1024 * 1024, // 340 MB
          vaultsCreatedLifetime: 1,
          isSimulation: true,
        });

      case 'active_extended':
        return readMockSubscription({
          subscriptionId: 'sub-mock-extended-002',
          planCode: 'EXTENDED',
          status: 'ACTIVE',
          isTrialGrant: true,
          grantedBy: null,
          startedAt: new Date(Date.now() - 30 * 86400000).toISOString(),
          expiresAt: new Date(Date.now() + 150 * 86400000).toISOString(),
          assetsUsed: 65,
          storageUsedBytes: 1800 * 1024 * 1024, // 1.8 GB
          vaultsCreatedLifetime: 1,
          isSimulation: true,
        });

      case 'near_quota':
        return readMockSubscription({
          subscriptionId: 'sub-mock-near-quota-003',
          planCode: 'BASIC',
          status: 'ACTIVE',
          isTrialGrant: false,
          startedAt: new Date(Date.now() - 10 * 86400000).toISOString(),
          expiresAt: null,
          assetsUsed: 5, // 5 of 5
          storageUsedBytes: 98 * 1024 * 1024, // 98 MB of 100 MB
          vaultsCreatedLifetime: 1,
          isSimulation: true,
        });

      case 'active_basic':
      default:
        return readMockSubscription({
          subscriptionId: 'sub-mock-basic-000',
          planCode: 'BASIC',
          status: 'ACTIVE',
          isTrialGrant: false,
          startedAt: new Date(Date.now() - 5 * 86400000).toISOString(),
          expiresAt: null,
          assetsUsed: 3,
          storageUsedBytes: 24 * 1024 * 1024, // 24 MB
          vaultsCreatedLifetime: 1,
          isSimulation: true,
        });
    }
  },
};

// ============================================================================
// LIVE ADAPTER (Connects to actual Backend API contract)
// ============================================================================
export const liveSubscriptionAdapter = {
  async fetch(options = {}) {
    const data = await request('/subscriptions/me', {
      ...options,
      expectedStatus: 200,
    });
    if (data?.isSimulation === true) throw new ApiError('INVALID_RESPONSE');
    return readSubscription(data);
  },
};

/**
 * Fetch current subscription for Vault Owner
 * @param {Object} options - { lang, scenario, isDevPreview, isTest, testEnv, fetchFn, accessToken }
 * @returns {Promise<Object|null>}
 */
export async function fetchSubscription(options = {}) {
  const lang = options.lang || 'vi';

  if (isSimulationPermitted(options)) {
    const signal = options.signal;
    await new Promise((resolve, reject) => {
      let timer;
      const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
      if (signal?.aborted) { abort(); return; }
      signal?.addEventListener('abort', abort, { once: true });
      if (options.scenario !== 'loading') timer = setTimeout(() => {
        signal?.removeEventListener('abort', abort);
        resolve();
      }, 300);
    });
    return mockSubscriptionAdapter.fetch(options.scenario || 'active_basic', lang);
  }

  return liveSubscriptionAdapter.fetch(options);
}
