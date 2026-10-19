import { request, ApiError } from '../api/http.js';

export { ApiError };

export const adminSubscriptionMessages = {
  vi: {
    unauthorized: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.',
    forbidden: 'Bạn không có quyền quản trị viên (ROLE_ADMIN) để thực hiện thao tác này.',
    notFound: 'Không tìm thấy thông tin gói sử dụng, phiên bản hoặc tài khoản yêu cầu.',
    catalogStale: 'Dữ liệu cấu hình đã bị thay đổi bởi quản trị viên khác. Vui lòng tải lại trang để xem bản mới nhất.',
    planVersionConflict: 'Cấu hình gói đã bị thay đổi bởi quản trị viên khác. Vui lòng tải lại dữ liệu trước khi tiếp tục.',
    planVersionNotEditable: 'Chỉ có thể chỉnh sửa bản nháp (DRAFT). Phiên bản đã công bố hoặc ngừng áp dụng là bất biến.',
    planVersionAlreadyExists: 'Đã tồn tại một bản nháp cho gói này. Vui lòng chỉnh sửa bản nháp hiện có hoặc công bố trước khi tạo bản mới.',
    paymentUnavailable: 'Nguồn dữ liệu giao dịch thanh toán phụ thuộc phân hệ PS-80 (chưa tích hợp). Chức năng tra cứu giao dịch hiện chưa khả dụng trên môi trường này.',
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
    paymentUnavailable: 'Payment transaction data source depends on PS-80 (not yet integrated). Transaction lookup is unavailable in this environment.',
    validationFailed: 'Invalid configuration data. File limit must be strictly 10 MB, storage must be at least 10 MB, and required fields cannot be blank.',
    networkError: 'Cannot connect to backend server. Please verify network connection.',
    genericError: 'An error occurred while processing subscription management request. Please try again.',
  },
};

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const val = bytes / Math.pow(1024, i);
  return `${Number.isInteger(val) || i === 0 ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export function formatVnd(amount, lang = 'vi') {
  if (!Number.isFinite(amount) || amount === 0) return '0 ₫';
  return new Intl.NumberFormat(lang === 'en' ? 'en-US' : 'vi-VN').format(amount)
    + (lang === 'en' ? ' VND / lifetime' : ' ₫ / trọn đời');
}

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

export async function fetchAdminPlans(options = {}) {
  return request('/admin/subscriptions/plans', options);
}

export async function fetchAdminPlanDetail(planCode, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}`, options);
}

export async function fetchAdminPlanVersions(planCode, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions`, options);
}

export async function fetchAdminPlanVersion(planCode, version, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}`, options);
}

export async function createAdminPlanDraft(planCode, body = {}, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions`, {
    method: 'POST',
    body,
    ...options,
    expectedStatus: 201,
  });
}

export async function updateAdminPlanDraft(planCode, version, body, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}`, {
    method: 'PUT',
    body,
    ...options,
  });
}

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

export async function deprecateAdminPlanVersion(planCode, version, options = {}) {
  return request(`/admin/subscriptions/plans/${encodeURIComponent(planCode)}/versions/${encodeURIComponent(version)}/deprecate`, {
    method: 'POST',
    ...options,
  });
}

export async function lookupAdminAccount(query, options = {}) {
  return request(`/admin/subscriptions/accounts?query=${encodeURIComponent(query)}`, options);
}

export async function lookupAdminTransactions(query = '', options = {}) {
  return request(`/admin/subscriptions/transactions${query ? `?query=${encodeURIComponent(query)}` : ''}`, options);
}
