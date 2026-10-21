import { request, ApiError } from '../api/http.js';

export async function paymentCatalog(options) {
  const rows = await request('/subscription-plans', options);
  if (!Array.isArray(rows) || rows.some(p => !['BASIC', 'STANDARD', 'EXTENDED'].includes(p.code)
    || !Number.isSafeInteger(p.version) || p.version < 1 || !Number.isSafeInteger(p.priceVnd)
    || p.priceVnd < 0 || p.billingModel !== 'LIFETIME')) throw new ApiError('INVALID_RESPONSE');
  return rows;
}
export async function paymentQuote(plan, options) {
  const quote = await request('/subscriptions/me/upgrade-quote', {
    ...options, method: 'POST', body: { planCode: plan.code, catalogVersion: plan.version },
  });
  if (quote?.planCode !== plan.code || quote.catalogVersion !== plan.version
    || quote.amountVnd !== plan.priceVnd || quote.currency !== 'VND' || quote.billingModel !== 'LIFETIME'
    || quote.previousPurchaseCreditVnd !== 0 || typeof quote.paymentAvailable !== 'boolean') throw new ApiError('INVALID_RESPONSE');
  return quote;
}
export function checkoutUrl(value) {
  try {
    const url = new URL(value);
    if (url.origin === 'https://sandbox.vnpayment.vn' && url.pathname === '/paymentv2/vpcpay.html'
      && !url.username && !url.password && !url.hash) return url.href;
  } catch { /* Reject unexpected redirect targets. */ }
  throw new ApiError('INVALID_RESPONSE');
}
export async function createPayment(plan, key, options) {
  const payment = await request('/subscriptions/me/payments', { ...options, method: 'POST',
    body: { planCode: plan.code, catalogVersion: plan.version, idempotencyKey: key } });
  if (payment?.status !== 'PENDING' || payment.planCode !== plan.code
    || payment.catalogVersion !== plan.version || payment.amountVnd !== plan.priceVnd
    || payment.currency !== 'VND' || payment.billingModel !== 'LIFETIME') throw new ApiError('INVALID_RESPONSE');
  return checkoutUrl(payment.checkoutUrl);
}
export async function readPayment(id, options) {
  if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(id)) throw new ApiError('INVALID_RESPONSE');
  const payment = await request(`/subscriptions/me/payments/${id}`, options);
  if (payment?.paymentId !== id || !['PENDING', 'EXPIRED', 'SUCCEEDED', 'FAILED'].includes(payment.status)) throw new ApiError('INVALID_RESPONSE');
  return payment;
}
