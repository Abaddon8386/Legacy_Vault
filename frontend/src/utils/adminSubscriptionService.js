/**
 * Dịch vụ frontend quản trị gói sử dụng (subscription plan) cho ROLE_ADMIN: xem, tạo bản nháp, sửa, công bố, ngừng áp dụng
 * phiên bản gói, tra cứu tài khoản và giao dịch. Mọi hàm gọi các endpoint /api/v1/admin/subscriptions/** qua request().
 * Được dùng bởi pages/admin/AdminSubscriptionPage.jsx.
 */
import { request, ApiError } from '../api/http.js';

export { ApiError };

/**
 * Thông điệp lỗi/thông báo song ngữ (vi, en) cho màn hình quản trị gói sử dụng.
 */
export const adminSubscriptionMessages = {
  vi: {
    unauthorized: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
    forbidden: 'Bạn không có quyền quản trị viên (ROLE_ADMIN) để thực hiện thao tác này.',
    notFound: 'Không tìm thấy thông tin gói sử dụng, phiên bản hoặc tài khoản yêu cầu.',
    catalogStale: 'Dữ liệu cấu hình đã bị thay đổi bởi quản trị viên khác. Vui lòng tải lại trang để xem bản mới nhất.',
    planVersionConflict: 'Cấu hình gói đã bị thay đổi bởi quản trị viên khác. Vui lòng tải lại dữ liệu trước khi tiếp tục.',
    planVersionNotEditable: 'Chỉ có thể chỉnh sửa bản nháp (DRAFT). Phiên bản đã công bố hoặc ngừng áp dụng là bất biến.',
    planVersionAlreadyExists: 'Đã tồn tại một bản nháp cho gói này. Vui lòng chỉnh sửa bản nháp hiện có hoặc công bố trước khi tạo bản mới.',
    paymentUnavailable: 'Tra cứu giao dịch tạm thời chưa khả dụng. Vui lòng thử lại.',
    validationFailed: 'Dữ liệu không hợp lệ. Giới hạn tệp phải cố định đúng 10 MB, dung lượng lưu trữ phải đủ chứa tệp và các trường bắt buộc không được để trống.',
    networkError: 'Không thể kết nối đến máy chủ backend. Vui lòng kiểm tra kết nối mạng.',
    genericError: 'Đã xảy ra lỗi khi xử lý yêu cầu quản trị gói sử dụng. Vui lòng thử lại sau.',
  },
  en: {
    unauthorized: 'Session has expired or is invalid. Please sign in again.',
    forbidden: 'You do not have administrator permissions (ROLE_ADMIN) to perform this action.',
    notFound: 'Requested plan, version, or account information was not found.',
    catalogStale: 'Configuration was modified by another administrator. Please reload to see the latest data.',
    planVersionConflict: 'Plan configuration was modified by another administrator. Please reload data before proceeding.',
    planVersionNotEditable: 'Only draft (DRAFT) versions can be edited. Published or deprecated versions are immutable.',
    planVersionAlreadyExists: 'A draft version already exists for this plan. Please edit the existing draft or publish it first.',
    paymentUnavailable: 'Transaction lookup is temporarily unavailable. Please retry.',
    validationFailed: 'Invalid configuration data. File limit must be strictly 10 MB, storage must be at least 10 MB, and required fields cannot be blank.',
    networkError: 'Cannot connect to backend server. Please verify network connection.',
    genericError: 'An error occurred while processing subscription management request. Please try again.',
  },
};

/**
 * Định dạng số byte thành chuỗi dễ đọc (B, KB, MB, GB, TB).
 * @param {number} bytes Số byte; giá trị không hợp lệ hoặc <= 0 cho '0 B'.
 */
export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${Number.isInteger(val) || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

/**
 * Định dạng số tiền VND kèm hậu tố mô hình thanh toán trọn đời.
 * @param {number} amount Số tiền.
 * @param {string} lang 'vi' (mặc định) hoặc 'en'.
 */
export function formatVnd(amount, lang = 'vi') {
  if (!Number.isFinite(amount) || amount === 0) return '0 ₫';
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(amount)
    + (lang === 'en' ? ' VND / lifetime' : ' ₫ / trọn đời');
}

/**
 * Chuyển lỗi (ApiError) thành thông điệp thân thiện theo ngôn ngữ, dựa trên status HTTP và mã lỗi backend
 * (PLAN_VERSION_CONFLICT, SUBSCRIPTION_CATALOG_STALE, PLAN_VERSION_NOT_EDITABLE, PLAN_VERSION_ALREADY_EXISTS...).
 */
export function adminSubscriptionErrorMessage(error, lang = 'vi') {
  const t = adminSubscriptionMessages[lang] || adminSubscriptionMessages.vi;
  if (!error) return t.genericError;
  if (error.status === 401 || error.code === 'UNAUTHENTICATED') return t.unauthorized;
  if (error.status === 403 || error.code === 'ACCESS_DENIED') return t.forbidden;
  if (error.status === 404 || error.code === 'RESOURCE_NOT_FOUND' || error.code === 'PLAN_VERSION_NOT_FOUND') return t.notFound;
  if (error.code === 'PLAN_VERSION_CONFLICT' || error.code === 'OPTIMISTIC_LOCK_CONFLICT') return t.planVersionConflict;
  if (error.code === 'SUBSCRIPTION_CATALOG_STALE') return t.catalogStale;
  if (error.code === 'PLAN_VERSION_NOT_EDITABLE') return t.planVersionNotEditable;
  if (error.code === 'PLAN_VERSION_ALREADY_EXISTS') return t.planVersionAlreadyExists;
  if (error.code === 'PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE') return t.paymentUnavailable;
  if (error.status === 400 || error.code === 'VALIDATION_FAILED') return t.validationFailed;
  if (error.code === 'NETWORK_ERROR') return t.networkError;
  return error.message || t.genericError;
}

/**
 * Gọi GET /api/v1/admin/subscriptions/plans: danh sách các gói.
 */
export async function fetchAdminPlans(options = {}) {
  return request('/admin/subscriptions/plans', options);
}

/**
 * Gọi GET /api/v1/admin/subscriptions/plans/{planCode}: chi tiết một gói.
 */
export async function fetchAdminPlanDetail(planCode, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}`, options);
}

/**
 * Gọi GET /api/v1/admin/subscriptions/plans/{planCode}/versions: các phiên bản của gói.
 */
export async function fetchAdminPlanVersions(planCode, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions`, options);
}

/**
 * Gọi GET /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}: một phiên bản cụ thể.
 */
export async function fetchAdminPlanVersion(planCode, version, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}`, options);
}

/**
 * Gọi POST /api/v1/admin/subscriptions/plans/{planCode}/versions (mong đợi 201) để tạo bản nháp (DRAFT) mới. Backend có thể trả PLAN_VERSION_ALREADY_EXISTS nếu đã có nháp.
 */
export async function createAdminPlanDraft(planCode, body = {}, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions`, {
    method: 'POST',
    body,
    ...options,
    expectedStatus: 201,
  });
}

/**
 * Gọi PUT /api/v1/admin/subscriptions/plans/{planCode}/versions/{version} để sửa bản nháp. Chỉ bản DRAFT sửa được (PLAN_VERSION_NOT_EDITABLE).
 */
export async function updateAdminPlanDraft(planCode, version, body, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}`, {
    method: 'PUT',
    body,
    ...options,
  });
}

/**
 * Gọi POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/publish để công bố phiên bản.
 * Chấp nhận (body, options) hoặc chỉ (options): hàm tự phân biệt tham số thứ ba là body hay options dựa vào các khóa quen thuộc (accessToken, lang, fetchFn, signal).
 */
export async function publishAdminPlanVersion(planCode, version, bodyOrOptions = {}, maybeOptions = {}) {
  let body = undefined;
  let options = {};
  if (maybeOptions && Object.keys(maybeOptions).length > 0) {
    body = bodyOrOptions;
    options = maybeOptions;
  } else if (bodyOrOptions && (bodyOrOptions.accessToken || bodyOrOptions.lang || bodyOrOptions.fetchFn || bodyOrOptions.signal)) {
    options = bodyOrOptions;
  } else if (bodyOrOptions && Object.keys(bodyOrOptions).length > 0) {
    body = bodyOrOptions;
  }
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}/publish`, {
    method: 'POST',
    body,
    ...options,
  });
}

/**
 * Gọi POST /api/v1/admin/subscriptions/plans/{planCode}/versions/{version}/deprecate để ngừng áp dụng phiên bản.
 */
export async function deprecateAdminPlanVersion(planCode, version, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}/deprecate`, {
    method: 'POST',
    ...options,
  });
}

/**
 * Gọi GET /api/v1/admin/subscriptions/accounts?query= tra cứu mức sử dụng của tài khoản; kiểm tra các số đếm assetCount, assetLimit, storageBytes, storageBytesLimit phải là số nguyên không âm (nếu không ném INVALID_RESPONSE).
 */
export async function lookupAdminAccount(query, options = {}) {
  const data=await request(`/admin/subscriptions/accounts?query=${encodeURIComponent(query)}`, options);
  if(!data || !['assetCount','assetLimit','storageBytes','storageBytesLimit'].every(k=>Number.isSafeInteger(data[k]) && data[k]>=0)) throw new ApiError('INVALID_RESPONSE');
  return data;
}

/**
 * Gọi GET /api/v1/admin/subscriptions/transactions[?query=] tra cứu giao dịch (bản đơn giản, không chuẩn hóa; xem adminPaymentService.js cho bản có kiểm tra hợp đồng).
 */
export async function lookupAdminTransactions(query = '', options = {}) {
  return request(`/admin/subscriptions/transactions${query ? `?query=${encodeURIComponent(query)}` : ''}`, options);
}
