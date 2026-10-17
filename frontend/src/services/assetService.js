import { request, ApiError } from '../api/http.js';
import { isUuid, isUtcDate } from '../api/contracts.js';
const bad = (message, code = 'VALIDATION_FAILED') => { const error = new ApiError(code); error.message = message; return error; };
function context(vaultId) { if (!isUuid(vaultId)) throw bad('vaultId is required', 'VAULT_REQUIRED'); }
export function readAsset(raw, vaultId) {
  if (!isUuid(raw?.id) || raw.vaultId !== vaultId || typeof raw.name !== 'string' || !raw.name.trim() ||
      !['TEXT','CREDENTIAL','FILE'].includes(raw.assetType) || typeof raw.hasPayload !== 'boolean' ||
      !isUtcDate(raw.createdAt) || !isUtcDate(raw.updatedAt)) throw new ApiError('INVALID_RESPONSE');
  return { id: raw.id, vaultId, name: raw.name, assetType: raw.assetType, description: raw.description ?? null,
    hasPayload: raw.hasPayload, createdAt: raw.createdAt, updatedAt: raw.updatedAt };
}
export const assetService = {
 async getAssetById(vaultId, assetId, options = {}) {
  context(vaultId); if (!isUuid(assetId)) throw bad('Asset UUID required', 'ASSET_REQUIRED');
  const item = readAsset(await request('/vaults/'+vaultId+'/assets/'+assetId, {...options,expectedStatus:200}),vaultId);
  if (item.id !== assetId) throw new ApiError('INVALID_RESPONSE'); return item;
 },
 async updateAsset(vaultId, assetId, patch, options = {}) {
  context(vaultId); if (!isUuid(assetId)) throw bad('Asset UUID required','ASSET_REQUIRED');
  if (!patch || typeof patch !== 'object') throw bad('Patch required');
  const body = {};
  if (patch.name !== undefined) { if (typeof patch.name !== 'string' || !patch.name.trim() || patch.name.trim().length>150) throw bad('Invalid name'); body.name=patch.name.trim(); }
  if (patch.description !== undefined) { if (patch.description !== null && (typeof patch.description !== 'string' || patch.description.length>1000)) throw bad('Invalid description'); body.description=patch.description?.trim()||null; }
  if (patch.payload !== undefined) { if (typeof patch.payload !== 'string' || !patch.payload.trim()) throw bad('Invalid payload'); body.payload=patch.payload; }
  if (!Object.keys(body).length) throw bad('No editable fields');
  const item = readAsset(await request('/vaults/'+vaultId+'/assets/'+assetId, {...options,method:'PATCH',expectedStatus:200,body}),vaultId);
  if (item.id !== assetId) throw new ApiError('INVALID_RESPONSE'); return item;
 },
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
 async createAsset(vaultId, formData, options = {}) {
  context(vaultId);
  if (!formData || typeof formData!=='object') throw bad('Form data is required');
  const name=String(formData.name||'').trim();
  if (!name || name.length>150) throw bad('Asset name is invalid or exceeds 150 characters');
  if (!['TEXT','CREDENTIAL'].includes(formData.assetType)) throw bad('Asset type must be TEXT or CREDENTIAL');
  if (typeof formData.payload!=='string' || !formData.payload.trim()) throw bad('Confidential payload is required');
  if (formData.description && formData.description.length>1000) throw bad('Description exceeds 1000 characters');
  const body={name,assetType:formData.assetType,description:formData.description?.trim()||null,payload:formData.payload};
  return readAsset(await request(`/vaults/${vaultId}/assets`, {...options,method:'POST',expectedStatus:201,body}),vaultId);
 },
 async revealAsset(vaultId, assetId, password, options = {}) {
  context(vaultId);
  if (!isUuid(assetId)) throw bad('Asset UUID required', 'ASSET_REQUIRED');
  if (typeof password !== 'string' || !password || password.length > 72) {
    throw bad('Password is required and must not exceed 72 characters', 'VALIDATION_FAILED');
  }
  const data = await request(`/vaults/${vaultId}/assets/${assetId}/reveal`, {
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
