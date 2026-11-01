import WorkflowGuide from '../common/WorkflowGuide.jsx';
import { staffGuidance } from '../../utils/workflowGuidance.js';

export default function StaffWorkflowGuide(props) {
  return <WorkflowGuide showNext={false} lang={props.lang} model={staffGuidance(props)} />;
}
