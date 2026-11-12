import { useState } from 'react';
import CourtAllocationEditor from '../../components/staff/CourtAllocationEditor.jsx';
import { buildCourtAllocations, courtAllocationError } from '../../utils/courtAllocationModel.js';
import { canUseDistributionAction, documentMatchesWorkflow } from '../../workflows/distributionWorkflowService.js';

/**
 * Biểu mẫu Staff lập phân bổ tài sản dựa trên các giấy tờ căn cứ đã được Ban Pháp lý duyệt.
 * Chỉ cho sửa/gửi khi workflow cho phép hành động `submitAllocations` của vai trò STAFF
 * (pha `AWAITING_ALLOCATIONS`) và giấy tờ hiện tại khớp workflow (`documentMatchesWorkflow`).
 * Hiển thị phân bổ đã gửi (`workflow.data.allocation`), cho nạp lại để sửa (`onRestore`), và dùng
 * `CourtAllocationEditor` để nhập dòng phân bổ. Khi submit: kiểm tra bằng `buildCourtAllocations`
 * rồi `workflow.run('submitAllocations', {allocations})`, tương ứng
 * `POST /api/v1/staff/verification-cases/{caseId}/distribution-workflow/submit-allocations`.
 * Cho phép người nhận mới theo Tòa án khi `dossier.route === 'COURT'`. Được dùng trong `StaffLegalDocumentsPage.jsx`.
 *
 * @param {object} props
 * @param {object} props.workflow đối tượng điều khiển workflow phân phối (`data`, `pending`, `run`).
 * @param {object} props.dossier hồ sơ giấy tờ hiện tại.
 * @param {Array<object>} props.assets danh mục tài sản của hồ sơ.
 * @param {Array<object>} props.recipients danh mục người nhận của hồ sơ.
 * @param {Array<object>} props.rows các dòng phân bổ đang soạn.
 * @param {Function} props.onAdd thêm dòng.
 * @param {Function} props.onChange cập nhật dòng.
 * @param {Function} props.onRemove xóa dòng.
 * @param {Function} [props.onRestore] nạp lại phân bổ đã gửi vào bộ soạn.
 * @param {Function} [props.onSubmitted] gọi sau khi gửi Ban Pháp lý thành công.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @returns {JSX.Element}
 */
export default function StaffDistributionAllocations({ workflow, dossier, assets, recipients, rows, onAdd, onChange, onRemove, onRestore, onSubmitted, lang = 'vi' }) {
  const en = lang === 'en';
  const [error, setError] = useState(null);
  const ready = canUseDistributionAction(workflow.data, 'submitAllocations', 'STAFF') && documentMatchesWorkflow(workflow.data, dossier);
  const existing = workflow.data?.allocation;
  /** Kiểm tra các dòng phân bổ rồi gửi sang Ban Pháp lý; hiển thị lỗi kiểm tra (nếu có) trong state `error`. */
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
