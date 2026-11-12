import FeedbackNotice from '../components/common/FeedbackNotice.jsx';
import { workflowNotificationWarning } from '../utils/workflowNotificationFeedback.js';
import './DistributionWorkflow.css';
import { workflowFailure } from '../utils/workflowFeedback.js';

/**
 * Nhãn kết quả (vi, en) hiển thị sau khi từng action thành công.
 */
const outcomes = {
  requestDocuments: ['Đã gửi yêu cầu giấy tờ', 'Documents requested'],
  approveDocuments: ['Đã duyệt căn cứ', 'Documents approved'],
  requestDocumentSupplementation: ['Đã yêu cầu bổ sung giấy tờ', 'Supplement requested'],
  submitAllocations: ['Đã gửi phân bổ cho Legal', 'Allocation sent to Legal'],
  approveAllocations: ['Đã duyệt phân bổ', 'Allocation approved'],
  requestAllocationChanges: ['Đã yêu cầu Staff sửa phân bổ', 'Changes requested'],
};
// A request or assessment written as "Label: value" lines shows the label in bold so the key facts stand out.
/**
 * Biểu thức nhận dạng dòng dạng "Nhãn: giá trị" để in đậm nhãn.
 */
const labelledLine = /^(Giấy tờ cần nộp|Lý do|Documents requested|Reason):\s*(.*)$/;
/**
 * Hiển thị văn bản nhiều dòng; dòng có dạng "Nhãn: giá trị" thì nhãn được in đậm.
 * @param {{text:string}} props
 */
function LabelledText({ text }) {
  return String(text).split('\n').map((line, index) => {
    const match = labelledLine.exec(line);
    return <span className="lv-distribution-line" key={index}>{match ? <><strong>{match[1]}:</strong> {match[2]}</> : line}</span>;
  });
}
/**
 * Thông báo phản hồi sau thao tác của quy trình phân chia: thành công (kèm cảnh báo xác nhận thông báo cho bên kia), cảnh báo chờ phiên bản giấy tờ mới khi xung đột ở pha AWAITING_DOCUMENTS, hoặc lỗi lưu.
 * @param {{workflow:object, workspace:('STAFF'|'LEGAL'), lang?:string}} props {@code workflow} là kết quả của {@code useDistributionWorkflow}.
 */
export function DistributionFeedback({ workflow, workspace, lang = 'vi' }) {
  const en = lang === 'en', notice = workflow.receipt;
  const target = workspace === 'LEGAL' ? 'STAFF' : 'LEGAL';
  const confirmation = workflowNotificationWarning(notice, target, lang);
  const staleWhileWaiting = (workflow.failure?.status === 409 || workflow.failure?.code === 'CONFLICT')
    && workflow.data?.phase === 'AWAITING_DOCUMENTS';
  return <>
    {notice && <FeedbackNotice tone="success" title={outcomes[notice.action]?.[en ? 1 : 0] || (en ? 'Saved' : 'Đã lưu')}>
      {confirmation && <p>{confirmation.trim()}</p>}
      {workflow.loading && <p>{en ? 'Checking the next step…' : 'Đang kiểm tra bước tiếp theo…'}</p>}
    </FeedbackNotice>}
    {staleWhileWaiting ? <FeedbackNotice tone="warning" title={en ? 'Waiting for a new document version' : 'Hồ sơ đang chờ phiên bản giấy tờ mới'}>
      <p>{en ? 'The previous action was not saved. Staff must receive and submit the replacement before another assessment.' : 'Thao tác vừa rồi chưa được lưu. Nhân viên cần tiếp nhận và chuyển văn bản mới trước khi thẩm định tiếp.'}</p>
    </FeedbackNotice> : workflow.failure && <p role="alert">{workflow.failure.status === 409 || workflow.failure.code === 'CONFLICT'
      ? (en ? 'The case changed. Review the latest status before trying again.' : 'Hồ sơ đã thay đổi. Kiểm tra trạng thái mới nhất rồi thử lại.')
      : (en ? 'The action could not be saved. Your draft is kept.' : 'Chưa lưu được thao tác. Nội dung đang nhập vẫn được giữ lại.')}</p>}
  </>;
}
/**
 * Tổng quan quy trình phân chia hiển thị đầu trang xử lý hồ sơ: cảnh báo tiền đề chưa xong (Staff, kèm liên kết {@code /staff/cases?caseId=...}), chờ Legal yêu cầu giấy tờ, nút làm mới,
 * lỗi tải, yêu cầu giấy tờ ban đầu (chỉ khi pha AWAITING_DOCUMENTS và chưa có phản hồi) hoặc ý kiến xử lý gần nhất, và {@link DistributionFeedback}.
 * @param {{workflow:object, workspace:('STAFF'|'LEGAL'), lang?:string, showRefresh?:boolean}} props
 */
export default function DistributionWorkflowOverview({ workflow, workspace, lang = 'vi', showRefresh = true }) {
  const en = lang === 'en', value = workflow.data;
  const request = value?.phase === 'AWAITING_DOCUMENTS' ? value.request?.reason : null;
  const feedback = value?.phase !== 'CLOSED' ? value?.feedback : null;
  const failure = workflow.error ? workflowFailure(workflow.error, lang) : null;
  const prerequisites = value?.prerequisites;
  return <>
    {workspace === 'STAFF' && value?.phase === 'PREREQUISITES_PENDING' && prerequisites && <FeedbackNotice tone="warning" className="lv-distribution-stage-notice"
      title={en ? 'Not started yet: finish the death and will checks first' : 'Chưa đến bước này: cần xong xác minh tử vong và di chúc trước'}
      action={<a href={`/staff/cases?caseId=${encodeURIComponent(value.caseId)}`}>{en ? 'Go to the case checks' : 'Đến bước xác minh của hồ sơ'}</a>}>
      <ul className="lv-distribution-prerequisites">
        <li className={prerequisites.deathApproved ? 'is-met' : 'is-missing'}><strong>{en ? 'Death documents' : 'Giấy tờ tử vong'}</strong>{en ? (prerequisites.deathApproved ? ': accepted by Legal' : ': not accepted by Legal yet') : (prerequisites.deathApproved ? ': Ban Pháp lý đã chấp thuận' : ': Ban Pháp lý chưa chấp thuận')}</li>
        <li className={prerequisites.willMatched ? 'is-met' : 'is-missing'}><strong>{en ? 'Original will' : 'Di chúc gốc'}</strong>{en ? (prerequisites.willMatched ? ': comparison matches' : ': comparison not matched yet') : (prerequisites.willMatched ? ': đối chiếu đã khớp' : ': chưa đối chiếu khớp')}</li>
      </ul>
    </FeedbackNotice>}
    {workspace === 'STAFF' && value?.phase === 'DOCUMENT_REQUEST_NEEDED' && <FeedbackNotice tone="info" className="lv-distribution-stage-notice"
      title={en ? 'Waiting for Legal to request documents' : 'Chờ Ban Pháp lý gửi yêu cầu giấy tờ phân chia'}>
      <p>{en ? 'Death and will checks are done. You can receive documents once Legal sends the request.' : 'Đã xong xác minh tử vong và di chúc. Bạn tiếp nhận giấy tờ khi Ban Pháp lý gửi yêu cầu.'}</p>
    </FeedbackNotice>}
    {showRefresh && <div className="lv-distribution-refresh"><button type="button" onClick={workflow.refresh} disabled={workflow.loading || workflow.pending}>{workflow.loading ? (en ? 'Checking status…' : 'Đang kiểm tra trạng thái…') : (en ? 'Refresh case status' : 'Cập nhật trạng thái hồ sơ')}</button></div>}
    {failure && <section className="lv-distribution-context" role="alert"><h2>{workflow.error.code === 'BACKEND_NOT_READY' ? (en ? 'The workflow service is not available yet' : 'Dịch vụ xử lý chưa sẵn sàng') : failure.title}</h2><p>{failure.description}</p></section>}
    {(request || feedback) && <section className={`lv-distribution-context${request || feedback ? ' lv-distribution-context--request' : ''}`}>
      {feedback && <div><h2>{value?.phase === 'AWAITING_DOCUMENTS' && value.document?.status === 'CHANGES_REQUESTED'
        ? (en ? 'Reason for additional documents' : 'Lý do yêu cầu bổ sung giấy tờ')
        : (en ? 'Latest assessment' : 'Ý kiến xử lý gần nhất')}</h2><p><LabelledText text={feedback} /></p></div>}
      {request && !feedback && <div><h2>{en ? 'Original document request' : 'Yêu cầu giấy tờ ban đầu'}</h2><p><LabelledText text={request} /></p></div>}
    </section>}
    <DistributionFeedback workflow={workflow} workspace={workspace} lang={lang} />
  </>;
}
