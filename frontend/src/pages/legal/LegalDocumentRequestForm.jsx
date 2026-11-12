import { useId } from 'react';
import { FileText, Send, SquarePen } from 'lucide-react';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import './LegalDocumentRequestForm.css';

/** Các loại giấy tờ Legal có thể yêu cầu Staff bổ sung: DISTRIBUTION (giấy tờ phân chia tài sản hợp lệ) và OTHER (giấy tờ khác, phải ghi rõ tên). Giá trị là [nhãn vi, nhãn en]. */
const documentNames = {
  DISTRIBUTION: ['Giấy tờ phân chia tài sản hợp lệ', 'Valid asset distribution documents'],
  OTHER: ['Giấy tờ khác (ghi rõ)', 'Other documents (specify)'],
};

/**
 * Biểu mẫu "Yêu cầu giấy tờ phân chia" của Legal. API hiện chỉ nhận một trường lý do nên component ghép tên giấy tờ và lý do thành một chuỗi
 * (tối đa 1000 ký tự) rồi truyền cho onSubmit; việc gọi API thật do LegalLiveWorkflow thực hiện (xem legalLiveService, yêu cầu giấy tờ cho hồ sơ xác minh).
 * Nút gửi bị khóa khi pending, không allowed, hoặc form chưa đủ (chưa chọn loại giấy tờ, thiếu tên với loại OTHER, thiếu lý do, vượt 1000 ký tự); lý do chặn hiển thị qua WorkflowActionHint.
 *
 * @param {object} props
 * @param {{documentKind?: string, documentName?: string, reason?: string}} props.draft Bản nháp form do cha giữ.
 * @param {(draft: object) => void} props.onDraftChange Cập nhật bản nháp.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 * @param {boolean} props.pending Đang gửi yêu cầu.
 * @param {boolean} props.allowed Hồ sơ đủ điều kiện yêu cầu giấy tờ.
 * @param {(text: string) => void} props.onSubmit Gọi với nội dung yêu cầu đã ghép.
 * @returns {JSX.Element} Form hai khối: giấy tờ cần nộp và lý do.
 */
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
      <label htmlFor={`${id}-kind`}><span>{en ? 'Document requirement' : 'Giấy tờ yêu cầu'}<span className="lv-required-mark" aria-hidden="true">*</span></span>
        <select id={`${id}-kind`} required value={documentKind} disabled={locked}
          onChange={event => update({ documentKind: event.target.value })}>
          <option value="">{en ? 'Select documents' : 'Chọn giấy tờ'}</option>
          {Object.entries(documentNames).map(([value, labels]) => <option key={value} value={value}>{labels[en ? 1 : 0]}</option>)}
        </select>
      </label>
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
