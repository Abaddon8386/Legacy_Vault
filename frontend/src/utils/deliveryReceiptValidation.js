// HandoverItemResponse / HandoverDeliveryRequest: the BE transaction is all-or-nothing.
export const isPublicUuid = (value) => typeof value === 'string'
  && /^[a-f\d]{8}(?:-[a-f\d]{4}){3}-[a-f\d]{12}$/i.test(value);

export function readDeliveryReceiptBatch(value, { sessionId, recipientId, assetIds }, { allowSyntheticIds = false } = {}) {
  if (!Array.isArray(value) || !Array.isArray(assetIds) || assetIds.length === 0
    || value.length !== assetIds.length || new Set(assetIds).size !== assetIds.length) return null;
  const expected = new Set(assetIds);
  const received = new Set();
  const itemIds = new Set();
  const validId = allowSyntheticIds ? (id) => typeof id === 'string' && id.length > 0 : isPublicUuid;
  for (const item of value) {
    if (!item || typeof item !== 'object' || Array.isArray(item)
      || !['itemId', 'sessionId', 'recipientId', 'assetId', 'staffId'].every((key) => validId(item[key]))
      || item.sessionId !== sessionId || item.recipientId !== recipientId
      || item.status !== 'DELIVERED' || !expected.has(item.assetId)
      || received.has(item.assetId) || itemIds.has(item.itemId)
      || typeof item.deliveredAt !== 'string'
      || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})?$/.test(item.deliveredAt)
      || !Number.isFinite(Date.parse(item.deliveredAt))) return null;
    received.add(item.assetId);
    itemIds.add(item.itemId);
  }
  return received;
}
