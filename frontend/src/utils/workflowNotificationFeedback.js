/**
 * Các hàm tạo thông điệp xác nhận việc hệ thống đã ghi nhận thông báo gửi cho bên nhận (nhân viên hoặc pháp lý). Dùng bởi pages/legal/LegalLiveWorkflow.jsx, LegalHandoverReopen.jsx, workflows/DistributionWorkflowOverview.jsx và staffWorkflowNotification.js.
 */
import { isUuid } from '../api/contracts.js';

// RECORDED confirms persistence only, never inbox delivery or reading.
/**
 * Trả câu xác nhận khi biên nhận chứa notification hợp lệ (id UUID, status RECORDED, đúng recipientWorkspace STAFF hoặc LEGAL); ngược lại chuỗi rỗng. RECORDED chỉ xác nhận đã lưu, không chứng minh đã được đọc.
 */
export function workflowNotificationFeedback(receipt, recipientWorkspace, lang = 'vi') {
  const notification = receipt?.notification;
  if (!['STAFF', 'LEGAL'].includes(recipientWorkspace) || !isUuid(notification?.id)
      || notification.status !== 'RECORDED' || notification.recipientWorkspace !== recipientWorkspace) return '';
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? ' A notification for ' + recipient + ' has been recorded in the system.' : ' Đã ghi nhận thông báo cho ' + recipient + ' trong hệ thống.';
}

// Only a problem is worth a line: a recorded notification is the normal case and needs no message.
/**
 * Trả cảnh báo ngắn "Chưa xác nhận thông báo cho ..." chỉ khi thông báo không được ghi nhận; ngược lại chuỗi rỗng.
 */
export function workflowNotificationWarning(receipt, recipientWorkspace, lang = 'vi') {
  if (!['STAFF', 'LEGAL'].includes(recipientWorkspace) || workflowNotificationFeedback(receipt, recipientWorkspace, lang)) return '';
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? `Notification to ${recipient} not confirmed` : `Chưa xác nhận thông báo cho ${recipient}`;
}

// A saved operation and a recorded notification are separate confirmations.
/**
 * Trả câu xác nhận nếu đã ghi nhận, hoặc câu nêu rõ chưa xác nhận được (hiện chỉ test dùng); thao tác đã lưu và thông báo đã ghi là hai xác nhận riêng biệt.
 */
export function workflowNotificationStatus(receipt, recipientWorkspace, lang = 'vi') {
  const recorded = workflowNotificationFeedback(receipt, recipientWorkspace, lang);
  if (recorded || !['STAFF', 'LEGAL'].includes(recipientWorkspace)) return recorded;
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? ` The notification to ${recipient} has not been confirmed.`
    : ` Chưa xác nhận việc ghi thông báo cho ${recipient}.`;
}
