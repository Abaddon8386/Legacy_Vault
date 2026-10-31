import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowNotificationFeedback } from './workflowNotificationFeedback.js';
const notification = { id: '11111111-1111-4111-8111-111111111111', recipientWorkspace: 'STAFF', status: 'RECORDED' };

test('existing mutation receipts never imply that another workspace was notified', () => {
  for (const receipt of [undefined, null, {}, { decision: 'LEGAL_REJECTED' }, { notification: { status: 'PENDING' } }]) {
    assert.equal(workflowNotificationFeedback(receipt, 'STAFF'), '');
  }
});
test('only a recorded notification for the intended recipient confirms persistence, never delivery or read', () => {
  assert.match(workflowNotificationFeedback({ notification }, 'STAFF'), /Đã ghi nhận thông báo cho Nhân viên trong hệ thống/);
  assert.match(workflowNotificationFeedback({ notification: { ...notification, recipientWorkspace: 'LEGAL' } }, 'LEGAL', 'en'), /notification for Legal has been recorded in the system/);
});
test('wrong recipient, invalid identifier and pending status never produce a delivery confirmation', () => {
  for (const changes of [{ recipientWorkspace: 'LEGAL' }, { id: 'invalid' }, { status: 'PENDING' }, { status: 'FAILED' }]) {
    assert.equal(workflowNotificationFeedback({ notification: { ...notification, ...changes } }, 'STAFF'), '');
  }
  assert.equal(workflowNotificationFeedback({ notification }, 'ADMIN'), '');
});
