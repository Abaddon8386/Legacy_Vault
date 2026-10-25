import { Plus, Trash2 } from 'lucide-react';
import './CourtAllocationEditor.css';

export default function CourtAllocationEditor({ rows, assets, recipients, onAdd, onChange, onRemove, disabled, lang = 'vi', hideHeading = false }) {
  const en = lang === 'en';
  const fields = [
    ['fullName', en ? 'Full name in the document' : 'Họ tên theo văn bản', 'text', 150],
    ['relationship', en ? 'Relationship (optional)' : 'Mối quan hệ (tùy chọn)', 'text', 100],
    ['dateOfBirth', en ? 'Date of birth (optional)' : 'Ngày sinh (tùy chọn)', 'date'],
    ['phone', en ? 'Contact phone (optional)' : 'Số điện thoại (tùy chọn)', 'tel', 20],
    ['email', en ? 'Contact email (optional)' : 'Email liên hệ (tùy chọn)', 'email', 254],
  ];
  return <section className="lv-court-editor" aria-label={en ? 'Court allocations' : 'Phân bổ theo văn bản Tòa án'}>
    {!hideHeading && <div className="lv-court-editor__heading"><h3>{en ? 'Asset allocations' : 'Phân bổ tài sản'}</h3><button type="button" onClick={onAdd} disabled={disabled}><Plus size={16} aria-hidden="true" />{en ? 'Add allocation' : 'Thêm phân bổ'}</button></div>}
    {!rows.length && <p>{en ? 'Add the assets and recipients named in the court document.' : 'Thêm tài sản và người nhận đúng theo văn bản Tòa án.'}</p>}
    {rows.map((row, index) => <fieldset key={row.id} className="lv-court-editor__row" disabled={disabled}>
      <legend>{en ? `Allocation ${index + 1}` : `Phân bổ ${index + 1}`}</legend>
      <div className="lv-court-editor__fields">
        <label>{en ? 'Asset' : 'Tài sản'}<select value={row.assetId} onChange={event => onChange(index, 'assetId', event.target.value)} required><option value="">{en ? 'Select asset' : 'Chọn tài sản'}</option>{assets.map(asset => <option key={asset.assetId} value={asset.assetId}>{asset.name}</option>)}</select></label>
        <label>{en ? 'Recipient' : 'Người nhận'}<select value={row.recipientKind || 'existing'} onChange={event => onChange(index, 'recipientKind', event.target.value)}><option value="existing">{en ? 'Existing case recipient' : 'Người nhận đã có trong hồ sơ'}</option><option value="court">{en ? 'New recipient named by the court' : 'Người mới theo văn bản Tòa án'}</option></select></label>
        {row.recipientKind !== 'court' ? <label>{en ? 'Select recipient' : 'Chọn người nhận'}<select value={row.beneficiaryId} onChange={event => onChange(index, 'beneficiaryId', event.target.value)} required><option value="">{en ? 'Select recipient' : 'Chọn người nhận'}</option>{recipients.map(recipient => <option key={recipient.beneficiaryId} value={recipient.beneficiaryId}>{recipient.fullName}</option>)}</select></label>
          : fields.map(([key, label, type, maxLength]) => <label key={key}>{label}{key === 'fullName' ? ' *' : ''}<input type={type} maxLength={maxLength} value={row.courtRecipient?.[key] || ''} required={key === 'fullName'} onChange={event => onChange(index, 'courtRecipient', { ...row.courtRecipient, [key]: event.target.value })} /></label>)}
        <label className="lv-court-editor__description">{en ? 'Allocation stated in the document' : 'Phần được hưởng theo văn bản'}<textarea maxLength={2000} value={row.description} onChange={event => onChange(index, 'description', event.target.value)} /></label>
      </div>
      {row.recipientKind === 'court' && <p className="lv-court-editor__notice">{en ? 'The recipient is recorded with this document version. No account is created or linked here.' : 'Người nhận được ghi theo phiên bản văn bản này. Thao tác này chưa tạo hoặc liên kết tài khoản.'}</p>}
      <button type="button" onClick={() => onRemove(index)} aria-label={en ? `Remove allocation ${index + 1}` : `Xóa phân bổ ${index + 1}`}><Trash2 size={16} aria-hidden="true" />{en ? 'Remove' : 'Xóa'}</button>
    </fieldset>)}
  </section>;
}
