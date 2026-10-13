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
 }
};
