import { ApiError } from '../../api/http.js';

// FE view model only. PS-104 must map its agreed API into this boundary;
// none of these names defines an HTTP request/response or entitlement policy.
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const fail = () => { throw new ApiError('INVALID_RESPONSE'); };
export function assertSubject(value, subjectId) {
  if (!uuid(subjectId) || value?.subjectId !== subjectId) fail();
}
export function readReceivedItem(value) {
  if (!uuid(value?.itemId) || typeof value.title !== 'string' || !value.title.trim()
    || typeof value.sourceLabel !== 'string' || value.deliveryStatus !== 'DELIVERED'
    || typeof value.deliveredAt !== 'string' || !Number.isFinite(Date.parse(value.deliveredAt))
    || !['OPEN', 'COMPLETED', 'CANCELLED'].includes(value.sessionStatus)
    || !['UNLOCKED', 'HANDOVER_IN_PROGRESS', 'ARCHIVED'].includes(value.vaultStatus)
    || !['OPEN', 'CLOSED'].includes(value.caseStatus)) fail();
  // Deliberately copy display fields only: a list cannot expose a secret payload.
  return Object.fromEntries(['itemId', 'title', 'sourceLabel', 'deliveryStatus', 'deliveredAt', 'sessionStatus', 'vaultStatus', 'caseStatus'].map(key => [key, value[key]]));
}
export function readReceivedPage(value, subjectId, page, size) {
  assertSubject(value, subjectId);
  if (!Array.isArray(value.items) || value.page !== page || value.size !== size
    || !Number.isSafeInteger(value.total) || value.total < 0 || value.items.length > size
    || value.items.length !== Math.min(size, Math.max(0, value.total - page * size))
    || !['UNLINKED', 'AWAITING_HANDOVER', 'PARTIAL', 'RECEIVED'].includes(value.accountState)) fail();
  const items = value.items.map(readReceivedItem);
  if (new Set(items.map(item => item.itemId)).size !== items.length || (['UNLINKED', 'AWAITING_HANDOVER'].includes(value.accountState) && value.total !== 0)) fail();
  return { items, page, size, total: value.total, accountState: value.accountState };
}
export function readReceivedDetail(value, subjectId, itemId) {
  assertSubject(value, subjectId);
  const item = readReceivedItem(value);
  if (item.itemId !== itemId || !Array.isArray(value.images)) fail();
  const images = value.images.map(img => {
    if (!uuid(img?.imageId) || typeof img.label !== 'string') fail();
    return { imageId: img.imageId, label: img.label };
  });
  if (new Set(images.map(img => img.imageId)).size !== images.length) fail();
  return { ...item, images };
}
export function readReceivedContent(value, subjectId, itemId) {
  assertSubject(value, subjectId);
  if (value.itemId !== itemId || typeof value.text !== 'string') fail();
  return value.text;
}
export function receivedPreviewAllowed({ accessToken, isDevPreview, testEnv } = {}) {
  return !accessToken && !import.meta.env?.PROD && !testEnv?.PROD && Boolean(import.meta.env?.DEV || testEnv?.DEV) && isDevPreview === true;
}
export function receivedActions(actions, options = {}) {
  if (receivedPreviewAllowed(options)) return options.previewActions;
  if (!options.accessToken) return null;
  return actions && ['list', 'detail', 'content', 'image'].every(key => typeof actions[key] === 'function') ? actions : null;
}

export function formatDeliveredDate(value, lang = 'vi') {
  if (!value) return '—';
  const d = new Date(value);
  if (isNaN(d.getTime())) return '—';
  try {
    return d.toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  } catch {
    return '—';
  }
}
