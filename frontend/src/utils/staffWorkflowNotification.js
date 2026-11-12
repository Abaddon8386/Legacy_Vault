import {workflowNotificationFeedback} from './workflowNotificationFeedback.js';
export function staffWorkflowNotificationFeedback(receipt, _workspace, lang='vi') {
  // A recorded notification is the normal case and needs no message; only a missing one is reported.
  return workflowNotificationFeedback(receipt,'LEGAL',lang) ? '' : (lang==='en'?' (notification to Legal not confirmed)':' (chưa xác nhận thông báo cho Pháp lý)');
}
export function publishStaffWorkflowChange() {
  window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
}
