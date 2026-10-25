import { useState } from 'react';
import CaseLinkWorkspace from '../src/pages/beneficiary/CaseLinkWorkspace.jsx';
import StaffCaseLinkPanel from '../src/pages/staff/StaffCaseLinkPanel.jsx';
import DmsGraceSettings from '../src/components/dms/DmsGraceSettings.jsx';
import { AssetFormModal } from '../src/components/assets/AssetFormModal.jsx';
import '../src/components/common/Modal.css';
import { readDms } from '../src/utils/dmsService.js';
import '../src/index.css';
import './thai-workflow.css';
import '../src/components/layout/OwnerSurfaces.css';
import { trackOwnerSurface } from '../src/components/layout/ownerSurfaceMotion.js';

// Dedicated, memory-only review entry. Not imported by App or the production entry.
if (!import.meta.env.DEV) throw new Error('Development review only');
const caseNumber = 'HS-2026-000123';
let requests = [];
let linked = false;
let serial = 0;
const account = { accountId: 'demo-c', accountName: 'Nguyễn Minh C', accountEmail: 'c@example.test' };
const sharedActions = {
  listOwn: async () => requests,
  submit: async ({ caseNumber: code }) => {
    if (code !== caseNumber) throw new Error('Unknown case');
    const current = requests.find(r => r.status === 'PENDING');
    if (current) return current;
    const result = { ...account, id: `request-${++serial}`, caseNumber, status: 'PENDING' };
    requests = [result, ...requests]; return result;
  },
  cancel: async ({ requestId }) => { const result = { ...requests.find(r => r.id === requestId), status: 'CANCELLED' }; requests = requests.map(r => r.id === requestId ? result : r); return result; },
};
const counterActions = {
  listRecipients: async () => [{ beneficiaryId: 'court-c', fullName: 'Nguyễn Minh C', accountLinked: linked, sourceLabel: 'Người nhận theo văn bản Tòa án', legalReference: 'Bản án 25/2026 · phiên bản 1' }],
  listPending: async () => requests.filter(r => r.status === 'PENDING'),
  createAccount: async () => ({ accountId: 'demo-new', linked: false }),
  approve: async ({ requestId }) => { linked = true; const result = { ...requests.find(r => r.id === requestId), status: 'APPROVED' }; requests = requests.map(r => r.id === requestId ? result : r); return result; },
  reject: async ({ requestId }) => { const result = { ...requests.find(r => r.id === requestId), status: 'REJECTED' }; requests = requests.map(r => r.id === requestId ? result : r); return result; },
};
let config = { ownerId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', status: 'MONITORING', checkIntervalDays: 30, checkIntervalMinutes: 43200, gracePeriodDays: 1, nextCheckAt: '2026-11-24T08:00:00Z' };
const graceActions = { durationUnit: 'minutes', policy: { minMinutes: 0, maxMinutes: 43200 }, save: async data => { config = { ...config, ...data, gracePeriodDays: Math.floor(data.gracePeriodMinutes / 1440) }; return config; } };
export default function Review() {
  const [tab, setTab] = useState('shared');
  const [lang, setLang] = useState('vi');
  const [data, setData] = useState(() => readDms(config));
  const [delivered, setDelivered] = useState(false);
  const [assetOpen, setAssetOpen] = useState(false);
  return <main className="lv-owner-surfaces lv-staff-surfaces" onPointerMove={trackOwnerSurface}>
    <header><strong>LegacyVault</strong><span>Kiểm tra giao diện phần Thái</span><button onClick={() => setLang(v => v === 'vi' ? 'en' : 'vi')}>{lang === 'vi' ? 'English' : 'Tiếng Việt'}</button></header>
    <aside>CHỈ XEM TRƯỚC · Dữ liệu nằm trong bộ nhớ, không gọi máy chủ. Mã mẫu: <strong>{caseNumber}</strong>. Khoảng Grace 0–30 chỉ là dữ liệu kiểm tra, chưa phải quy tắc đã chốt.</aside>
    <nav aria-label="Màn kiểm tra">{[['shared', 'Người nhận'], ['counter', 'Staff tại quầy'], ['grace', 'Owner · Grace']].map(([id, label]) => <button key={id} aria-pressed={id === tab} onClick={() => setTab(id)}>{label}</button>)}</nav>
    {tab === 'shared' && <><CaseLinkWorkspace key={String(delivered)} user={{ id: 'demo-c', roles: ['VAULT_OWNER'] }} lang={lang} isDevPreview previewScenario={delivered ? 'partial' : linked ? 'waiting' : 'unlinked'} caseLinkActions={sharedActions} />
      <button disabled={!linked} onClick={() => setDelivered(true)}>Mô phỏng bàn giao một phần (chỉ sau liên kết)</button></>}
    {tab === 'counter' && <StaffCaseLinkPanel caseId="demo-case" caseItem={{ status: 'OPEN', caseNumber }} lang={lang} actions={counterActions} />}
    {tab === 'grace' && <><label className="review-status">Trạng thái mẫu<select value={data.status} onChange={e => setData(d => ({ ...d, status: e.target.value }))}><option>MONITORING</option><option>TRIGGERED</option><option>GRACE_PERIOD_EXCEEDED</option></select></label><DmsGraceSettings lang={lang} data={data} ownerId={config.ownerId} actions={graceActions} onSaved={setData} /><button onClick={() => setAssetOpen(true)}>Kiểm tra form thêm tài sản</button></>}
    <div className="lv-asset-page"><AssetFormModal isOpen={assetOpen} lang={lang} onClose={() => setAssetOpen(false)} onSubmit={async () => setAssetOpen(false)} /></div>
  </main>;
}
