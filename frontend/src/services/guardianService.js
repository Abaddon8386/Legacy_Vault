import { request, ApiError } from '../api/http.js';
import { isUuid } from '../api/contracts.js';
const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
function path(vault, beneficiary) {
  if (!isUuid(vault) || !isUuid(beneficiary)) throw new ApiError('VALIDATION_FAILED');
  return `/vaults/${vault}/beneficiaries/${beneficiary}/guardian`;
}
function read(value, beneficiary) {
  if (value?.beneficiaryId !== beneficiary || !Number.isSafeInteger(value.revision) || value.revision < 0
    || !['MINOR','ADULT','UNKNOWN'].includes(value.ageStatus) || typeof value.guardianRecommended !== 'boolean'
    || (value.guardian !== null && (!isUuid(value.guardian?.id) || typeof value.guardian.fullName !== 'string'))) invalid();
  return value;
}
export const guardianService = {
  async get(v,b,options) { return read(await request(path(v,b), {...options,expectedStatus:200}),b); },
  async save(v,b,data,options) {
    const body = { expectedRevision:data.expectedRevision, fullName:data.fullName?.trim(), relationship:data.relationship?.trim(), email:data.email?.trim()||null, phone:data.phone?.trim()||null };
    if (!Number.isSafeInteger(body.expectedRevision) || body.expectedRevision < 0 || !body.fullName || !body.relationship || (!body.email && !body.phone)) throw new ApiError('VALIDATION_FAILED',400);
    return read(await request(path(v,b), {...options,method:'PUT',body,expectedStatus:200}),b);
  },
  async revoke(v,b,revision,options) { return read(await request(path(v,b)+'/revoke',{...options,method:'POST',body:{expectedRevision:revision},expectedStatus:200}),b); },
  async history(v,b,page,options) {
    const result=await request(path(v,b)+`/history?page=${page}&size=20`,{...options,expectedStatus:200});
    if (!Array.isArray(result?.content) || result.page!==page || !Number.isSafeInteger(result.totalPages)) invalid();
    return result;
  },
};
