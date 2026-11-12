/**
 * Dịch vụ quản lý Người thi hành bên ngoài (trustee) và Người thụ hưởng của một kho cho chủ kho (ROLE_VAULT_OWNER). Dùng bởi pages/trusteeBeneficiary/TrusteeBeneficiaryPage.jsx và RelatedPersonEditDialog.jsx. Phản hồi sai hợp đồng sẽ ném INVALID_RESPONSE.
 */
import {request,ApiError} from '../api/http.js';
import {isUuid,isUtcDate} from '../api/contracts.js';
import {validateTrustee} from './trusteeValidation.js';
import {validateBeneficiary} from './beneficiaryValidation.js';
/**
 * Ném ApiError INVALID_RESPONSE.
 */
const fail=()=>{throw new ApiError('INVALID_RESPONSE');};
/**
 * Bắt buộc vaultId là UUID, nếu không ném ApiError VAULT_REQUIRED.
 */
const context=id=>{if(!isUuid(id)) throw new ApiError('VAULT_REQUIRED');};
/**
 * Giá trị tùy chọn: null/undefined hoặc chuỗi.
 */
const optional=value=>value==null || typeof value==='string';
/**
 * Kiểm tra các trường chung của một người liên quan (id UUID, vaultId khớp, fullName 1-150 ký tự, phone/email/relationship tùy chọn) và trả bản chuẩn hóa.
 */
function person(raw,vaultId) {
 if(!isUuid(raw?.id) || raw.vaultId!==vaultId || typeof raw.fullName!=='string' || !raw.fullName.trim() || raw.fullName.length>150 || !optional(raw.phone) || !optional(raw.email) || !optional(raw.relationship)) fail();
 return {id:raw.id,vaultId,fullName:raw.fullName,phone:raw.phone??null,email:raw.email??null,relationship:raw.relationship??null};
}
/**
 * Chuẩn hóa một trustee: thêm note, status (APPOINTED hoặc REVOKED), appointedAt và revokedAt (null khi APPOINTED, thời điểm hợp lệ khi REVOKED).
 */
export function readTrustee(raw,vaultId) {
 const item=person(raw,vaultId);
 if(!optional(raw.note) || !['APPOINTED','REVOKED'].includes(raw.status) || !isUtcDate(raw.appointedAt) || (raw.status==='APPOINTED' ? raw.revokedAt!==null : !isUtcDate(raw.revokedAt))) fail();
 return {...item,note:typeof raw.note==='string'?raw.note:null,status:raw.status,appointedAt:raw.appointedAt,revokedAt:raw.revokedAt};
}
/**
 * Chuẩn hóa một người thụ hưởng: status phải là DESIGNATED, hasAccount và hasIdentityNumber là boolean, createdAt hợp lệ, dateOfBirth tùy chọn.
 */
export function readBeneficiary(raw,vaultId) {
 const item=person(raw,vaultId);
 if(raw.status!=='DESIGNATED' || typeof raw.hasAccount!=='boolean' || typeof raw.hasIdentityNumber!=='boolean' || !isUtcDate(raw.createdAt) || !optional(raw.dateOfBirth)) fail();
 return {...item,status:raw.status,hasAccount:raw.hasAccount,hasIdentityNumber:raw.hasIdentityNumber,dateOfBirth:raw.dateOfBirth??null,createdAt:raw.createdAt};
}
/**
 * Kiểm tra phân trang {content, page, size, totalElements, totalPages} rồi chuẩn hóa từng phần tử bằng reader.
 */
function readPage(raw,vaultId,reader) {
 if(!Array.isArray(raw?.content) || !Number.isSafeInteger(raw.page) || raw.page<0 || !Number.isSafeInteger(raw.size) || raw.size<1 || !Number.isSafeInteger(raw.totalElements) || raw.totalElements<raw.content.length || !Number.isSafeInteger(raw.totalPages) || raw.totalPages<0) fail();
 return {content:raw.content.map(item=>reader(item,vaultId)),page:raw.page,size:raw.size,totalElements:raw.totalElements,totalPages:raw.totalPages};
}
/**
 * Dựng phần thân gửi backend: trim, email chữ thường, chuỗi rỗng thành null.
 */
const payload=data=>({fullName:data.fullName.trim(),phone:data.phone?.trim()||null,email:data.email?.trim().toLowerCase()||null,relationship:data.relationship?.trim()||null});
/**
 * Gọi GET /api/v1/trustees?vaultId={vaultId} (mong đợi 200); trả danh sách trustee đang APPOINTED (tối đa 1, nếu nhiều hơn thì INVALID_RESPONSE).
 */
export async function getTrustees(vaultId,options={}) {
 context(vaultId);const page=readPage(await request('/trustees?vaultId='+vaultId,{...options,expectedStatus:200}),vaultId,readTrustee);
 const items=page.content.filter(item=>item.status==='APPOINTED');if(items.length>1 || page.totalPages>1) fail();return items;
}
/**
 * Gọi POST /api/v1/trustees với {vaultId, fullName, phone, email, relationship} (mong đợi 201). Kiểm tra form bằng validateTrustee (ném VALIDATION_FAILED); kết quả phải APPOINTED.
 */
export async function createTrustee(vaultId,data,options={}) {
 context(vaultId);if(Object.keys(validateTrustee(data)).length) throw new ApiError('VALIDATION_FAILED');
 const item=readTrustee(await request('/trustees',{...options,method:'POST',expectedStatus:201,body:{vaultId,...payload(data)}}),vaultId);
 if(item.status!=='APPOINTED') fail();return item;
}
/**
 * Gọi GET /api/v1/vaults/{vaultId}/beneficiaries?page=&size=20 (mong đợi 200); trả trang người thụ hưởng đã chuẩn hóa.
 */
export async function getBeneficiaries(vaultId,options={}) {
 context(vaultId);const page=options.page??0;if(!Number.isSafeInteger(page)||page<0) throw new ApiError('VALIDATION_FAILED');
 return readPage(await request('/vaults/'+vaultId+'/beneficiaries?page='+page+'&size=20',{...options,expectedStatus:200}),vaultId,readBeneficiary);
}
/**
 * Gọi POST /api/v1/vaults/{vaultId}/beneficiaries (mong đợi 201) với thông tin người thụ hưởng và dateOfBirth. Kiểm tra form bằng validateBeneficiary.
 */
export async function createBeneficiary(vaultId,data,options={}) {
 context(vaultId);if(Object.keys(validateBeneficiary(data)).length) throw new ApiError('VALIDATION_FAILED');
 return readBeneficiary(await request('/vaults/'+vaultId+'/beneficiaries',{...options,method:'POST',expectedStatus:201,body:{...payload(data),dateOfBirth:data.dateOfBirth||null}}),vaultId);
}
/**
 * Gọi GET /api/v1/vaults/{vaultId}/configuration-check (mong đợi 200) để biết cấu hình đã sẵn sàng chưa (cần ít nhất 1 người thụ hưởng; issues chứa BENEFICIARY_REQUIRED khi chưa đủ). Trả {isReady, beneficiaryCount, issues}.
 */
export async function checkConfigurationReadiness(vaultId,options={}) {
 context(vaultId);const data=await request('/vaults/'+vaultId+'/configuration-check',{...options,expectedStatus:200});
 if(data?.vaultId!==vaultId || typeof data.ready!=='boolean' || !Number.isSafeInteger(data.beneficiaryCount) || data.beneficiaryCount<0 || !Array.isArray(data.issues) || data.issues.some(issue=>typeof issue.code!=='string') || data.ready!==(data.beneficiaryCount>=1) || (data.ready && data.issues.length) || (!data.ready && !data.issues.some(issue=>issue.code==='BENEFICIARY_REQUIRED'))) fail();
 return {isReady:data.ready,beneficiaryCount:data.beneficiaryCount,issues:data.issues.map(issue=>({code:issue.code}))};
}

/**
 * Gọi PUT /api/v1/trustees/{trusteeId} (mong đợi 200) với thông tin mới kèm note; kết quả phải đúng id và còn APPOINTED.
 */
export async function updateTrustee(vaultId, trusteeId, data, options = {}) {
 context(vaultId); if (!isUuid(trusteeId)) throw new ApiError('INVALID_RESPONSE');
 if (Object.keys(validateTrustee(data)).length) throw new ApiError('VALIDATION_FAILED');
 const item=readTrustee(await request('/trustees/'+trusteeId,{...options,method:'PUT',expectedStatus:200,body:{...payload(data),note:data.note??null}}),vaultId);
 if(item.id!==trusteeId || item.status!=='APPOINTED') fail();return item;
}
/**
 * Gọi PUT /api/v1/vaults/{vaultId}/beneficiaries/{beneficiaryId} (mong đợi 200) với thông tin mới; kết quả phải đúng id.
 */
export async function updateBeneficiary(vaultId, beneficiaryId, data, options = {}) {
 context(vaultId); if (!isUuid(beneficiaryId)) throw new ApiError('INVALID_RESPONSE');
 if (Object.keys(validateBeneficiary(data)).length) throw new ApiError('VALIDATION_FAILED');
 const item=readBeneficiary(await request('/vaults/'+vaultId+'/beneficiaries/'+beneficiaryId,{...options,method:'PUT',expectedStatus:200,body:{...payload(data),dateOfBirth:data.dateOfBirth||null}}),vaultId);
 if(item.id!==beneficiaryId) fail();return item;
}
