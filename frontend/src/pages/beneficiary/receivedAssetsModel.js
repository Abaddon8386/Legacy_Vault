import { ApiError } from '../../api/http.js';

/** Mô hình dữ liệu phía giao diện cho tài sản đã nhận: các hàm đọc/kiểm tra phản hồi từ API /api/v1/received-assets (qua services/receivedAssetService.js) và chuẩn hóa thành đối tượng dùng trong ReceivedAssets. Phản hồi sai cấu trúc ném ApiError INVALID_RESPONSE. */
// FE view model only. PS-104 must map its agreed API into this boundary;
// none of these names defines an HTTP request/response or entitlement policy.
/** Kiểm tra chuỗi UUID hợp lệ. */
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
/** Ném ApiError('INVALID_RESPONSE') khi phản hồi không đúng hợp đồng. */
const fail = () => { throw new ApiError('INVALID_RESPONSE'); };
/**
 * Xác nhận phản hồi thuộc đúng chủ thể (subjectId khớp và là UUID).
 *
 * @throws {ApiError} INVALID_RESPONSE.
 */
export function assertSubject(value, subjectId) {
  if (!uuid(subjectId) || value?.subjectId !== subjectId) fail();
}
/**
 * Kiểm tra và rút gọn một mục tài sản đã nhận: itemId UUID, title/sourceLabel hợp lệ, deliveredAt là thời điểm hợp lệ, các trạng thái (deliveryStatus/status/sessionStatus/vaultStatus/caseStatus) thuộc tập cho phép; chỉ giữ các khóa được phép.
 *
 * @param {object} value Mục thô từ API.
 * @returns {object} Mục đã chuẩn hóa.
 * @throws {ApiError} INVALID_RESPONSE.
 */
export function readReceivedItem(value) {
  if (!uuid(value?.itemId) || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.sourceLabel !== 'string') fail();
  if (value.deliveredAt !== undefined && value.deliveredAt !== null) {
    if (typeof value.deliveredAt !== 'string' || !Number.isFinite(Date.parse(value.deliveredAt))) fail();
  }
  if (value.deliveryStatus !== undefined && value.deliveryStatus !== 'DELIVERED') fail();
  if (value.status !== undefined && !['DELIVERED', 'VERIFIED_BY_BENEFICIARY'].includes(value.status)) fail();
  if (value.sessionStatus !== undefined && !['OPEN', 'COMPLETED', 'CANCELLED'].includes(value.sessionStatus)) fail();
  if (value.vaultStatus !== undefined && !['UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(value.vaultStatus)) fail();
  if (value.caseStatus !== undefined && !['OPEN', 'CLOSED'].includes(value.caseStatus)) fail();

  const allowedKeys = [
    'itemId', 'assetId', 'vaultId', 'title', 'sourceLabel', 'deliveredAt',
    'status', 'assetType', 'description', 'allocationNote', 'imageCount', 'hasContent',
    'deliveryStatus', 'sessionStatus', 'vaultStatus', 'caseStatus'
  ];
  const item = {};
  for (const k of allowedKeys) {
    if (value[k] !== undefined) item[k] = value[k];
  }
  return item;
}
/**
 * Kiểm tra trang danh sách tài sản đã nhận: đúng subject, page/size khớp, total hợp lệ, số mục khớp công thức phân trang, accountState thuộc UNLINKED/AWAITING_HANDOVER/PARTIAL/RECEIVED, itemId không trùng.
 *
 * @param {object} value Phản hồi thô.
 * @param {string} subjectId Id người nhận.
 * @param {number} page Trang yêu cầu.
 * @param {number} size Kích thước trang yêu cầu.
 * @returns {{items: object[], page: number, size: number, total: number, accountState: string}}
 * @throws {ApiError} INVALID_RESPONSE.
 */
export function readReceivedPage(value, subjectId, page, size) {
  assertSubject(value, subjectId);
  if (!Array.isArray(value.items) || value.page !== page || value.size !== size
    || !Number.isSafeInteger(value.total) || value.total < 0 || value.items.length > size
    || value.items.length !== Math.min(size, Math.max(0, value.total - page * size))
    || !['UNLINKED', 'AWAITING_HANDOVER', 'PARTIAL', 'RECEIVED'].includes(value.accountState)) fail();
  const items = value.items.map(readReceivedItem);
  if (new Set(items.map(item => item.itemId)).size !== items.length || (['UNLINKED', 'AWAITING_HANDOVER'].includes(value.accountState) && value.total !== 0)) fail();
  return { items, page, size, total: value.total, accountState: value.accountState };
}
/**
 * Kiểm tra chi tiết một tài sản đã nhận: mục hợp lệ, khớp itemId, danh sách ảnh có imageId UUID không trùng và nhãn.
 *
 * @returns {object} Mục kèm mảng images {imageId, label}.
 * @throws {ApiError} INVALID_RESPONSE.
 */
export function readReceivedDetail(value, subjectId, itemId) {
  assertSubject(value, subjectId);
  const item = readReceivedItem(value);
  if (item.itemId !== itemId || !Array.isArray(value.images)) fail();
  const images = value.images.map(img => {
    if (!uuid(img?.imageId) || typeof img.label !== 'string') fail();
    return { imageId: img.imageId, label: img.label };
  });
  if (new Set(images.map(img => img.imageId)).size !== images.length) fail();
  return { ...item, images };
}
/**
 * Kiểm tra phản hồi nội dung bí mật (đúng subject, itemId, text là chuỗi) và trả văn bản.
 *
 * @returns {string} Nội dung.
 * @throws {ApiError} INVALID_RESPONSE.
 */
export function readReceivedContent(value, subjectId, itemId) {
  assertSubject(value, subjectId);
  if (value.itemId !== itemId || typeof value.text !== 'string') fail();
  return value.text;
}
/** Cho phép dùng dữ liệu mẫu chỉ khi không có accessToken, không ở production, ở môi trường DEV/test và isDevPreview === true. */
export function receivedPreviewAllowed({ accessToken, isDevPreview, testEnv } = {}) {
  return !accessToken && !import.meta.env?.PROD && !testEnv?.PROD && Boolean(import.meta.env?.DEV || testEnv?.DEV) && isDevPreview === true;
}
/**
 * Chọn bộ action nguồn dữ liệu: dữ liệu mẫu (previewActions) nếu được phép preview; null nếu không có accessToken; ngược lại dùng actions nếu có đủ bốn hàm list, detail, content, image.
 *
 * @returns {(object|null)} Bộ action hoặc null (chưa kết nối dịch vụ).
 */
export function receivedActions(actions, options = {}) {
  if (receivedPreviewAllowed(options)) return options.previewActions;
  if (!options.accessToken) return null;
  return actions && ['list', 'detail', 'content', 'image'].every(key => typeof actions[key] === 'function') ? actions : null;
}

/** Định dạng ngày bàn giao theo locale (vi-VN hoặc en-US, dạng DD/MM/YYYY); trả "—" nếu rỗng hoặc không hợp lệ. */
export function formatDeliveredDate(value, lang = 'vi') {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}
