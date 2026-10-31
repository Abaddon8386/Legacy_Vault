import {workflowNotificationFeedback} from './workflowNotificationFeedback.js';
export function staffWorkflowNotificationFeedback(receipt, _workspace, lang='vi') {
  return workflowNotificationFeedback(receipt,'LEGAL',lang) || (lang==='en'?' The notification to Legal has not been confirmed.':' Chưa xác nhận việc ghi thông báo cho Pháp lý.');
}
export function publishStaffWorkflowChange() {
  window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
}
