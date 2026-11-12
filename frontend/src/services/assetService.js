import { assetImageService } from './assetImageService.js';
import { request, ApiError } from '../api/http.js';
import { passwordRequest } from '../api/passwordRequest.js';
import { isUuid, isUtcDate } from '../api/contracts.js';
/**
 * Tạo {@link ApiError} có mã (mặc định {@code VALIDATION_FAILED}) và thông điệp mô tả cho lỗi kiểm tra phía client.
 */
const bad = (message, code = 'VALIDATION_FAILED') => { const error = new ApiError(code); error.message = message; return error; };
/**
 * Bảo đảm {@code vaultId} là UUID; nếu không ném {@code VAULT_REQUIRED}.
 */
function context(vaultId) { if (!isUuid(vaultId)) throw bad('vaultId is required', 'VAULT_REQUIRED'); }
/**
 * Xác thực và chuẩn hóa một tài sản từ backend (id UUID, thuộc đúng hầm, name, assetType TEXT/CREDENTIAL/FILE,
 * {@code hasPayload}, createdAt/updatedAt UTC). Không bao giờ chứa nội dung bí mật (payload chỉ lấy qua reveal).
 * @throws {ApiError} {@code INVALID_RESPONSE} khi sai hợp đồng.
 */
export function readAsset(raw, vaultId) {
  if (!isUuid(raw?.id) || raw.vaultId !== vaultId || typeof raw.name !== 'string' || !raw.name.trim() ||
      !['TEXT','CREDENTIAL','FILE'].includes(raw.assetType) || typeof raw.hasPayload !== 'boolean' ||
      !isUtcDate(raw.createdAt) || !isUtcDate(raw.updatedAt)) throw new ApiError('INVALID_RESPONSE');
  return { id: raw.id, vaultId, name: raw.name, assetType: raw.assetType, description: raw.description ?? null,
    hasPayload: raw.hasPayload, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}
/**
 * Service tài sản trong hầm: xem, liệt kê, tạo, sửa và xem nội dung bí mật (reveal); không có thao tác xóa (dùng bởi trang quản lý tài sản của chủ hầm, {@code AssetFormModal}, {@code AssetEditModal}, {@code AssetDetailModal}).
 * Tất cả đường dẫn nằm dưới {@code /vaults/{vaultId}/assets}.
 */
export const assetService = {
 /**
  * Lấy một tài sản: {@code GET /vaults/{vaultId}/assets/{assetId}} (200).
  */
 async getAssetById(vaultId, assetId, options = {}) {
  context(vaultId); if (!isUuid(assetId)) throw bad('Asset UUID required', 'ASSET_REQUIRED');
  const item = readAsset(await request('/vaults/'+vaultId+'/assets/'+assetId, {...options,expectedStatus:200}),vaultId);
  if (item.id !== assetId) throw new ApiError('INVALID_RESPONSE'); return item;
 },
 /**
  * Sửa tài sản: {@code PATCH /vaults/{vaultId}/assets/{assetId}} (200). Chỉ gửi các trường được đổi (name <= 150 ký tự,
  * description <= 1000, payload không rỗng); bắt buộc có {@code password} (mật khẩu hiện tại, <= 72) và đi qua {@code passwordRequest}.
  */
 async updateAsset(vaultId, assetId, patch, options = {}) {
  context(vaultId); if (!isUuid(assetId)) throw bad('Asset UUID required','ASSET_REQUIRED');
  if (!patch || typeof patch !== 'object') throw bad('Patch required');
  const body = {};
  if (patch.name !== undefined) { if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.trim().length>150) throw bad('Invalid name'); body.name=patch.name.trim(); }
  if (patch.description !== undefined) { if (patch.description !== null && (typeof patch.description !== 'string' || patch.description.length>1000)) throw bad('Invalid description'); body.description=patch.description?.trim()||null; }
  if (patch.payload !== undefined) { if (typeof patch.payload !== 'string' || !patch.payload.trim()) throw bad('Invalid payload'); body.payload=patch.payload; }
  if (!Object.keys(body).length) throw bad('No editable fields');
  if (typeof patch.password !== 'string' || !patch.password.trim() || patch.password.length > 72) throw bad('Current password is required');
  body.password = patch.password;
  const item = readAsset(await passwordRequest('/vaults/'+vaultId+'/assets/'+assetId, {...options,method:'PATCH',expectedStatus:200,body}),vaultId);
  if (item.id !== assetId) throw new ApiError('INVALID_RESPONSE'); return item;
 },
 /**
  * Danh sách tài sản có phân trang: {@code GET /vaults/{vaultId}/assets?page&size&sort} (mặc định page=0, size=20, sort=createdAt,desc; size tối đa 100).
  * @returns {Promise<{page:number,size:number,totalElements:number,totalPages:number,content:Array}>}
  */
 async getAssets(vaultId, options = {}) {
  context(vaultId);
  const { page=0, size=20, sort='createdAt,desc' } = options;
  if (!Number.isSafeInteger(page) || page<0 || !Number.isSafeInteger(size) || size<1 || size>100) throw bad('Invalid pagination');
  const params = new URLSearchParams({page:String(page),size:String(size),sort});
  const data = await request(`/vaults/${vaultId}/assets?${params}`, {...options, expectedStatus:200});
  if (!Array.isArray(data?.content) || !Number.isSafeInteger(data.page) || data.page<0 ||
      !Number.isSafeInteger(data.size) || data.size<1 || !Number.isSafeInteger(data.totalElements) ||
      data.totalElements<data.content.length || !Number.isSafeInteger(data.totalPages) || data.totalPages<0) throw new ApiError('INVALID_RESPONSE');
  return {page:data.page,size:data.size,totalElements:data.totalElements,totalPages:data.totalPages,content:data.content.map(item=>readAsset(item,vaultId))};
 },
 /**
  * Tạo tài sản: {@code POST /vaults/{vaultId}/assets} (201) với {name, assetType TEXT|CREDENTIAL, description, payload}.
  * Nếu có ảnh ({@code formData.images}) thì gọi {@code assetImageService.create} (multipart tới {@code /assets/with-images}).
  */
 async createAsset(vaultId, formData, options = {}) {
  context(vaultId);
  if (!formData || typeof formData!=='object') throw bad('Form data is required');
  const name=String(formData.name||'').trim();
  if (!name || name.length>150) throw bad('Asset name is invalid or exceeds 150 characters');
  if (!['TEXT','CREDENTIAL'].includes(formData.assetType)) throw bad('Asset type must be TEXT or CREDENTIAL');
  if (typeof formData.payload!=='string' || !formData.payload.trim()) throw bad('Confidential payload is required');
  if (formData.description && formData.description.length>1000) throw bad('Description exceeds 1000 characters');
  const body={name,assetType:formData.assetType,description:formData.description?.trim()||null,payload:formData.payload};
  if (formData.images?.length) return readAsset(await assetImageService.create(vaultId, body, formData.images, options), vaultId);
  return readAsset(await request(`/vaults/${vaultId}/assets`, {...options,method:'POST',expectedStatus:201,body}),vaultId);
 },
 /**
  * Xem nội dung bí mật: {@code POST /vaults/{vaultId}/assets/{assetId}/reveal} (200) với {@code {password}}.
  * @returns {Promise<{id:string,payload:string}>} Payload đã giải mã.
  */
 async revealAsset(vaultId, assetId, password, options = {}) {
  context(vaultId);
  if (!isUuid(assetId)) throw bad('Asset UUID required', 'ASSET_REQUIRED');
  if (typeof password !== 'string' || !password || password.length > 72) {
    throw bad('Password is required and must not exceed 72 characters', 'VALIDATION_FAILED');
  }
  const data = await passwordRequest(`/vaults/${vaultId}/assets/${assetId}/reveal`, {
    ...options,
    method: 'POST',
    expectedStatus: 200,
    body: { password },
  });
  if (data?.id !== assetId || typeof data?.payload !== 'string') {
    throw new ApiError('INVALID_RESPONSE', 200);
  }
  return { id: data.id, payload: data.payload };
 }
};
