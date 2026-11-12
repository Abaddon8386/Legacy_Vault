import { API_BASE, ApiError, request } from '../api/http.js';
import { passwordFetch } from '../api/passwordRequest.js';
/**
 * Số ảnh tối đa cho mỗi tài sản.
 */
export const MAX_ASSET_IMAGES = 5;
/**
 * Dung lượng tối đa của mỗi ảnh (5MB).
 */
export const MAX_ASSET_IMAGE_BYTES = 5 * 1024 * 1024;
/**
 * Kiểm tra danh sách ảnh: tổng số (kể cả ảnh đã có) <= 5, chỉ JPEG/PNG, mỗi ảnh 1 byte đến 5MB.
 * @param {File[]} files Ảnh cần tải.
 * @param {number} [existingCount=0] Số ảnh đã có.
 * @returns {('count'|'type'|'size'|null)} Loại lỗi hoặc null nếu hợp lệ.
 */
export function validateAssetImages(files, existingCount = 0) {
  if (files.length + existingCount > MAX_ASSET_IMAGES) return 'count';
  if (files.some(f => !['image/jpeg', 'image/png'].includes(f.type))) return 'type';
  if (files.some(f => f.size === 0 || f.size > MAX_ASSET_IMAGE_BYTES)) return 'size';
  return null;
}
/**
 * Đường dẫn gốc ảnh của tài sản: {@code /vaults/{vault}/assets/{asset}/images}.
 */
const path = (vault, asset) => `/vaults/${vault}/assets/${asset}/images`;
/**
 * Tải ảnh lên dạng multipart (phần {@code asset} là JSON tùy chọn, phần {@code images} là các tệp), kỳ vọng HTTP 201.
 * @throws {ApiError} {@code ASSET_IMAGE_LIMIT_EXCEEDED}, {@code VALIDATION_FAILED}, {@code NETWORK_ERROR} hoặc mã lỗi backend.
 */
async function upload(url, files, asset, options) {
  const error = validateAssetImages(files);
  if (error) throw new ApiError(error === 'count' ? 'ASSET_IMAGE_LIMIT_EXCEEDED' : 'VALIDATION_FAILED', 400);
  const body = new FormData();
  if (asset) body.append('asset', new Blob([JSON.stringify(asset)], { type: 'application/json' }));
  files.forEach(f => body.append('images', f));
  const headers = { 'Accept-Language': options.lang || 'vi', Accept: 'application/json' };
  if (options.accessToken) headers.Authorization = `Bearer ${options.accessToken}`;
  let response;
  try { response = await (options.fetchFn || fetch)(API_BASE + url, { method: 'POST', body, headers, signal: options.signal, credentials: 'omit' }); }
  catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError('NETWORK_ERROR'); }
  const data = await response.json().catch(() => ({}));
  if (response.status !== 201) throw new ApiError(data.code || 'INVALID_RESPONSE', response.status);
  return data;
}
/**
 * Service ảnh của tài sản (dùng bởi {@code AssetFormModal}, {@code AssetEditModal}, {@code AssetDetailModal}, {@code AssetImageGallery}).
 */
export const assetImageService = {
  /**
   * Tạo tài sản kèm ảnh: {@code POST /vaults/{vault}/assets/with-images} (multipart: {@code asset} JSON + {@code images}).
   */
  create: (vault, asset, files, options = {}) => upload(`/vaults/${vault}/assets/with-images`, files, asset, options),
  /**
   * Thêm ảnh vào tài sản có sẵn: {@code POST /vaults/{vault}/assets/{asset}/images} (multipart).
   */
  add: (vault, asset, files, options = {}) => upload(path(vault, asset), files, null, options),
  /**
   * Liệt kê metadata ảnh: {@code GET /vaults/{vault}/assets/{asset}/images} (200).
   */
  list: (vault, asset, options = {}) => request(path(vault, asset), { ...options, expectedStatus: 200 }),
  /**
   * Xóa ảnh: {@code DELETE /vaults/{vault}/assets/{asset}/images/{image}}, kỳ vọng 204.
   */
  async remove(vault, asset, image, options = {}) {
    const response = await (options.fetchFn || fetch)(API_BASE + path(vault, asset) + '/' + image, {
      method: 'DELETE', headers: { Authorization: `Bearer ${options.accessToken}`, 'Accept-Language': options.lang || 'vi' },
      signal: options.signal, credentials: 'omit',
    });
    if (response.status !== 204) {
      const data = await response.json().catch(() => ({})); throw new ApiError(data.code || 'NETWORK_ERROR', response.status);
    }
  },
  /**
   * Mở/tải nội dung ảnh sau khi xác nhận mật khẩu: {@code POST /vaults/{vault}/assets/{asset}/images/{id}/download}
   * với body {@code {password}} (qua {@code passwordFetch}).
   * @returns {Promise<Blob>} Ảnh dạng Blob với {@code image.contentType}.
   */
  async open(vault, asset, image, password, options = {}) {
    let response;
    try { response = await passwordFetch(API_BASE + path(vault, asset) + '/' + image.id + '/download', {
      method: 'POST', headers: { Authorization: `Bearer ${options.accessToken}`, 'Content-Type': 'application/json', 'Accept-Language': options.lang || 'vi' },
      body: JSON.stringify({ password }), signal: options.signal, credentials: 'omit',
    }, options); } catch (e) { if (e.name === 'AbortError' || e.code) throw e; throw new ApiError('NETWORK_ERROR'); }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.code || 'NETWORK_ERROR', response.status); }
    return new Blob([await response.arrayBuffer()], { type: image.contentType });
  },
};
