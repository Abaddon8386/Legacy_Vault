import FeedbackNotice from '../components/common/FeedbackNotice.jsx';
import { workflowNotificationStatus } from '../utils/workflowNotificationFeedback.js';
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
  const confirmation = workflowNotificationStatus(notice, target, lang);
  const staleWhileWaiting = (workflow.failure?.status === 409 || workflow.failure?.code === 'CONFLICT')
    && workflow.data?.phase === 'AWAITING_DOCUMENTS';
  return <>
    {notice && <FeedbackNotice tone="success" title={outcomes[notice.action]?.[en ? 1 : 0] || (en ? 'Saved successfully.' : 'Đã lưu thành công.')}>
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
export default function DistributionWorkflowOverview({ workflow, workspace, lang = 'vi', showRefresh = true }) {
  const en = lang === 'en', value = workflow.data;
  const request = value?.phase === 'AWAITING_DOCUMENTS' ? value.request?.reason : null;
  const feedback = value?.phase !== 'CLOSED' ? value?.feedback : null;
  const failure = workflow.error ? workflowFailure(workflow.error, lang) : null;
  return <>
    {showRefresh && <div className="lv-distribution-refresh"><button type="button" onClick={workflow.refresh} disabled={workflow.loading || workflow.pending}>{workflow.loading ? (en ? 'Checking status…' : 'Đang kiểm tra trạng thái…') : (en ? 'Refresh case status' : 'Cập nhật trạng thái hồ sơ')}</button></div>}
    {failure && <section className="lv-distribution-context" role="alert"><h2>{workflow.error.code === 'BACKEND_NOT_READY' ? (en ? 'The workflow service is not available yet' : 'Dịch vụ xử lý chưa sẵn sàng') : failure.title}</h2><p>{failure.description}</p></section>}
    {(request || feedback) && <section className={`lv-distribution-context${request || feedback ? ' lv-distribution-context--request' : ''}`}>
      {feedback && <div><h2>{value?.phase === 'AWAITING_DOCUMENTS' && value.document?.status === 'CHANGES_REQUESTED'
        ? (en ? 'Reason for additional documents' : 'Lý do yêu cầu bổ sung giấy tờ')
        : (en ? 'Latest assessment' : 'Ý kiến xử lý gần nhất')}</h2><p>{feedback}</p></div>}
      {request && !feedback && <div><h2>{en ? 'Original document request' : 'Yêu cầu giấy tờ ban đầu'}</h2><p>{request}</p></div>}
    </section>}
    <DistributionFeedback workflow={workflow} workspace={workspace} lang={lang} />
  </>;
}
