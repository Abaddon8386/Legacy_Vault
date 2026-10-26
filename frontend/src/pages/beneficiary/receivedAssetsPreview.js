// Synthetic FE-only fixtures, never a backend contract or proof of handover.
export const PREVIEW_SUBJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const first = '11111111-1111-4111-8111-111111111111';
const second = '22222222-2222-4222-8222-222222222222';
const imageId = '33333333-3333-4333-8333-333333333333';
const png = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6XcAAAAASUVORK5CYII=';

export function previewReceivedActions(scenario = 'unlinked', lang = 'vi') {
  const en = lang === 'en';
  const items = [
    {
      itemId: first,
      title: en ? 'Family keepsake' : 'Kỷ vật gia đình',
      sourceLabel: en ? 'Demo source A' : 'Kho minh họa A',
      deliveredAt: '2026-10-19T08:00:00Z',
      deliveryStatus: 'DELIVERED',
      sessionStatus: 'COMPLETED',
      vaultStatus: 'ARCHIVED',
      caseStatus: 'CLOSED',
    },
    {
      itemId: second,
      title: en ? 'Personal record' : 'Tài liệu cá nhân',
      sourceLabel: en ? 'Demo source B' : 'Kho minh họa B',
      deliveredAt: '2026-10-20T08:00:00Z',
      deliveryStatus: 'DELIVERED',
      sessionStatus: 'OPEN',
      vaultStatus: 'HANDOVER_IN_PROGRESS',
      caseStatus: 'OPEN',
    },
  ];
  const error = code => Object.assign(new Error(code), { code });
  const wait = async signal => {
    await new Promise(r => setTimeout(r, scenario === 'slow' ? 800 : 100));
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    if (scenario === 'error') throw error('NETWORK_ERROR');
  };
  return {
    async list({ page, size, signal }) {
      await wait(signal);
      const state = { unlinked: 'UNLINKED', waiting: 'AWAITING_HANDOVER', partial: 'PARTIAL' }[scenario] || 'RECEIVED';
      const all = ['unlinked', 'waiting'].includes(scenario) ? [] : scenario === 'partial' ? items.slice(0, 1) : items;
      return { subjectId: PREVIEW_SUBJECT, accountState: state, page, size, total: all.length, items: all.slice(page * size, (page + 1) * size) };
    },
    async detail(id, { signal }) {
      await wait(signal);
      const item = items.find(value => value.itemId === id);
      if (!item) throw error('RESOURCE_NOT_FOUND');
      return {
        ...item,
        subjectId: PREVIEW_SUBJECT,
        images: id === first ? [{ imageId, label: en ? 'Demo image' : 'Ảnh minh họa' }] : [],
      };
    },
    async content(id, { signal }) {
      await wait(signal);
      return {
        subjectId: PREVIEW_SUBJECT,
        itemId: id,
        text: en
          ? 'DEMO CONTENT — Not a real secret.'
          : 'NỘI DUNG MINH HỌA — Không phải bí mật thật.',
      };
    },
    async image(id, img, { signal }) {
      await wait(signal);
      if (id !== first || img !== imageId) throw error('RESOURCE_NOT_FOUND');
      return new Blob([Uint8Array.from(atob(png), char => char.charCodeAt(0))], { type: 'image/png' });
    },
  };
}
