import { useId } from 'react';
import { FileText, Send, SquarePen } from 'lucide-react';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import './LegalDocumentRequestForm.css';

const documentNames = {
  DISTRIBUTION: ['Giấy tờ phân chia tài sản hợp lệ', 'Valid asset distribution documents'],
  OTHER: ['Giấy tờ khác (ghi rõ)', 'Other documents (specify)'],
};

export default function LegalDocumentRequestForm({ draft, onDraftChange, lang = 'vi', pending, allowed, onSubmit }) {
  const en = lang === 'en', id = useId();
  const { documentKind = '', documentName = '', reason = '' } = draft;
  const selected = documentNames[documentKind];
  const name = documentKind === 'OTHER' ? documentName.trim() : selected?.[en ? 1 : 0] || '';
  // The existing API accepts one reason field. Include both inputs for Staff without changing its contract.
  const prefix = `${en ? 'Documents requested' : 'Giấy tờ cần nộp'}: ${name}\n${en ? 'Reason' : 'Lý do'}: `;
  const remaining = Math.max(0, 1000 - prefix.length);
  const text = prefix + reason.trim();
  const locked = pending || !allowed;
  const complete = Boolean(selected && name && reason.trim() && text.length <= 1000);
  const blocker = !allowed ? (en ? 'This case is not ready for a document request.' : 'Hồ sơ chưa đủ điều kiện yêu cầu giấy tờ.')
    : !selected ? (en ? 'Select the documents to request.' : 'Chọn giấy tờ cần nộp.')
      : !name ? (en ? 'Enter the document name.' : 'Nhập tên giấy tờ cần nộp.')
        : !reason.trim() ? (en ? 'Enter a reason for this request.' : 'Nhập lý do yêu cầu giấy tờ.')
          : text.length > 1000 ? (en ? 'Shorten the reason before sending.' : 'Rút gọn lý do trước khi gửi.') : '';
  const update = values => onDraftChange({ ...draft, ...values });
  return <form className="lv-legal-workspace lv-legal-document-request" aria-label={en ? 'Request distribution documents' : 'Yêu cầu giấy tờ phân chia'}
    aria-busy={pending} onSubmit={event => { event.preventDefault(); if (!locked && complete) onSubmit(text); }}>
    <section className="lv-legal-live__card lv-legal-documents lv-surface-card">
      <header className="lv-legal-card-heading"><h2><FileText size={20} aria-hidden="true" />{en ? 'Documents to request' : 'Giấy tờ cần nộp'}</h2></header>
      <p>{en ? 'Death verification and will comparison are complete. Select the documents Staff should ask the applicant to prepare.'
        : 'Đã duyệt khai tử và đối chiếu di chúc. Chọn giấy tờ để Staff hướng dẫn người nộp chuẩn bị.'}</p>
      <div className="lv-legal-request-why"><strong>{en ? 'Why are these documents needed?' : 'Vì sao cần giấy tờ này?'}</strong>
        <p>{en ? 'Death verification and will comparison confirm the death and the will, but not how the assets are divided. Valid distribution documents are the basis for Staff to prepare allocations and for Legal to check them. If this case needs something else, select “Other documents” and name it.'
          : 'Khai tử và đối chiếu di chúc mới xác nhận việc qua đời và di chúc, chưa cho biết tài sản được chia thế nào. Giấy tờ phân chia hợp lệ là căn cứ để Staff lập phân bổ và Ban Pháp lý kiểm tra. Nếu hồ sơ cần giấy tờ khác, chọn “Giấy tờ khác” và ghi rõ tên.'}</p></div>
      <label htmlFor={`${id}-kind`}><span>{en ? 'Document requirement' : 'Giấy tờ yêu cầu'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
        <select id={`${id}-kind`} required value={documentKind} disabled={locked} aria-describedby={`${id}-help`}
          onChange={event => update({ documentKind: event.target.value })}>
          <option value="">{en ? 'Select documents' : 'Chọn giấy tờ'}</option>
          {Object.entries(documentNames).map(([value, labels]) => <option key={value} value={value}>{labels[en ? 1 : 0]}</option>)}
        </select>
      </label>
      <p id={`${id}-help`} className="lv-legal-request-help">{en ? 'The applicant chooses where to obtain the documents. Valid notarial or court documents can be submitted.'
        : 'Người nộp tự chọn nơi làm giấy tờ. Có thể nộp hồ sơ công chứng hoặc giấy tờ Tòa án hợp lệ.'}</p>
      {documentKind === 'OTHER' && <label htmlFor={`${id}-name`}><span>{en ? 'Document name' : 'Tên giấy tờ'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
        <input id={`${id}-name`} type="text" required maxLength={200} value={documentName} disabled={locked}
          onChange={event => update({ documentName: event.target.value })} />
      </label>}
    </section>
    <section className="lv-legal-live__card lv-legal-action-panel lv-surface-card">
      <header className="lv-legal-card-heading"><h2><SquarePen size={20} aria-hidden="true" />{en ? 'Request reason' : 'Lý do yêu cầu'}</h2></header>
      <label htmlFor={`${id}-reason`}><span>{en ? 'Reason' : 'Lý do'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
        <textarea id={`${id}-reason`} required value={reason} maxLength={remaining} disabled={locked}
          aria-describedby={`${id}-count`} aria-invalid={text.length > 1000 || undefined}
          placeholder={en ? 'Explain what needs to be clarified before preparing allocations.' : 'Nêu nội dung cần làm rõ trước khi lập phân bổ tài sản.'}
          onChange={event => update({ reason: event.target.value })} />
      </label>
      <p id={`${id}-count`} className="lv-legal-request-help">{reason.length}/{remaining} {en ? 'characters' : 'ký tự'}</p>
      <button type="submit" className="lv-decision--positive" disabled={locked || !complete} aria-describedby={blocker ? `${id}-blocked` : undefined}>
        <Send size={18} aria-hidden="true" />{pending ? (en ? 'Sending request…' : 'Đang gửi yêu cầu…') : (en ? 'Request distribution documents' : 'Yêu cầu giấy tờ phân chia')}
      </button>
      <WorkflowActionHint id={`${id}-blocked`} reason={blocker} />
    </section>
  </form>;
}
