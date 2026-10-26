import { request, ApiError } from '../api/http.js';

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const integer = n => Number.isSafeInteger(n) && n >= 0;
const instant = s => typeof s === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s));
export const paymentStatuses = ['PENDING', 'EXPIRED', 'SUCCEEDED', 'FAILED'];
function invalid() { throw new ApiError('INVALID_RESPONSE'); }

export function readAdminPayment(x) {
  if (!x || !uuid.test(x.paymentId) || !uuid.test(x.accountId) || typeof x.accountEmail !== 'string' ||
      !['STANDARD', 'EXTENDED', 'BASIC'].includes(x.planCode) || !integer(x.catalogVersion) || x.catalogVersion < 1 ||
      !integer(x.amountVnd) || x.currency !== 'VND' || x.billingModel !== 'LIFETIME' ||
      !paymentStatuses.includes(x.status) || !['PENDING', 'SUCCEEDED', 'FAILED'].includes(x.persistedStatus) ||
      (x.status === 'EXPIRED' ? x.persistedStatus !== 'PENDING' : x.status !== x.persistedStatus) ||
      !instant(x.createdAt) || !instant(x.expiresAt) || (x.completedAt !== null && !instant(x.completedAt)) ||
      !/^[0-9a-f]{32}$/i.test(x.checkoutReference) || x.checkoutReference.toLowerCase() !== x.paymentId.replaceAll('-', '').toLowerCase() ||
      (x.gatewayReference !== null && typeof x.gatewayReference !== 'string') ||
      !x.limits || !['assetCount', 'storageBytes', 'fileBytes'].every(k => integer(x.limits[k]))) invalid();
  return Object.fromEntries(['paymentId','accountId','accountEmail','planCode','catalogVersion','amountVnd','currency',
    'billingModel','status','persistedStatus','createdAt','expiresAt','completedAt','gatewayReference','checkoutReference']
    .map(k => [k,x[k]]).concat([['limits',Object.fromEntries(['assetCount','storageBytes','fileBytes'].map(k=>[k,x.limits[k]]))]]));
}

export async function fetchAdminPayments(filters = {}, options = {}) {
  const { query = '', accountId = '', status = '', from = '', to = '', page = 0, size = 20 } = filters;
  if (typeof query !== 'string' || query.trim().length > 254 || [...query].some(c=>c.charCodeAt(0)<32 || c.charCodeAt(0)===127) ||
      !integer(page) || !integer(size) || size < 1 || size > 100 ||
      (accountId && !uuid.test(accountId)) || (status && !paymentStatuses.includes(status)) ||
      (from && !instant(from)) || (to && !instant(to)) || (from && to && Date.parse(from) >= Date.parse(to))) {
    throw new ApiError('VALIDATION_FAILED',400);
  }
  const params = new URLSearchParams();
  for (const [k,v] of Object.entries({query:query.trim(),accountId,status,from,to,page,size})) if (v !== '') params.set(k,v);
  const data = await request(`/admin/subscriptions/transactions?${params}`,{...options,expectedStatus:200});
  if (!data || !Array.isArray(data.content) || data.page !== page || data.size !== size ||
      !integer(data.totalElements) || !integer(data.totalPages) || data.totalPages !== Math.ceil(data.totalElements / size) ||
      data.content.length > size || data.content.length !== Math.min(size,Math.max(0,data.totalElements-page*size))) invalid();
  const content=data.content.map(readAdminPayment);
  if (new Set(content.map(x=>x.paymentId)).size !== content.length) invalid();
  return {content,page,size,totalElements:data.totalElements,totalPages:data.totalPages};
}

export async function fetchAdminPayment(id,options={}) {
  if (!uuid.test(id)) throw new ApiError('VALIDATION_FAILED',400);
  const data=readAdminPayment(await request(`/admin/subscriptions/transactions/${id}`,{...options,expectedStatus:200}));
  if (data.paymentId !== id) invalid();
  return data;
}
