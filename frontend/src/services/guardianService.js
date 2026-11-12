import { request, ApiError } from '../api/http.js';
import { isUuid } from '../api/contracts.js';
/**
 * Ném {@code INVALID_RESPONSE} khi phản hồi backend sai hợp đồng.
 */
const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
/**
 * Dựng đường dẫn {@code /vaults/{vault}/beneficiaries/{beneficiary}/guardian}; kiểm tra cả hai id là UUID.
 */
function path(vault, beneficiary) {
  if (!isUuid(vault) || !isUuid(beneficiary)) throw new ApiError('VALIDATION_FAILED');
  return `/vaults/${vault}/beneficiaries/${beneficiary}/guardian`;
}
/**
 * Xác thực thông tin người giám hộ: đúng người thừa hưởng, revision, {@code ageStatus} (MINOR/ADULT/UNKNOWN), {@code guardianRecommended}, và guardian (id + fullName) hoặc null.
 */
function read(value, beneficiary) {
  if (value?.beneficiaryId !== beneficiary || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !['MINOR','ADULT','UNKNOWN'].includes(value.ageStatus) || typeof value.guardianRecommended !== 'boolean'
    || (value.guardian !== null && (!isUuid(value.guardian?.id) || typeof value.guardian.fullName !== 'string'))) invalid();
  return value;
}
/**
 * Service người giám hộ của người thừa hưởng chưa thành niên (chủ hầm quản lý), dưới {@code /vaults/{v}/beneficiaries/{b}/guardian}.
 */
export const guardianService = {
  /**
   * Xem người giám hộ hiện tại: {@code GET /vaults/{v}/beneficiaries/{b}/guardian} (200).
   */
  async get(v,b,options) { return read(await request(path(v,b), {...options,expectedStatus:200}),b); },
  /**
   * Lưu người giám hộ: {@code PUT /vaults/{v}/beneficiaries/{b}/guardian} với {expectedRevision, fullName, relationship, email, phone}
   * (cần ít nhất email hoặc điện thoại; dùng revision để chống ghi đè đồng thời).
   */
  async save(v,b,data,options) {
    const body = { expectedRevision:data.expectedRevision, fullName:data.fullName?.trim(), relationship:data.relationship?.trim(), email:data.email?.trim()||null, phone:data.phone?.trim()||null };
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !body.fullName || !body.relationship || (!body.email && !body.phone)) throw new ApiError('VALIDATION_FAILED',400);
    return read(await request(path(v,b), {...options,method:'PUT',body,expectedStatus:200}),b);
  },
  /**
   * Thu hồi người giám hộ: {@code POST /vaults/{v}/beneficiaries/{b}/guardian/revoke} với {@code {expectedRevision}}.
   */
  async revoke(v,b,revision,options) { return read(await request(path(v,b)+'/revoke',{...options,method:'POST',body:{expectedRevision:revision},expectedStatus:200}),b); },
  /**
   * Lịch sử thay đổi người giám hộ: {@code GET /vaults/{v}/beneficiaries/{b}/guardian/history?page&size=20}.
   */
  async history(v,b,page,options) {
    const result=await request(path(v,b)+`/history?page=${page}&size=20`,{...options,expectedStatus:200});
    if (!Array.isArray(result?.content) || result.page!==page || !Number.isSafeInteger(result.totalPages)) invalid();
    return result;
  },
};
