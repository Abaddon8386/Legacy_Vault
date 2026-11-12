/**
 * Dịch vụ thanh toán nâng cấp gói của chủ kho qua VNPay (sandbox). Dùng bởi pages/subscription/PaymentCheckout.jsx. Mọi phản hồi đều được đối chiếu với gói đã chọn; sai thì ném ApiError INVALID_RESPONSE.
 */
import { request, ApiError } from '../api/http.js';

/**
 * Gọi GET /api/v1/subscription-plans lấy danh mục gói (BASIC, STANDARD, EXTENDED; mô hình LIFETIME) và kiểm tra version, priceVnd hợp lệ.
 */
export async function paymentCatalog(options) {
  const rows = await request('/subscription-plans', options);
  if (!Array.isArray(rows) || rows.some(p => !['BASIC', 'STANDARD', 'EXTENDED'].includes(p.code)
    || !Number.isSafeInteger(p.version) || p.version < 1 || !Number.isSafeInteger(p.priceVnd)
    || p.priceVnd < 0 || p.billingModel !== 'LIFETIME')) throw new ApiError('INVALID_RESPONSE');
  return rows;
}
/**
 * Gọi POST /api/v1/subscriptions/me/upgrade-quote với {planCode, catalogVersion} để lấy báo giá nâng cấp; kiểm tra khớp gói, phiên bản, số tiền, VND, LIFETIME và cờ paymentAvailable.
 */
export async function paymentQuote(plan, options) {
  const quote = await request('/subscriptions/me/upgrade-quote', {
    ...options, method: 'POST', body: { planCode: plan.code, catalogVersion: plan.version },
  });
  if (quote?.planCode !== plan.code || quote.catalogVersion !== plan.version
    || quote.amountVnd !== plan.priceVnd || quote.currency !== 'VND' || quote.billingModel !== 'LIFETIME'
    || quote.previousPurchaseCreditVnd !== 0 || typeof quote.paymentAvailable !== 'boolean') throw new ApiError('INVALID_RESPONSE');
  return quote;
}
/**
 * Chỉ chấp nhận URL thanh toán đúng của VNPay sandbox (https://sandbox.vnpayment.vn/paymentv2/vpcpay.html, không user/password/hash); URL khác ném INVALID_RESPONSE để chống chuyển hướng lạ.
 */
export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://sandbox.vnpayment.vn' && url.pathname === '/paymentv2/vpcpay.html'
      && !url.username && !url.password && !url.hash) return url.href;
  } catch { /* Reject unexpected redirect targets. */ }
  throw new ApiError('INVALID_RESPONSE');
}
/**
 * Gọi POST /api/v1/subscriptions/me/payments với {planCode, catalogVersion, idempotencyKey} để tạo giao dịch (phải ở trạng thái PENDING và khớp báo giá), trả về URL thanh toán đã kiểm tra bằng checkoutUrl.
 */
export async function createPayment(plan, key, options) {
  const payment = await request('/subscriptions/me/payments', { ...options, method: 'POST',
    body: { planCode: plan.code, catalogVersion: plan.version, idempotencyKey: key } });
  if (payment?.status !== 'PENDING' || payment.planCode !== plan.code
    || payment.catalogVersion !== plan.version || payment.amountVnd !== plan.priceVnd
    || payment.currency !== 'VND' || payment.billingModel !== 'LIFETIME') throw new ApiError('INVALID_RESPONSE');
  return checkoutUrl(payment.checkoutUrl);
}
/** Sends VNPay's signed return query so the server can close a cancelled checkout; it can never grant a plan. */
export async function reportPaymentReturnFailure(id, query, options) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new ApiError('INVALID_RESPONSE');
  const signed = new URLSearchParams();
  for (const [key, value] of query) if (key.startsWith('vnp_')) signed.append(key, value);
  return request(`/subscriptions/me/payments/${id}/return-failure?${signed}`, { ...options, method: 'POST' });
}
/**
 * Gọi GET /api/v1/subscriptions/me/payments/{id} để đọc trạng thái giao dịch (PENDING, EXPIRED, SUCCEEDED, FAILED); kiểm tra id là UUID và khớp paymentId trả về.
 */
export async function readPayment(id, options) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new ApiError('INVALID_RESPONSE');
  const payment = await request(`/subscriptions/me/payments/${id}`, options);
  if (payment?.paymentId !== id || !['PENDING', 'EXPIRED', 'SUCCEEDED', 'FAILED'].includes(payment.status)) throw new ApiError('INVALID_RESPONSE');
  return payment;
}
