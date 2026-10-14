import { request, ApiError } from '../api/http.js';
import { readDms } from './dmsService.js';
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
export function describeNextCheck(dms, lang = 'vi', now = Date.now()) {
  const en = lang === 'en';
  if (dms.status !== 'MONITORING') return en ? 'Confirmation overdue' : 'Đã quá hạn xác nhận';
  const remaining = new Date(dms.nextCheckAt).getTime() - now;
  if (remaining <= 0) return en ? 'Confirmation due' : 'Đã đến hạn xác nhận';
  return en ? Math.ceil(remaining / 86400000) + ' days remaining' : 'Còn ' + Math.ceil(remaining / 86400000) + ' ngày';
}
