import { request, ApiError, API_BASE } from '../api/http.js';
import { isUuid } from '../api/contracts.js';

const invalid = () => { throw new ApiError('INVALID_RESPONSE'); };
function validateItem(item) {
  if (!item || !isUuid(item.itemId) || !isUuid(item.assetId) || !isUuid(item.vaultId)
    || typeof item.name !== 'string' || !item.name.trim() || typeof item.vaultName !== 'string'
    || !['DELIVERED', 'VERIFIED_BY_BENEFICIARY'].includes(item.status)
    || typeof item.deliveredAt !== 'string' || !Number.isFinite(Date.parse(item.deliveredAt))) invalid();
}

export function createLiveReceivedAssetActions(globalDefaults = {}) {
  const resolveSubjectId = (opts = {}) => {
    const subjectId = opts.userId || globalDefaults.userId;
    if (!subjectId || !isUuid(subjectId)) {
      throw new ApiError('UNAUTHENTICATED', 401);
    }
    return subjectId;
  };

  return {
    async list(options = {}) {
      const opts = { ...globalDefaults, ...options };
      const subjectId = resolveSubjectId(opts);
      const page = Number.isSafeInteger(options.page) && options.page >= 0 ? options.page : 0;
      const size = Number.isSafeInteger(options.size) && options.size > 0 ? options.size : 20;
      const params = new URLSearchParams({ page: String(page), size: String(size) });
      const raw = await request(`/received-assets?${params}`, {
        ...opts,
        method: 'GET',
        expectedStatus: 200,
      });

      if (!raw || !Array.isArray(raw.content)) {
        throw new ApiError('INVALID_RESPONSE');
      }
      if (raw.page !== page || raw.size !== size || !Number.isSafeInteger(raw.totalElements)
        || raw.totalElements < 0 || raw.content.length !== Math.min(size, Math.max(0, raw.totalElements - page * size))) invalid();

      const items = raw.content.map(item => {
        validateItem(item);
        return {
          itemId: item.itemId,
          assetId: isUuid(item.assetId) ? item.assetId : undefined,
          vaultId: isUuid(item.vaultId) ? item.vaultId : undefined,
          title: item.name || (options.lang === 'en' ? 'Asset' : 'Tài sản'),
          sourceLabel: item.vaultName || (options.lang === 'en' ? 'Estate Vault' : 'Kho di sản'),
          deliveredAt: item.deliveredAt || null,
          status: item.status,
          assetType: item.assetType,
          description: item.description || '',
          allocationNote: item.allocationNote || '',
          imageCount: Number.isSafeInteger(item.imageCount) ? item.imageCount : 0,
          hasContent: Boolean(item.hasContent),
        };
      });

      const totalElements = Number.isSafeInteger(raw.totalElements) ? raw.totalElements : items.length;
      return {
        subjectId,
        page: Number.isSafeInteger(raw.page) ? raw.page : page,
        size: Number.isSafeInteger(raw.size) ? raw.size : size,
        total: totalElements,
        accountState: totalElements > 0 ? 'RECEIVED' : 'AWAITING_HANDOVER',
        items,
      };
    },

    async detail(itemId, options = {}) {
      if (!isUuid(itemId)) throw new ApiError('VALIDATION_FAILED', 400);
      const opts = { ...globalDefaults, ...options };
      const subjectId = resolveSubjectId(opts);
      const [itemRaw, imagesRaw] = await Promise.all([
        request(`/received-assets/${itemId}`, { ...opts, method: 'GET', expectedStatus: 200 }),
        request(`/received-assets/${itemId}/images`, { ...opts, method: 'GET', expectedStatus: 200 }),
      ]);

      validateItem(itemRaw);
      if (itemRaw.itemId !== itemId || !Array.isArray(imagesRaw)) invalid();
      const images = imagesRaw.map(img => {
        if (!img || !isUuid(img.id)) throw new ApiError('INVALID_RESPONSE');
        return {
          imageId: img.id,
          label: img.fileName || (options.lang === 'en' ? 'Attachment' : 'Ảnh đính kèm'),
        };
      });

      return {
        subjectId,
        itemId: itemRaw.itemId,
        assetId: isUuid(itemRaw.assetId) ? itemRaw.assetId : undefined,
        vaultId: isUuid(itemRaw.vaultId) ? itemRaw.vaultId : undefined,
        title: itemRaw.name || (options.lang === 'en' ? 'Asset' : 'Tài sản'),
        sourceLabel: itemRaw.vaultName || (options.lang === 'en' ? 'Estate Vault' : 'Kho di sản'),
        deliveredAt: itemRaw.deliveredAt || null,
        status: itemRaw.status,
        assetType: itemRaw.assetType,
        description: itemRaw.description || '',
        allocationNote: itemRaw.allocationNote || '',
        imageCount: Number.isSafeInteger(itemRaw.imageCount) ? itemRaw.imageCount : images.length,
        hasContent: Boolean(itemRaw.hasContent),
        images,
      };
    },

    async content(itemId, options = {}) {
      if (!isUuid(itemId)) throw new ApiError('VALIDATION_FAILED', 400);
      const opts = { ...globalDefaults, ...options };
      const subjectId = resolveSubjectId(opts);
      if (typeof opts.password !== 'string' || !opts.password.trim()) {
        const err = new ApiError('REAUTH_FAILED', 403);
        err.message = options.lang === 'en' ? 'Current password is required to reveal content.' : 'Cần nhập mật khẩu đăng nhập để xem nội dung.';
        throw err;
      }

      const res = await request(`/received-assets/${itemId}/content`, {
        ...opts,
        method: 'POST',
        body: { password: opts.password },
        expectedStatus: 200,
      });

      if (!res || res.itemId !== itemId || !isUuid(res.assetId) || typeof res.payload !== 'string') invalid();
      return {
        subjectId,
        itemId: res.itemId,
        assetId: res.assetId,
        text: typeof res.payload === 'string' ? res.payload : '',
      };
    },

    async image(itemId, imageId, options = {}) {
      if (!isUuid(itemId) || !isUuid(imageId)) throw new ApiError('VALIDATION_FAILED', 400);
      const opts = { ...globalDefaults, ...options };
      resolveSubjectId(opts);
      if (typeof opts.password !== 'string' || !opts.password.trim()) {
        const err = new ApiError('REAUTH_FAILED', 403);
        err.message = options.lang === 'en' ? 'Current password is required to download image.' : 'Cần nhập mật khẩu đăng nhập để tải ảnh.';
        throw err;
      }

      const fetchFn = opts.fetchFn || (typeof globalThis !== 'undefined' ? globalThis.fetch : null);
      if (typeof fetchFn !== 'function') throw new ApiError('NETWORK_ERROR');

      const headers = {
        'Content-Type': 'application/json',
      };
      if (opts.accessToken) headers.Authorization = `Bearer ${opts.accessToken}`;
      if (opts.lang) headers['Accept-Language'] = opts.lang;

      const res = await fetchFn(`${API_BASE}/received-assets/${itemId}/images/${imageId}/download`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ password: opts.password }),
        signal: opts.signal,
      });

      if (!res.ok) {
        let errBody;
        try { errBody = await res.json(); } catch { errBody = null; }
        const code = errBody?.code || (res.status === 403 ? 'ACCESS_DENIED' : res.status === 429 ? 'TOO_MANY_ATTEMPTS' : 'DOWNLOAD_FAILED');
        const err = new ApiError(code, res.status);
        err.message = errBody?.message || (res.status === 403 ? 'Password verification failed.' : 'Download failed');
        throw err;
      }

      if (res.status !== 200 || !/^image\/(jpeg|png)(;|$)/i.test(res.headers.get('content-type') || '')) invalid();
      return await res.blob();
    },
  };
}
