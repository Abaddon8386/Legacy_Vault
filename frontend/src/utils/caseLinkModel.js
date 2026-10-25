import { ApiError } from '../api/http.js';

// Frontend view models, NOT an HTTP contract. A backend adapter must normalize
// authenticated responses to these shapes before enabling the new workflow.
export const REQUEST_STATES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED', 'EXPIRED'];
const text = value => typeof value === 'string' && value.trim().length > 0;
export function isPersonalRecipient(roles = []) {
  const names = roles.map(role => role.replace(/^ROLE_/, ''));
  return !names.some(role => ['ADMIN', 'LEGAL', 'LEGAL_OFFICER', 'STAFF_EXECUTOR'].includes(role)) &&
    names.some(role => ['VAULT_OWNER', 'BENEFICIARY'].includes(role));
}
export function readLinkRequest(raw, { staff = false } = {}) {
  if (!raw || !text(raw.id) || !text(raw.caseNumber) || !REQUEST_STATES.includes(raw.status)) throw new ApiError('INVALID_RESPONSE');
  const item = { id: raw.id, caseNumber: raw.caseNumber, status: raw.status };
  if (staff) {
    if (!text(raw.accountId) || !text(raw.accountName) || !text(raw.accountEmail)) throw new ApiError('INVALID_RESPONSE');
    Object.assign(item, { accountId: raw.accountId, accountName: raw.accountName, accountEmail: raw.accountEmail });
  }
  return item;
}
export function readLinkRequests(raw, options) {
  if (!Array.isArray(raw)) throw new ApiError('INVALID_RESPONSE');
  const items = raw.map(item => readLinkRequest(item, options));
  if (new Set(items.map(item => item.id)).size !== items.length) throw new ApiError('INVALID_RESPONSE');
  return items;
}
export function requestStatusLabel(status, lang = 'vi') {
  const vi = { PENDING: 'Chờ Staff đối chiếu', APPROVED: 'Đã liên kết', REJECTED: 'Yêu cầu bị từ chối', CANCELLED: 'Đã hủy yêu cầu', EXPIRED: 'Yêu cầu hết hạn' };
  const en = { PENDING: 'Awaiting Staff verification', APPROVED: 'Linked', REJECTED: 'Request declined', CANCELLED: 'Request cancelled', EXPIRED: 'Request expired' };
  return (lang === 'en' ? en : vi)[status];
}
export function caseLinkError(error, lang = 'vi') {
  const en = lang === 'en';
  if (error?.status === 401) return en ? 'Your session has expired. Please sign in again.' : 'Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.';
  if (error?.status === 403) return en ? 'This account cannot perform this action.' : 'Tài khoản không có quyền thực hiện thao tác này.';
  if (error?.status === 429) return en ? 'Too many requests. Please wait before trying again.' : 'Bạn thao tác quá nhanh. Vui lòng chờ trước khi thử lại.';
  if (error?.status === 409) return en ? 'The record has changed. Refresh its status before continuing.' : 'Hồ sơ đã thay đổi. Hãy tải lại trạng thái trước khi tiếp tục.';
  if (error?.code === 'INVALID_RESPONSE') return en ? 'The result could not be verified. Refresh the status before trying again.' : 'Chưa xác minh được kết quả. Hãy tải lại trạng thái trước khi thử lại.';
  return en ? 'Unable to complete the request. Refresh the status before trying again.' : 'Chưa thực hiện được yêu cầu. Hãy tải lại trạng thái trước khi thử lại.';
}
