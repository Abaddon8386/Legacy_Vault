import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatBytes,
  formatVnd,
  adminSubscriptionErrorMessage,
  fetchAdminPlans,
  fetchAdminPlanDetail,
  createAdminPlanDraft,
  updateAdminPlanDraft,
  publishAdminPlanVersion,
  deprecateAdminPlanVersion,
  lookupAdminAccount,
  lookupAdminTransactions,
  ApiError,
} from './adminSubscriptionService.js';

test('formatBytes formats values correctly', () => {
  assert.equal(formatBytes(0), '0 B');
  assert.equal(formatBytes(1024), '1 KB');
  assert.equal(formatBytes(10485760), '10 MB');
  assert.equal(formatBytes(1073741824), '1 GB');
  assert.equal(formatBytes(5368709120), '5 GB');
});

test('formatVnd formats Vietnamese currency correctly', () => {
  assert.equal(formatVnd(0), '0 ₫');
  assert.match(formatVnd(499000), /499[\.,]000\s*₫/);
  assert.match(formatVnd(199000), /199[\.,]000\s*₫/);
  assert.equal(formatVnd(999000, 'en'), '999,000 VND / lifetime');
});

test('adminSubscriptionErrorMessage handles error codes and status', () => {
  assert.match(adminSubscriptionErrorMessage(new ApiError('UNAUTHENTICATED', 401), 'vi'), /đăng nhập/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('UNAUTHENTICATED', 401), 'en'), /sign in/i);

  assert.match(adminSubscriptionErrorMessage(new ApiError('ACCESS_DENIED', 403), 'vi'), /quản trị/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('ACCESS_DENIED', 403), 'en'), /administrator/i);

  assert.match(adminSubscriptionErrorMessage(new ApiError('RESOURCE_NOT_FOUND', 404), 'vi'), /Không tìm thấy/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('PLAN_VERSION_NOT_EDITABLE', 409), 'vi'), /bản nháp/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('PLAN_VERSION_ALREADY_EXISTS', 409), 'vi'), /Đã tồn tại/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('SUBSCRIPTION_CATALOG_STALE', 409), 'vi'), /thay đổi/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('PLAN_VERSION_CONFLICT', 409), 'vi'), /thay đổi/i);
  assert.match(adminSubscriptionErrorMessage(new ApiError('PAYMENT_TRANSACTION_SOURCE_UNAVAILABLE', 409), 'vi'), /chưa khả dụng/i);
});

test('API client functions call expected endpoints with parameters', async () => {
  const calls = [];
  const fakeFetch = async (url, opts) => {
    calls.push({ url, opts });
    const isPostCreate = opts?.method === 'POST' && url.endsWith('/versions');
    return {
      ok: true,
      status: isPostCreate ? 201 : 200,
      headers: { get: () => 'application/json' },
      json: async () => url.includes('/accounts?') ? {assetCount:8,assetLimit:5,storageBytes:1,storageBytesLimit:100} : ({ success: true }),
    };
  };

  await fetchAdminPlans({ fetchFn: fakeFetch, accessToken: 'token-admin' });
  assert.match(calls[0].url, /\/api\/v1\/admin\/subscriptions\/plans$/);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer token-admin');

  await fetchAdminPlanDetail('BASIC', { fetchFn: fakeFetch });
  assert.match(calls[1].url, /\/plans\/BASIC$/);

  await createAdminPlanDraft('STANDARD', { nameVi: 'Mới' }, { fetchFn: fakeFetch });
  assert.equal(calls[2].opts.method, 'POST');
  assert.match(calls[2].url, /\/plans\/STANDARD\/versions$/);

  await updateAdminPlanDraft('STANDARD', 3, { nameVi: 'Sửa' }, { fetchFn: fakeFetch });
  assert.equal(calls[3].opts.method, 'PUT');
  assert.match(calls[3].url, /\/plans\/STANDARD\/versions\/3$/);

  await publishAdminPlanVersion('STANDARD', 3, { changeNote: 'Go live' }, { fetchFn: fakeFetch });
  assert.equal(calls[4].opts.method, 'POST');
  assert.match(calls[4].url, /\/plans\/STANDARD\/versions\/3\/publish$/);

  await deprecateAdminPlanVersion('STANDARD', 2, { fetchFn: fakeFetch });
  assert.equal(calls[5].opts.method, 'POST');
  assert.match(calls[5].url, /\/plans\/STANDARD\/versions\/2\/deprecate$/);

  await lookupAdminAccount('owner@test.com', { fetchFn: fakeFetch });
  assert.match(calls[6].url, /\/accounts\?query=owner%40test\.com$/);

  await lookupAdminTransactions('query-tx', { fetchFn: fakeFetch });
  assert.match(calls[7].url, /\/transactions\?query=query-tx$/);
});
