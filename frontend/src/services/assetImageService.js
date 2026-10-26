import { API_BASE, ApiError, request } from '../api/http.js';
export const MAX_ASSET_IMAGES = 5;
export const MAX_ASSET_IMAGE_BYTES = 5 * 1024 * 1024;
export function validateAssetImages(files, existingCount = 0) {
  if (files.length + existingCount > MAX_ASSET_IMAGES) return 'count';
  if (files.some(f => !['image/jpeg', 'image/png'].includes(f.type))) return 'type';
  if (files.some(f => f.size === 0 || f.size > MAX_ASSET_IMAGE_BYTES)) return 'size';
  return null;
}
const path = (vault, asset) => `/vaults/${vault}/assets/${asset}/images`;
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
export const assetImageService = {
  create: (vault, asset, files, options = {}) => upload(`/vaults/${vault}/assets/with-images`, files, asset, options),
  add: (vault, asset, files, options = {}) => upload(path(vault, asset), files, null, options),
  list: (vault, asset, options = {}) => request(path(vault, asset), { ...options, expectedStatus: 200 }),
  async remove(vault, asset, image, options = {}) {
    const response = await (options.fetchFn || fetch)(API_BASE + path(vault, asset) + '/' + image, {
      method: 'DELETE', headers: { Authorization: `Bearer ${options.accessToken}`, 'Accept-Language': options.lang || 'vi' },
      signal: options.signal, credentials: 'omit',
    });
    if (response.status !== 204) {
      const data = await response.json().catch(() => ({})); throw new ApiError(data.code || 'NETWORK_ERROR', response.status);
    }
  },
  async open(vault, asset, image, password, options = {}) {
    let response;
    try { response = await (options.fetchFn || fetch)(API_BASE + path(vault, asset) + '/' + image.id + '/download', {
      method: 'POST', headers: { Authorization: `Bearer ${options.accessToken}`, 'Content-Type': 'application/json', 'Accept-Language': options.lang || 'vi' },
      body: JSON.stringify({ password }), signal: options.signal, credentials: 'omit',
    }); } catch (e) { if (e.name === 'AbortError') throw e; throw new ApiError('NETWORK_ERROR'); }
    if (!response.ok) { const data = await response.json().catch(() => ({})); throw new ApiError(data.code || 'NETWORK_ERROR', response.status); }
    return new Blob([await response.arrayBuffer()], { type: image.contentType });
  },
};
