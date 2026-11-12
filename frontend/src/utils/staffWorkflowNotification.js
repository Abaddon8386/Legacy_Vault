/**
 * Tiện ích thông báo luồng công việc của nhân viên. Dùng bởi pages/staff/StaffLegalDocumentsPage.jsx và StaffLiveCase.jsx.
 */
import {workflowNotificationFeedback} from './workflowNotificationFeedback.js';
/**
 * Trả hậu tố cảnh báo khi biên nhận không xác nhận được thông báo gửi Ban Pháp lý (chuỗi rỗng nếu thông báo đã được ghi nhận). Dùng workflowNotificationFeedback với đích LEGAL.
 */
export function staffWorkflowNotificationFeedback(receipt, _workspace, lang='vi') {
  // A recorded notification is the normal case and needs no message; only a missing one is reported.
  return workflowNotificationFeedback(receipt,'LEGAL',lang) ? '' : (lang==='en'?' (notification to Legal not confirmed)':' (chưa xác nhận thông báo cho Pháp lý)');
}
/**
 * Phát sự kiện window "lv-workflow-notifications-changed" để các thành phần khác (ví dụ chuông thông báo) làm mới dữ liệu khi quy trình thay đổi.
 */
export function publishStaffWorkflowChange() {
  window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
}
