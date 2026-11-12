/**
 * Dịch vụ phía frontend cho màn hình "Giao dịch thanh toán" của quản trị viên (ROLE_ADMIN).
 * Gọi các endpoint /api/v1/admin/subscriptions/transactions của backend, đồng thời kiểm tra chặt chẽ
 * hợp đồng (contract) dữ liệu trả về; nếu sai định dạng sẽ ném ApiError('INVALID_RESPONSE').
 * Được dùng bởi pages/admin/AdminPaymentTransactions.jsx.
 */
import { request, ApiError } from '../api/http.js';

/**
 * Biểu thức chính quy kiểm tra chuỗi UUID (không phân biệt hoa thường).
 */
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/**
 * Kiểm tra giá trị là số nguyên an toàn không âm.
 */
const integer = n => Number.isSafeInteger(n) && n >= 0;
/**
 * Kiểm tra chuỗi là thời điểm ISO-8601 hợp lệ và có múi giờ (hậu tố Z hoặc +hh:mm).
 */
const instant = s => typeof s === 'string' && /(?:Z|[+-]\d\d:\d\d)$/.test(s) && Number.isFinite(Date.parse(s));
/**
 * Các trạng thái giao dịch hiển thị cho admin. EXPIRED là trạng thái suy ra từ PENDING đã quá hạn (persistedStatus vẫn là PENDING).
 */
export const paymentStatuses = ['PENDING', 'EXPIRED', 'SUCCEEDED', 'FAILED'];
/**
 * Ném ApiError INVALID_RESPONSE khi dữ liệu backend không đúng hợp đồng.
 */
function invalid() { throw new ApiError('INVALID_RESPONSE'); }

/**
 * Kiểm tra và chuẩn hóa một bản ghi giao dịch thanh toán do backend trả về.
 * Xác thực kiểu/giá trị từng trường (paymentId, accountId, planCode, amountVnd, status, persistedStatus, checkoutReference, limits...),
 * đảm bảo checkoutReference khớp paymentId, và chỉ sao chép đúng các trường được phép (whitelist).
 * @param {object} x Bản ghi thô từ API.
 * @returns {object} Bản ghi đã chuẩn hóa.
 * @throws {ApiError} INVALID_RESPONSE nếu sai hợp đồng.
 */
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

/**
 * Lấy danh sách giao dịch thanh toán có phân trang và bộ lọc.
 * Gọi GET /api/v1/admin/subscriptions/transactions?query=&accountId=&status=&from=&to=&page=&size= (yêu cầu ROLE_ADMIN).
 * Kiểm tra bộ lọc phía client trước (độ dài query, UUID, khoảng thời gian, size 1..100) rồi kiểm tra tính nhất quán của trang trả về.
 * @param {object} filters Bộ lọc: query, accountId, status, from, to, page (từ 0), size.
 * @param {object} options Tùy chọn truyền cho request() (accessToken, signal...).
 * @returns {Promise<{content:object[],page:number,size:number,totalElements:number,totalPages:number}>}
 * @throws {ApiError} VALIDATION_FAILED (400) nếu bộ lọc sai; INVALID_RESPONSE nếu phản hồi sai hợp đồng.
 */
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

/**
 * Lấy chi tiết một giao dịch thanh toán.
 * Gọi GET /api/v1/admin/subscriptions/transactions/{id} (yêu cầu ROLE_ADMIN) và kiểm tra paymentId trả về trùng id yêu cầu.
 * @param {string} id UUID giao dịch.
 * @param {object} options Tùy chọn request().
 * @throws {ApiError} VALIDATION_FAILED nếu id không phải UUID; INVALID_RESPONSE nếu sai hợp đồng.
 */
export async function fetchAdminPayment(id,options={}) {
  if (!uuid.test(id)) throw new ApiError('VALIDATION_FAILED',400);
  const data=readAdminPayment(await request(`/admin/subscriptions/transactions/${id}`,{...options,expectedStatus:200}));
  if (data.paymentId !== id) invalid();
  return data;
}
