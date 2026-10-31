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
