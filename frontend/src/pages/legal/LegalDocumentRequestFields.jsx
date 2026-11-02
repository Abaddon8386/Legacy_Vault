import { useId, useState } from 'react';

// Editable drafting aids only: these do not select a legal route or change the API.
export default function LegalDocumentRequestFields({ lang = 'vi', reason, onChange, disabled }) {
  const en = lang === 'en', id = useId();
  const [template, setTemplate] = useState('');
  const drafts = en ? [
    ['distribution', 'Distribution documents', 'Please provide valid inheritance distribution documents so Staff can receive them and submit them for legal assessment.'],
    ['entitlements', 'Recipients and entitlements', 'Please provide distribution documents identifying the recipients, assets and each recipient’s entitlement so Staff can prepare the allocations.'],
  ] : [
    ['distribution', 'Giấy tờ phân chia di sản', 'Đề nghị cung cấp giấy tờ phân chia di sản hợp lệ để Staff tiếp nhận và chuyển Legal thẩm định căn cứ.'],
    ['entitlements', 'Người nhận và phần được hưởng', 'Đề nghị cung cấp giấy tờ phân chia xác định người nhận, tài sản và phần được hưởng của từng người để Staff có căn cứ lập phân bổ.'],
  ];
  return <div className="lv-document-request-fields">
    <label htmlFor={`${id}-template`}>{en ? 'Request draft' : 'Mẫu nội dung yêu cầu'}
      <select id={`${id}-template`} value={template} disabled={disabled} onChange={event => setTemplate(event.target.value)}>
        <option value="">{en ? 'Choose a draft or write your own' : 'Chọn mẫu hoặc tự nhập nội dung'}</option>
        {drafts.map(([key, title]) => <option key={key} value={key}>{title}</option>)}
      </select>
    </label>
    <button type="button" className="lv-document-request-apply" disabled={disabled || !template}
      onClick={() => { const draft = drafts.find(([key]) => key === template); if (draft) onChange(draft[2]); }}>
      {reason.trim() ? (en ? 'Replace content with draft' : 'Thay nội dung bằng mẫu') : (en ? 'Use this draft' : 'Dùng mẫu này')}
    </button>
    <label htmlFor={`${id}-reason`}>{en ? 'Request sent to Staff' : 'Nội dung yêu cầu gửi Staff'}
      <textarea id={`${id}-reason`} required maxLength={1000} rows={4} value={reason} disabled={disabled}
        placeholder={en ? 'Use a draft or enter the documents needed and your reason…' : 'Dùng mẫu hoặc nhập giấy tờ cần nộp và lý do…'}
        onChange={event => onChange(event.target.value)} aria-describedby={`${id}-count`} />
    </label>
    <span id={`${id}-count`} className="lv-document-request-count">{reason.length}/1000 {en ? 'characters' : 'ký tự'}</span>
  </div>;
}
