import FeedbackNotice from '../components/common/FeedbackNotice.jsx';
import { workflowNotificationFeedback } from '../utils/workflowNotificationFeedback.js';
import './DistributionWorkflow.css';

const phases = {
  PREREQUISITES_PENDING: ['Chờ duyệt khai tử và đối chiếu di chúc', 'Awaiting death verification and will comparison'],
  DOCUMENT_REQUEST_NEEDED: ['Legal cần yêu cầu giấy tờ phân chia', 'Legal must request distribution documents'],
  AWAITING_DOCUMENTS: ['Chờ người nộp mang giấy tờ về cho Staff', 'Awaiting documents from the applicant'],
  DOCUMENTS_UNDER_REVIEW: ['Legal đang thẩm định giấy tờ phân chia', 'Legal is reviewing distribution documents'],
  AWAITING_ALLOCATIONS: ['Đã duyệt căn cứ · Staff lập phân bổ', 'Documents accepted · Staff prepares allocations'],
  ALLOCATIONS_UNDER_REVIEW: ['Legal kiểm tra từng tài sản và người nhận', 'Legal checks each asset and recipient'],
  FINAL_APPROVAL: ['Đã kiểm tra phân bổ · Chờ duyệt hồ sơ', 'Allocations checked · Awaiting final approval'],
  APPROVED: ['Đã phê duyệt · Mở kho là bước riêng', 'Approved · Unlocking is a separate step'],
  UNLOCKED: ['Kho đã mở · Staff tiếp tục bàn giao', 'Vault unlocked · Staff continues handover'],
  CLOSED: ['Hồ sơ đã kết thúc · Chỉ xem', 'Case closed · Read only'],
};
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
  const steps = en ? ['Legal requests documents', 'Staff uploads documents', 'Legal approves documents', 'Staff prepares allocations', 'Legal checks allocations']
    : ['Legal yêu cầu giấy tờ', 'Staff tải giấy tờ', 'Legal duyệt căn cứ', 'Staff lập phân bổ', 'Legal kiểm tra phân bổ'];
  const indexes = { DOCUMENT_REQUEST_NEEDED: 0, AWAITING_DOCUMENTS: 1, DOCUMENTS_UNDER_REVIEW: 2, AWAITING_ALLOCATIONS: 3, ALLOCATIONS_UNDER_REVIEW: 4, FINAL_APPROVAL: 5, APPROVED: 5, UNLOCKED: 5 };
  const current = indexes[value?.phase] ?? -1;
  return <section className="lv-distribution-workflow lv-surface-card" aria-label={en ? 'Distribution workflow' : 'Quy trình giấy tờ và phân bổ'}>
    <h2>{en ? 'Distribution documents and allocations' : 'Giấy tờ phân chia và phân bổ'}</h2>
    <ol className="lv-distribution-stages">{steps.map((label, index) => <li key={label} aria-current={index === current ? 'step' : undefined}
      className={index < current ? 'is-done' : index === current ? 'is-current' : ''}><span aria-hidden="true">{index + 1}</span>{label}</li>)}</ol>
    {workflow.loading ? <p role="status">{en ? 'Checking the current step…' : 'Đang kiểm tra bước hiện tại…'}</p>
      : workflow.error ? <div role="status"><p>{[404, 501].includes(workflow.error.status)
        ? (en ? 'This workflow is not available yet. Existing documents can still be viewed; changes require the service to be ready.' : 'Quy trình này hiện chưa khả dụng. Bạn vẫn có thể xem giấy tờ đã lưu; thao tác mới cần chờ hệ thống sẵn sàng.')
        : (en ? 'The current step could not be checked. Reload before making changes.' : 'Chưa kiểm tra được bước hiện tại. Tải lại trước khi thao tác.')}</p>
        <button type="button" onClick={workflow.refresh}>{en ? 'Check again' : 'Kiểm tra lại'}</button></div>
      : value ? <><p className="lv-distribution-next" role="status">{phases[value.phase][en ? 1 : 0]}</p>
        {value.request && <div className="lv-distribution-request"><strong>{en ? 'Requested documents' : 'Giấy tờ cần nộp'}</strong><p>{value.request.reason}</p></div>}
        {value.feedback && <div className="lv-distribution-request"><strong>{en ? 'Latest feedback' : 'Ý kiến xử lý gần nhất'}</strong><p>{value.feedback}</p></div>}
        <button type="button" onClick={workflow.refresh} disabled={workflow.pending}>{en ? 'Refresh case status' : 'Kiểm tra lại trạng thái'}</button>
        {value.phase === 'AWAITING_DOCUMENTS' && <p>{en ? 'The applicant obtains court or notarized documents outside this system, then brings them to Staff. Allocations are prepared after Legal accepts the documents.' : 'Người nộp tự làm giấy tờ tại Tòa án hoặc tổ chức công chứng, sau đó mang về cho Staff. Chỉ lập phân bổ sau khi Legal duyệt căn cứ.'}</p>}
      </> : <p>{en ? 'Select a case to check the next step.' : 'Chọn hồ sơ để kiểm tra bước tiếp theo.'}</p>}
    <DistributionFeedback workflow={workflow} workspace={workspace} lang={lang} />
  </section>;
}
