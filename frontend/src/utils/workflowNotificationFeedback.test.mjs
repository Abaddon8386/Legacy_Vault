import test from 'node:test';
import assert from 'node:assert/strict';
import { workflowNotificationFeedback, workflowNotificationStatus } from './workflowNotificationFeedback.js';
const notification = { id: '11111111-1111-4111-8111-111111111111', recipientWorkspace: 'STAFF', status: 'RECORDED' };

test('existing mutation receipts never imply that another workspace was notified', () => {
  for (const receipt of [undefined, null, {}, { decision: 'LEGAL_REJECTED' }, { notification: { status: 'PENDING' } }]) {
    assert.equal(workflowNotificationFeedback(receipt, 'STAFF'), '');
  }
});

test('Legal always distinguishes a saved decision from an unconfirmed Staff notification', () => {
  for (const receipt of [{ decision: 'LEGAL_REJECTED' }, { notification: { ...notification, recipientWorkspace: 'LEGAL' } },
    { notification: { ...notification, status: 'FAILED' } }]) {
    assert.match(workflowNotificationStatus(receipt, 'STAFF'), /Chưa xác nhận.*Nhân viên/);
    assert.match(workflowNotificationStatus(receipt, 'STAFF', 'en'), /notification to Staff has not been confirmed/);
  }
  assert.equal(workflowNotificationStatus({ notification }, 'STAFF'), workflowNotificationFeedback({ notification }, 'STAFF'));
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
