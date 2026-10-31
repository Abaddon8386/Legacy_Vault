import test from 'node:test';import assert from 'node:assert/strict';
import {staffWorkflowNotificationFeedback} from './staffWorkflowNotification.js';
test('Staff feedback separates business success from recorded, missing, malformed and wrong-recipient notification receipt',()=>{
  for(const lang of ['vi','en']){for(const receipt of [null,{}, {notification:{id:'invalid',status:'RECORDED',recipientWorkspace:'LEGAL'}},{notification:{id:'11111111-1111-4111-8111-111111111111',status:'RECORDED',recipientWorkspace:'STAFF'}}]){const message=staffWorkflowNotificationFeedback(receipt,'LEGAL',lang);assert.match(message,lang==='vi'?/Chưa xác nhận/:/not been confirmed/);}
  const message=staffWorkflowNotificationFeedback({notification:{id:'11111111-1111-4111-8111-111111111111',status:'RECORDED',recipientWorkspace:'LEGAL'}},'LEGAL',lang);assert.match(message,lang==='vi'?/ghi nhận.*hệ thống/:/recorded in the system/);assert.doesNotMatch(message,/has been sent|has read|đã đọc|đã nhận/);}
});
