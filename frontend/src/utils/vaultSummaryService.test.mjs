import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchVaultSummary, describeNextCheck } from './vaultSummaryService.js';
const id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
test('Overview uses authenticated API totals and keeps unavailable endpoints separate', async () => {
  const result = await fetchVaultSummary(id, { accessToken: 'TEST-ONLY', fetchFn: async (url, options) => {
    assert.equal(options.headers.Authorization, 'Bearer TEST-ONLY');
    if (url.includes('/assets?')) return json({ content: [], totalElements: 12 });
    if (url.endsWith('/configuration-check')) return json({ beneficiaryCount: 2, ready: true, issues: [] });
    return json({ code: 'RESOURCE_NOT_FOUND' }, 404);
  } });
  assert.equal(result.assets.value, 12);
  assert.equal(result.configuration.value.beneficiaryCount, 2);
  assert.equal(result.dms.available, false);
});
test('Overview rejects malformed counts without fabricating zero and propagates expired sessions', async () => {
  const result = await fetchVaultSummary(id, { fetchFn: async () => json({ totalElements: -1, content: [], beneficiaryCount: '0', ready: true, issues: [] }) });
  assert.equal(result.assets.available, false);
  assert.equal(result.configuration.available, false);
  await assert.rejects(fetchVaultSummary(id, { fetchFn: async () => json({ code: 'UNAUTHENTICATED' }, 401) }), error => error.status === 401);
});
test('Overview remaining time distinguishes upcoming and overdue confirmations', () => {
  const now = Date.parse('2026-10-14T00:00:00Z');
  assert.equal(describeNextCheck({ status: 'MONITORING', nextCheckAt: '2026-10-16T00:00:00Z' }, 'vi', now), 'Còn 2 ngày');
  assert.equal(describeNextCheck({ status: 'MONITORING', nextCheckAt: '2026-10-13T00:00:00Z' }, 'vi', now), 'Đã đến hạn xác nhận');
  assert.equal(describeNextCheck({ status: 'TRIGGERED' }, 'en', now), 'Confirmation overdue');
});

test('Overview never mistakes a failed DMS endpoint for an unconfigured schedule', async () => {
  for (const response of [() => json({ code: 'INTERNAL_ERROR' }, 500), () => json({ code: 'VAULT_NOT_FOUND' }, 404), () => new Response('Not Found', { status: 404 })]) {
    const result = await fetchVaultSummary(id, { fetchFn: async () => response() });
    assert.equal(result.dms.available, false);
  }
});
