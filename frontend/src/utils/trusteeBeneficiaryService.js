import {request,ApiError} from '../api/http.js';
import {isUuid,isUtcDate} from '../api/contracts.js';
import {validateTrustee} from './trusteeValidation.js';
import {validateBeneficiary} from './beneficiaryValidation.js';
const fail=()=>{throw new ApiError('INVALID_RESPONSE');};
const context=id=>{if(!isUuid(id)) throw new ApiError('VAULT_REQUIRED');};
const optional=value=>value==null || typeof value==='string';
function person(raw,vaultId) {
 if(!isUuid(raw?.id) || raw.vaultId!==vaultId || typeof raw.fullName!=='string' || !raw.fullName.trim() || raw.fullName.length>150 || !optional(raw.phone) || !optional(raw.email) || !optional(raw.relationship)) fail();
 return {id:raw.id,vaultId,fullName:raw.fullName,phone:raw.phone??null,email:raw.email??null,relationship:raw.relationship??null};
}
export function readTrustee(raw,vaultId) {
 const item=person(raw,vaultId);
 if(!['APPOINTED','REVOKED'].includes(raw.status) || !isUtcDate(raw.appointedAt) || (raw.status==='APPOINTED' ? raw.revokedAt!==null : !isUtcDate(raw.revokedAt))) fail();
 return {...item,status:raw.status,appointedAt:raw.appointedAt,revokedAt:raw.revokedAt};
}
export function readBeneficiary(raw,vaultId) {
 const item=person(raw,vaultId);
 if(raw.status!=='DESIGNATED' || raw.hasAccount!==false || typeof raw.hasIdentityNumber!=='boolean' || !isUtcDate(raw.createdAt) || !optional(raw.dateOfBirth)) fail();
 return {...item,status:raw.status,hasAccount:false,hasIdentityNumber:raw.hasIdentityNumber,dateOfBirth:raw.dateOfBirth??null,createdAt:raw.createdAt};
}
function readPage(raw,vaultId,reader) {
 if(!Array.isArray(raw?.content) || !Number.isSafeInteger(raw.page) || raw.page<0 || !Number.isSafeInteger(raw.size) || raw.size<1 || !Number.isSafeInteger(raw.totalElements) || raw.totalElements<raw.content.length || !Number.isSafeInteger(raw.totalPages) || raw.totalPages<0) fail();
 return {content:raw.content.map(item=>reader(item,vaultId)),page:raw.page,size:raw.size,totalElements:raw.totalElements,totalPages:raw.totalPages};
}
const payload=data=>({fullName:data.fullName.trim(),phone:data.phone?.trim()||null,email:data.email?.trim().toLowerCase()||null,relationship:data.relationship?.trim()||null});
export async function getTrustees(vaultId,options={}) {
 context(vaultId);const page=readPage(await request('/trustees?vaultId='+vaultId,{...options,expectedStatus:200}),vaultId,readTrustee);
 const items=page.content.filter(item=>item.status==='APPOINTED');if(items.length>1 || page.totalPages>1) fail();return items;
}
export async function createTrustee(vaultId,data,options={}) {
 context(vaultId);if(Object.keys(validateTrustee(data)).length) throw new ApiError('VALIDATION_FAILED');
 const item=readTrustee(await request('/trustees',{...options,method:'POST',expectedStatus:201,body:{vaultId,...payload(data)}}),vaultId);
 if(item.status!=='APPOINTED') fail();return item;
}
export async function getBeneficiaries(vaultId,options={}) {
 context(vaultId);const page=options.page??0;if(!Number.isSafeInteger(page)||page<0) throw new ApiError('VALIDATION_FAILED');
 return readPage(await request('/vaults/'+vaultId+'/beneficiaries?page='+page+'&size=20',{...options,expectedStatus:200}),vaultId,readBeneficiary);
}
export async function createBeneficiary(vaultId,data,options={}) {
 context(vaultId);if(Object.keys(validateBeneficiary(data)).length) throw new ApiError('VALIDATION_FAILED');
 return readBeneficiary(await request('/vaults/'+vaultId+'/beneficiaries',{...options,method:'POST',expectedStatus:201,body:{...payload(data),dateOfBirth:data.dateOfBirth||null}}),vaultId);
}
export async function checkConfigurationReadiness(vaultId,options={}) {
 context(vaultId);const data=await request('/vaults/'+vaultId+'/configuration-check',{...options,expectedStatus:200});
 if(data?.vaultId!==vaultId || typeof data.ready!=='boolean' || !Number.isSafeInteger(data.beneficiaryCount) || data.beneficiaryCount<0 || !Array.isArray(data.issues) || data.issues.some(issue=>typeof issue.code!=='string') || data.ready!==(data.beneficiaryCount>=1) || (data.ready && data.issues.length) || (!data.ready && !data.issues.some(issue=>issue.code==='BENEFICIARY_REQUIRED'))) fail();
 return {isReady:data.ready,beneficiaryCount:data.beneficiaryCount,issues:data.issues.map(issue=>({code:issue.code}))};
}
