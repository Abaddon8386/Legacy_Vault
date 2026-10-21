import test from 'node:test';
import assert from 'node:assert/strict';
import { createLiveReceivedAssetActions } from '../services/receivedAssetService.js';
import { API_BASE } from '../api/http.js';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const uuid = '11111111-1111-4111-8111-111111111111';
const imageUuid = '22222222-2222-4222-8222-222222222222';
const mockItem = {
  itemId: uuid,
  assetId: uuid,
  vaultId: uuid,
  vaultName: 'Di sản Gia đình',
  name: 'Sổ đỏ nhà đất',
  assetType: 'FILE',
  description: 'Nhà đất Ba Đình',
  allocationNote: 'Giao toàn quyền',
  deliveredAt: '2026-10-21T10:00:00Z',
  status: 'DELIVERED',
  imageCount: 1,
  hasContent: true,
};

test('Live Received Asset Adapter: list/detail/content/image contracts conform to real BE DTO', async () => {
  const calls = [];
  const fakeFetch = async (url, init = {}) => {
    calls.push({ url, init });
    if (url.includes('/received-assets?')) {
      return json({
        content: [mockItem],
        page: 0,
        size: 10,
        totalElements: 1,
        totalPages: 1,
      });
    }
    if (url.endsWith(`/received-assets/${uuid}`)) {
      return json(mockItem);
    }
    if (url.endsWith(`/received-assets/${uuid}/images`)) {
      return json([{ id: imageUuid, fileName: 'so-do.png', contentType: 'image/png', sizeBytes: 1024, createdAt: '2026-10-21T10:00:00Z' }]);
    }
    if (url.endsWith(`/received-assets/${uuid}/content`)) {
      assert.deepEqual(JSON.parse(init.body), { password: 'ValidPassword123' });
      return json({ itemId: uuid, assetId: uuid, payload: 'Nội dung bí mật di chúc' });
    }
    if (url.includes('/download')) {
      assert.deepEqual(JSON.parse(init.body), { password: 'ValidPassword123' });
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        status: 200,
        headers: { 'Content-Type': 'image/png' },
      });
    }
    return json({ code: 'NOT_FOUND' }, 404);
  };

  const adapter = createLiveReceivedAssetActions({
    accessToken: 'test-token',
    userId: uuid,
    fetchFn: fakeFetch,
  });

  // 1. List
  const listResult = await adapter.list({ page: 0, size: 10, fetchFn: fakeFetch });
  assert.equal(listResult.total, 1);
  assert.equal(listResult.accountState, 'RECEIVED');
  assert.equal(listResult.items[0].title, 'Sổ đỏ nhà đất');
  assert.equal(listResult.items[0].status, 'DELIVERED');
  assert.equal(listResult.items[0].deliveredAt, '2026-10-21T10:00:00Z');
  assert.equal(listResult.items[0].sessionStatus, undefined);
  assert.equal(listResult.items[0].vaultStatus, undefined);
  assert.equal(listResult.items[0].caseStatus, undefined);

  // 2. Detail
  const detailResult = await adapter.detail(uuid, { fetchFn: fakeFetch });
  assert.equal(detailResult.title, 'Sổ đỏ nhà đất');
  assert.equal(detailResult.deliveredAt, '2026-10-21T10:00:00Z');
  assert.equal(detailResult.sessionStatus, undefined);
  assert.equal(detailResult.images.length, 1);
  assert.equal(detailResult.images[0].imageId, imageUuid);

  // 3. Content without password rejects with REAUTH_FAILED
  await assert.rejects(
    adapter.content(uuid, { password: '', fetchFn: fakeFetch }),
    { code: 'REAUTH_FAILED', status: 403 }
  );

  // Content with password succeeds
  const contentResult = await adapter.content(uuid, { password: 'ValidPassword123', fetchFn: fakeFetch });
  assert.equal(contentResult.text, 'Nội dung bí mật di chúc');

  // 4. Image without password rejects with REAUTH_FAILED
  await assert.rejects(
    adapter.image(uuid, imageUuid, { password: '', fetchFn: fakeFetch }),
    { code: 'REAUTH_FAILED', status: 403 }
  );

  // Image with password succeeds and uses shared API_BASE
  const blob = await adapter.image(uuid, imageUuid, { password: 'ValidPassword123', fetchFn: fakeFetch });
  assert.ok(blob instanceof Blob);
  const imageCall = calls.find(c => c.url.includes('/download'));
  assert.ok(imageCall);
  assert.ok(imageCall.url.startsWith(API_BASE));
});

test('Live Received Asset Adapter: strictly requires verified principal and validates IDs', async () => {
  const unauthAdapter = createLiveReceivedAssetActions({
    accessToken: 'test-token',
  });

  // Rejects when userId is missing (no default fallback UUID)
  await assert.rejects(
    unauthAdapter.list({ page: 0, size: 10 }),
    { code: 'UNAUTHENTICATED', status: 401 }
  );
  await assert.rejects(
    unauthAdapter.detail(uuid),
    { code: 'UNAUTHENTICATED', status: 401 }
  );

  const authAdapter = createLiveReceivedAssetActions({
    userId: uuid,
  });
  // Invalid item UUID rejection
  await assert.rejects(
    authAdapter.detail('not-a-uuid'),
    { code: 'VALIDATION_FAILED', status: 400 }
  );
  await assert.rejects(
    authAdapter.content('not-a-uuid', { password: 'pwd' }),
    { code: 'VALIDATION_FAILED', status: 400 }
  );
  await assert.rejects(
    authAdapter.image(uuid, 'not-a-uuid', { password: 'pwd' }),
    { code: 'VALIDATION_FAILED', status: 400 }
  );
});


test('Received adapter rejects wrong item, malformed receipts and undelivered status', async () => {
  const adapter = data => createLiveReceivedAssetActions({ userId: uuid, fetchFn: async () => json(data) });
  await assert.rejects(adapter({ ...mockItem, itemId: imageUuid }).detail(uuid), { code: 'INVALID_RESPONSE' });
  await assert.rejects(adapter({ itemId: uuid, assetId: uuid }).content(uuid, { password: 'synthetic' }), { code: 'INVALID_RESPONSE' });
  await assert.rejects(adapter({ content: [{ ...mockItem, status: 'ELIGIBLE' }], page: 0, size: 20, totalElements: 1 }).list(), { code: 'INVALID_RESPONSE' });
  await assert.rejects(adapter({ content: [], page: 0, size: 20 }).list(), { code: 'INVALID_RESPONSE' });
});
