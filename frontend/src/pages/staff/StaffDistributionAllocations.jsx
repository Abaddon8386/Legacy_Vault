import { useState } from 'react';
import CourtAllocationEditor from '../../components/staff/CourtAllocationEditor.jsx';
import { buildCourtAllocations, courtAllocationError } from '../../utils/courtAllocationModel.js';
import { canUseDistributionAction, documentMatchesWorkflow } from '../../workflows/distributionWorkflowService.js';

export default function StaffDistributionAllocations({ workflow, dossier, assets, recipients, rows, onAdd, onChange, onRemove, onRestore, onSubmitted, lang = 'vi' }) {
  const en = lang === 'en';
  const [error, setError] = useState(null);
  const ready = canUseDistributionAction(workflow.data, 'submitAllocations', 'STAFF') && documentMatchesWorkflow(workflow.data, dossier);
  const existing = workflow.data?.allocation;
  async function submit(event) {
    event.preventDefault(); if (!ready || workflow.pending) return;
    const checked = buildCourtAllocations(rows, { assets, recipients, requireCatalog: true });
    if (checked.errors.length) { setError(courtAllocationError(checked.errors[0], lang)); return; }
    setError(null);
    const receipt = await workflow.run('submitAllocations', { allocations: checked.allocations });
    if (receipt) onSubmitted?.();
  }
  return <section className="lv-distribution-workflow lv-surface-card lv-staff-glow" aria-label={en ? 'Prepare asset allocations' : 'Lập phân bổ tài sản'}>
    <h2>{en ? 'Prepare allocations from accepted documents' : 'Lập phân bổ theo căn cứ đã duyệt'}</h2>
    {workflow.data?.phase === 'REJECTED' && <p role="status">{en ? 'Legal rejected this case, so allocations cannot be edited now. Staff can prepare the corrections; the allocation form reopens only after Legal asks for additional documents.' : 'Ban Pháp lý đã từ chối hồ sơ nên chưa thể sửa phân bổ. Staff chuẩn bị nội dung cần sửa; form phân bổ chỉ mở lại khi Ban Pháp lý yêu cầu bổ sung giấy tờ.'}</p>}
    {!ready && !existing && <p role="status">{en ? 'Allocations can be prepared after Legal accepts the current documents and returns the case to Staff.' : 'Chỉ lập hoặc sửa phân bổ khi Ban Pháp lý đã duyệt giấy tờ và chuyển hồ sơ về Staff.'}</p>}
    {existing && <><h3>{en ? 'Submitted allocations' : 'Phân bổ đã gửi'}</h3><ul className="lv-distribution-review-list">{existing.items.map((item, index) => <li key={`${item.assetId}:${item.beneficiaryId}:${index}`}>
      <div><small>{en ? 'Asset' : 'Tài sản'}</small><strong>{item.assetName}</strong></div>
      <div><small>{en ? 'Recipient' : 'Người nhận'}</small><span>{item.recipientName}</span></div>
      {item.description && <div><small>{en ? 'Allocation' : 'Phần được hưởng'}</small><span>{item.description}</span></div>}
    </li>)}</ul></>}
    {ready && existing?.items.length > 0 && !rows.length && <div className="lv-distribution-actions"><button type="button" onClick={() => onRestore?.(existing.items.map((item, index) => ({
      id: 'restored-' + index, assetId: item.assetId, beneficiaryId: item.beneficiaryId, description: item.description, recipientKind: 'existing',
    })))}>{en ? 'Edit the submitted allocations' : 'Sửa lại phân bổ đã gửi'}</button></div>}
    {ready && <form className="lv-distribution-form" onSubmit={submit}>
      <CourtAllocationEditor rows={rows} assets={assets} recipients={recipients} lang={lang} allowNewCourtRecipient={dossier?.route === 'COURT'}
        disabled={workflow.pending} onAdd={onAdd} onChange={onChange} onRemove={onRemove} />
      {error && <p role="alert">{error}</p>}
      {(!assets.length || !recipients.length) && <p role="status">{en ? 'The asset and recipient catalogues are required. Reload the case if they are not available.' : 'Cần danh sách tài sản và người nhận của hồ sơ. Tải lại hồ sơ nếu danh sách chưa có.'}</p>}
      <div className="lv-distribution-actions"><button type="submit" disabled={workflow.pending || !rows.length || !assets.length}>
        {workflow.pending ? (en ? 'Sending…' : 'Đang gửi…') : (en ? 'Send to Legal' : 'Gửi Ban Pháp lý')}</button></div>
    </form>}
  </section>;
}
