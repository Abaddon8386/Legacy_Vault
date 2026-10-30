import FeedbackNotice from '../components/common/FeedbackNotice.jsx';
import { workflowNotificationFeedback } from '../utils/workflowNotificationFeedback.js';
import './DistributionWorkflow.css';
import { workflowFailure } from '../utils/workflowFeedback.js';

const outcomes = {
  requestDocuments: ['Đã gửi yêu cầu giấy tờ phân chia.', 'Distribution documents requested.'],
  approveDocuments: ['Đã duyệt căn cứ. Staff có thể lập phân bổ.', 'Documents approved. Staff can prepare allocations.'],
  requestDocumentSupplementation: ['Đã yêu cầu bổ sung giấy tờ.', 'Additional documents requested.'],
  submitAllocations: ['Đã gửi phân bổ cho Legal kiểm tra.', 'Allocations submitted for Legal review.'],
  approveAllocations: ['Đã kiểm tra và chấp thuận phân bổ.', 'Allocations checked and accepted.'],
  requestAllocationChanges: ['Đã yêu cầu Staff sửa phân bổ.', 'Allocation corrections requested.'],
};
export function DistributionFeedback({ workflow, workspace, lang = 'vi' }) {
  const en = lang === 'en', notice = workflow.receipt;
  const target = workspace === 'LEGAL' ? 'STAFF' : 'LEGAL';
  const confirmation = workflowNotificationFeedback(notice, target, lang);
  return <>
    {notice && <FeedbackNotice tone="success" title={outcomes[notice.action]?.[en ? 1 : 0] || (en ? 'Saved successfully.' : 'Đã lưu thành công.')}>
      {confirmation && <p>{confirmation.trim()}</p>}
      {workflow.loading && <p>{en ? 'Checking the next step…' : 'Đang kiểm tra bước tiếp theo…'}</p>}
    </FeedbackNotice>}
    {workflow.failure && <p role="alert">{workflow.failure.status === 409 || workflow.failure.code === 'CONFLICT'
      ? (en ? 'The case changed. Review the latest status before trying again.' : 'Hồ sơ đã thay đổi. Kiểm tra trạng thái mới nhất rồi thử lại.')
      : (en ? 'The action could not be saved. Your draft is kept.' : 'Chưa lưu được thao tác. Nội dung đang nhập vẫn được giữ lại.')}</p>}
  </>;
}
export default function DistributionWorkflowOverview({ workflow, workspace, lang = 'vi' }) {
  const en = lang === 'en', value = workflow.data;
  const request = value?.phase === 'AWAITING_DOCUMENTS' ? value.request?.reason : null;
  const feedback = value?.phase !== 'CLOSED' ? value?.feedback : null;
  const failure = workflow.error ? workflowFailure(workflow.error, lang) : null;
  return <>
    {failure && <section className="lv-distribution-context" role="alert"><h2>{workflow.error.code === 'BACKEND_NOT_READY' ? (en ? 'The workflow service is not available yet' : 'Dịch vụ xử lý chưa sẵn sàng') : failure.title}</h2><p>{failure.description}</p><button type="button" onClick={workflow.refresh}>{en ? 'Check again' : 'Kiểm tra lại'}</button></section>}
    {(request || feedback) && <section className="lv-distribution-context">
      {request && <div><h2>{en ? 'Documents requested by Legal' : 'Giấy tờ Legal yêu cầu'}</h2><p>{request}</p></div>}
      {feedback && <div><h2>{en ? 'Latest assessment' : 'Ý kiến xử lý gần nhất'}</h2><p>{feedback}</p></div>}
    </section>}
    <DistributionFeedback workflow={workflow} workspace={workspace} lang={lang} />
  </>;
}
