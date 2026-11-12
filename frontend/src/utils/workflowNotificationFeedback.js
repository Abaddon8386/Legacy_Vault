import { isUuid } from '../api/contracts.js';

// RECORDED confirms persistence only, never inbox delivery or reading.
export function workflowNotificationFeedback(receipt, recipientWorkspace, lang = 'vi') {
  const notification = receipt?.notification;
  if (!['STAFF', 'LEGAL'].includes(recipientWorkspace) || !isUuid(notification?.id)
      || notification.status !== 'RECORDED' || notification.recipientWorkspace !== recipientWorkspace) return '';
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? ' A notification for ' + recipient + ' has been recorded in the system.' : ' Đã ghi nhận thông báo cho ' + recipient + ' trong hệ thống.';
}

// Only a problem is worth a line: a recorded notification is the normal case and needs no message.
export function workflowNotificationWarning(receipt, recipientWorkspace, lang = 'vi') {
  if (!['STAFF', 'LEGAL'].includes(recipientWorkspace) || workflowNotificationFeedback(receipt, recipientWorkspace, lang)) return '';
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? `Notification to ${recipient} not confirmed` : `Chưa xác nhận thông báo cho ${recipient}`;
}

// A saved operation and a recorded notification are separate confirmations.
export function workflowNotificationStatus(receipt, recipientWorkspace, lang = 'vi') {
  const recorded = workflowNotificationFeedback(receipt, recipientWorkspace, lang);
  if (recorded || !['STAFF', 'LEGAL'].includes(recipientWorkspace)) return recorded;
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? ` The notification to ${recipient} has not been confirmed.`
    : ` Chưa xác nhận việc ghi thông báo cho ${recipient}.`;
}
