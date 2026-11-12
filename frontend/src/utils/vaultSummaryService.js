/**
 * Dịch vụ tổng hợp dữ liệu cho thẻ tóm tắt kho; dùng bởi components/vault/VaultSummary.jsx.
 */
import { request, ApiError } from '../api/http.js';
import { readDms } from './dmsService.js';
/**
 * Tải song song ba nguồn bằng Promise.allSettled:
 * - GET /api/v1/vaults/{vaultId}/assets?page=0&size=1&sort=createdAt,desc: lấy tổng số tài sản (totalElements).
 * - GET /api/v1/vaults/{vaultId}/configuration-check: số người thụ hưởng và cờ ready.
 * - GET /api/v1/dms: cấu hình giám sát (chuẩn hóa bằng readDms).
 * Mỗi nguồn lỗi chỉ đánh dấu available=false, riêng AbortError hoặc 401 thì ném lại.
 * @returns {Promise<{assets:object,configuration:object,dms:object}>} mỗi phần có dạng {available, value?}.
 */
export async function fetchVaultSummary(vaultId, options = {}) {
  const count = raw => {
    if (!Number.isSafeInteger(raw?.totalElements) || raw.totalElements < 0 || !Array.isArray(raw.content)) throw new ApiError('INVALID_RESPONSE');
    return raw.totalElements;
  };
  const configuration = raw => {
    if (!Number.isSafeInteger(raw?.beneficiaryCount) || raw.beneficiaryCount < 0 || typeof raw.ready !== 'boolean' || !Array.isArray(raw.issues)) throw new ApiError('INVALID_RESPONSE');
    return { beneficiaryCount: raw.beneficiaryCount, ready: raw.ready };
  };
  const results = await Promise.allSettled([
    request('/vaults/' + vaultId + '/assets?page=0&size=1&sort=createdAt,desc', options).then(count),
    request('/vaults/' + vaultId + '/configuration-check', options).then(configuration),
    // Generic 404 also occurs when the DMS endpoint is not integrated yet.
    // Keep it unavailable until the backend exposes an unambiguous configuration state.
    request('/dms', options).then(raw => readDms(raw, options)),
  ]);
  const interrupted = results.find(result => result.status === 'rejected' && (result.reason.name === 'AbortError' || result.reason.status === 401));
  if (interrupted) throw interrupted.reason;
  return Object.fromEntries(['assets', 'configuration', 'dms'].map((key, index) => [key,
    results[index].status === 'fulfilled' ? { available: true, value: results[index].value } : { available: false }]));
}
/** Whether the date has passed, and whether the owner can still confirm right now (same rule as the DMS page). */
export function confirmationState(dms, now = Date.now()) {
  const past = Date.parse(dms.nextCheckAt || '') <= now;
  const canConfirm = dms.status === 'MONITORING' ? past
    : dms.status === 'TRIGGERED' && Date.parse(dms.graceDeadline || '') > now;
  return { past, canConfirm };
}

/**
 * Mô tả mốc kiểm tra kế tiếp (vi/en): khi MONITORING là "Còn N ngày" hoặc "Đã đến hạn xác nhận" (nextCheckAt đã qua); mọi trạng thái khác MONITORING (TRIGGERED, GRACE_PERIOD_EXCEEDED) đều là "Đã quá hạn xác nhận".
 */
export function describeNextCheck(dms, lang = 'vi', now = Date.now()) {
  const en = lang === 'en';
  if (dms.status !== 'MONITORING') return en ? 'Confirmation overdue' : 'Đã quá hạn xác nhận';
  const remaining = new Date(dms.nextCheckAt).getTime() - now;
  if (remaining <= 0) return en ? 'Confirmation due' : 'Đã đến hạn xác nhận';
  return en ? Math.ceil(remaining / 86400000) + ' days remaining' : 'Còn ' + Math.ceil(remaining / 86400000) + ' ngày';
}
