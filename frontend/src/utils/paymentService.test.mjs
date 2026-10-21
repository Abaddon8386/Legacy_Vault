import test from 'node:test';
import assert from 'node:assert/strict';
import { paymentCatalog, paymentQuote, createPayment, readPayment, checkoutUrl } from './paymentService.js';
const plan = { code: 'STANDARD', version: 4, priceVnd: 499000, billingModel: 'LIFETIME' };
const id = '12345678-1234-1234-1234-123456789abc';
const reply = data => async () => ({ ok: true, status: 200, headers: { get: () => 'application/json' }, json: async () => data });
test('catalog and quote use real server price, version and availability', async () => {
  assert.deepEqual(await paymentCatalog({ fetchFn: reply([plan]) }), [plan]);
  await assert.rejects(paymentCatalog({ fetchFn: reply([{ ...plan, priceVnd: -1 }]) }), /INVALID_RESPONSE/);
  const quote = { planCode: 'STANDARD', catalogVersion: 4, amountVnd: 499000, currency: 'VND', billingModel: 'LIFETIME', previousPurchaseCreditVnd: 0, paymentAvailable: false };
  assert.equal((await paymentQuote(plan, { fetchFn: reply(quote) })).paymentAvailable, false);
  await assert.rejects(paymentQuote(plan, { fetchFn: reply({ ...quote, amountVnd: 29000 }) }), /INVALID_RESPONSE/);
});
test('checkout passes owner token and idempotency key without client amount', async () => {
  let calls = [];
  const url = 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_SecureHash=test';
  const fetchFn = async (path, init) => {
    calls.push([path, init]);
    return (await reply({ paymentId: id, status: 'PENDING', planCode: 'STANDARD', catalogVersion: 4,
      amountVnd: 499000, currency: 'VND', billingModel: 'LIFETIME', checkoutUrl: url })());
  };
  assert.equal(await createPayment(plan, id, { accessToken: 'test-owner', fetchFn }), url);
  await createPayment(plan, id, { accessToken: 'test-owner', fetchFn });
  assert.deepEqual(JSON.parse(calls[0][1].body), { planCode: 'STANDARD', catalogVersion: 4, idempotencyKey: id });
  assert.equal(calls[0][1].headers.Authorization, 'Bearer test-owner');
  assert.equal(calls[0][1].body, calls[1][1].body);
});
test('redirects reject other hosts, live endpoint, credentials and fragments', () => {
  for (const value of ['https://evil.test/', 'javascript:alert(1)', 'https://sandbox.vnpayment.vn.evil.test/paymentv2/vpcpay.html',
    'https://pay.vnpay.vn/vpcpay.html', 'https://user:pass@sandbox.vnpayment.vn/paymentv2/vpcpay.html',
    'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html#bad']) assert.throws(() => checkoutUrl(value), /INVALID_RESPONSE/);
});
test('return lookup trusts only owner endpoint status, validates identifier and payload', async () => {
  assert.equal((await readPayment(id, { fetchFn: reply({ paymentId: id, status: 'PENDING' }) })).status, 'PENDING');
  await assert.rejects(readPayment('../other', { fetchFn: reply({}) }), /INVALID_RESPONSE/);
  await assert.rejects(readPayment(id, { fetchFn: reply({ paymentId: id, status: 'CLIENT_SUCCESS' }) }), /INVALID_RESPONSE/);
  await assert.rejects(readPayment(id, { fetchFn: reply({ paymentId: 'different', status: 'SUCCEEDED' }) }), /INVALID_RESPONSE/);
});
