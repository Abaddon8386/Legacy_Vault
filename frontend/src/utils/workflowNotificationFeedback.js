import { isUuid } from '../api/contracts.js';

// Only a server receipt confirms that the other workspace was notified.
export function workflowNotificationFeedback(receipt, recipientWorkspace, lang = 'vi') {
  const notification = receipt?.notification;
  if (!['STAFF', 'LEGAL'].includes(recipientWorkspace) || !isUuid(notification?.id)
      || notification.status !== 'RECORDED' || notification.recipientWorkspace !== recipientWorkspace) return '';
  const recipient = recipientWorkspace === 'STAFF'
    ? (lang === 'en' ? 'Staff' : 'Nhân viên') : (lang === 'en' ? 'Legal' : 'Pháp lý');
  return lang === 'en' ? ' A notification has been sent to ' + recipient + '.' : ' Đã gửi thông báo cho ' + recipient + '.';
}
