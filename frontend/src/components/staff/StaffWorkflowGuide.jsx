import WorkflowGuide from '../common/WorkflowGuide.jsx';
import { staffGuidance } from '../../utils/workflowGuidance.js';

export default function StaffWorkflowGuide(props) {
  const en = props.lang === 'en';
  const failure = props.error;
  const code = typeof failure === 'string' ? failure : failure?.code;
  const failureText = typeof failure === 'string' && /\s/.test(failure) ? failure
    : failure?.status === 401 || code === 'UNAUTHENTICATED' ? (en ? 'Your session has expired. Please sign in again.' : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.')
    : failure?.status === 403 || code === 'ACCESS_DENIED' ? (en ? 'You do not have permission to view this case.' : 'Bạn không có quyền xem hồ sơ này.')
    : (en ? 'Could not load workflow progress.' : 'Chưa tải được tiến trình hồ sơ.');
  if (props.loading || props.error) return <section className="lv-workflow-guide" aria-label={props.lang === 'en' ? 'Workflow progress' : 'Tiến trình xử lý'}>
    <h2>{props.lang === 'en' ? 'Workflow progress' : 'Tiến trình xử lý'}</h2>
    <p role={props.error ? 'alert' : 'status'}>{props.error
      ? failureText
      : (props.lang === 'en' ? 'Loading workflow progress…' : 'Đang tải tiến trình hồ sơ…')}</p>
    {props.error && props.onRetry && <button type="button" onClick={props.onRetry}>{props.lang === 'en' ? 'Retry' : 'Thử lại'}</button>}
  </section>;
  return <WorkflowGuide showNext={false} lang={props.lang} model={staffGuidance(props)} />;
}
