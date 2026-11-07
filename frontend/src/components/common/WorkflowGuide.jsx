import { LockKeyhole } from 'lucide-react';
import './WorkflowGuide.css';

// Explains why an action is blocked. The progress guide that used to live here was removed from every screen.
export function WorkflowActionHint({ id, reason }) {
  return reason ? <p id={id} className="lv-workflow-action-hint"><LockKeyhole size={15} aria-hidden="true" />{reason}</p> : null;
}
