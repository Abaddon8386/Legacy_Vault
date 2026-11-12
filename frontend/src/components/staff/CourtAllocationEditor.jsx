import { Plus, Trash2 } from 'lucide-react';
import { DatePicker } from '../common/DatePicker.jsx';
import './CourtAllocationEditor.css';

/**
 * Bộ soạn các dòng phân bổ tài sản theo văn bản (ví dụ quyết định của Tòa án).
 * Mỗi dòng gồm: tài sản, người nhận (người đã có trong hồ sơ hoặc người mới do Tòa án nêu tên)
 * và mô tả phần được hưởng. Component hoàn toàn "controlled": không tự giữ state,
 * mọi thay đổi được báo lên cha qua các callback. Được dùng trong `StaffDistributionAllocations.jsx` (pages/staff).
 *
 * Với người nhận mới theo Tòa án (`recipientKind === 'court'`) chỉ ghi thông tin theo phiên bản văn bản,
 * không tạo hoặc liên kết tài khoản. Không gọi API trực tiếp.
 *
 * @param {object} props
 * @param {Array<object>} props.rows danh sách dòng phân bổ (`id`, `assetId`, `beneficiaryId`, `recipientKind`, `courtRecipient`, `description`).
 * @param {Array<object>} props.assets tài sản có thể chọn (`assetId`, `name`).
 * @param {Array<object>} props.recipients người nhận đã có trong hồ sơ (`beneficiaryId`, `fullName`).
 * @param {Function} props.onAdd thêm một dòng phân bổ rỗng.
 * @param {Function} props.onChange `(index, field, value)` cập nhật một trường của dòng.
 * @param {Function} props.onRemove `(index)` xóa dòng.
 * @param {boolean} [props.disabled] khóa toàn bộ biểu mẫu (đang gửi).
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ giao diện.
 * @param {boolean} [props.allowNewCourtRecipient=true] cho phép chọn "người mới theo văn bản Tòa án".
 * @returns {JSX.Element} khối biểu mẫu phân bổ.
 */
export default function CourtAllocationEditor({ rows, assets, recipients, onAdd, onChange, onRemove, disabled, lang = 'vi', allowNewCourtRecipient = true }) {
  const en = lang === 'en';
  const fields = [
    ['fullName', en ? 'Full name in the document' : 'Họ tên theo văn bản', 'text', 150],
    ['relationship', en ? 'Relationship (optional)' : 'Mối quan hệ (tùy chọn)', 'text', 100],
    ['dateOfBirth', en ? 'Date of birth (optional)' : 'Ngày sinh (tùy chọn)', 'date'],
    ['phone', en ? 'Contact phone (optional)' : 'Số điện thoại (tùy chọn)', 'tel', 20],
    ['email', en ? 'Contact email (optional)' : 'Email liên hệ (tùy chọn)', 'email', 254],
  ];
  return <section className="lv-court-editor" aria-label={en ? 'Document allocations' : 'Phân chia theo văn bản'}>
    <div className="lv-court-editor__heading"><h3>{en ? 'Asset allocations' : 'Phân bổ tài sản'}</h3><button type="button" onClick={() => onAdd()} disabled={disabled}><Plus size={16} aria-hidden="true" />{en ? 'Add allocation' : 'Thêm phân bổ'}</button></div>
    {rows.map((row, index) => <fieldset key={row.id} className="lv-court-editor__row" disabled={disabled}>
      <legend>{en ? `Allocation ${index + 1}` : `Phân bổ ${index + 1}`}</legend>
      <div className="lv-court-editor__fields">
        <label><span>{en ? 'Asset' : 'Tài sản'}<span className="lv-required-mark" aria-hidden="true">*</span></span><select value={row.assetId} onChange={event => onChange(index, 'assetId', event.target.value)} required><option value="">{en ? 'Select asset' : 'Chọn tài sản'}</option>{assets.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}</select></label>
        {allowNewCourtRecipient && <label>{en ? 'Recipient' : 'Người nhận'}<select value={row.recipientKind || 'existing'} onChange={event => onChange(index, 'recipientKind', event.target.value)}><option value="existing">{en ? 'Existing case recipient' : 'Người nhận đã có trong hồ sơ'}</option><option value="court">{en ? 'New recipient named by the court' : 'Người mới theo văn bản Tòa án'}</option></select></label>}
        {row.recipientKind !== 'court' ? <label><span>{en ? 'Select recipient' : 'Chọn người nhận'}<span className="lv-required-mark" aria-hidden="true">*</span></span><select value={row.beneficiaryId} onChange={event => onChange(index, 'beneficiaryId', event.target.value)} required><option value="">{en ? 'Select recipient' : 'Chọn người nhận'}</option>{recipients.map(recipient => <option key={recipient.beneficiaryId} value={recipient.beneficiaryId}>{recipient.fullName}</option>)}</select></label>
          : fields.map(([key, label, type, maxLength]) => <label key={key}><span>{label}{key === 'fullName' && <span className="lv-required-mark" aria-hidden="true">*</span>}</span>{type === 'date'
            ? <DatePicker value={row.courtRecipient?.[key] || ''} max={new Date().toISOString().slice(0, 10)} lang={lang} onChange={value => onChange(index, 'courtRecipient', { ...row.courtRecipient, [key]: value })} />
            : <input type={type} maxLength={maxLength} value={row.courtRecipient?.[key] || ''} required={key === 'fullName'} onChange={event => onChange(index, 'courtRecipient', { ...row.courtRecipient, [key]: event.target.value })} />}</label>)}
        <label className="lv-court-editor__description">{en ? 'Allocation stated in the document' : 'Phần được hưởng theo văn bản'}<textarea maxLength={2000} value={row.description} onChange={event => onChange(index, 'description', event.target.value)} /></label>
      </div>
      {row.recipientKind === 'court' && <p className="lv-court-editor__notice">{en ? 'The recipient is recorded with this document version. No account is created or linked here.' : 'Người nhận được ghi theo phiên bản văn bản này. Thao tác này chưa tạo hoặc liên kết tài khoản.'}</p>}
      <div className="lv-court-editor__row-actions">      <button type="button" onClick={() => onRemove(index)} aria-label={en ? `Remove allocation ${index + 1}` : `Xóa phân bổ ${index + 1}`}><Trash2 size={16} aria-hidden="true" />{en ? 'Remove' : 'Xóa'}</button></div>
    </fieldset>)}
  </section>;
}
