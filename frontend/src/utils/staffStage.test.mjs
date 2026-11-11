import test from 'node:test';
import assert from 'node:assert/strict';
import { staffStage } from './staffStage.js';

test('Staff stage says whose turn it is', () => {
  assert.deepEqual(staffStage({ phase: 'AWAITING_DOCUMENTS' }), { label: 'Việc của bạn: nộp giấy tờ phân chia', tone: 'action' });
  assert.equal(staffStage({ phase: 'AWAITING_ALLOCATIONS' }, true).label, 'Your turn: prepare the allocation');
  assert.equal(staffStage({ phase: 'DOCUMENTS_UNDER_REVIEW' }).tone, 'wait');
  assert.equal(staffStage({ phase: 'ALLOCATIONS_UNDER_REVIEW' }).tone, 'wait');
  assert.equal(staffStage({ phase: 'APPROVED' }).tone, 'done');
  assert.equal(staffStage({ phase: 'REJECTED' }).tone, 'bad');
});

test('before distribution starts, the stage names what Legal still has to finish', () => {
  assert.match(staffStage({ phase: 'PREREQUISITES_PENDING', prerequisites: { deathApproved: false, willMatched: false } }).label, /tử vong/);
  assert.match(staffStage({ phase: 'PREREQUISITES_PENDING', prerequisites: { deathApproved: true, willMatched: false } }).label, /di chúc/);
  assert.match(staffStage({ phase: 'DOCUMENT_REQUEST_NEEDED' }).label, /yêu cầu giấy tờ phân chia/);
});

test('no stage while unknown, closed or unrecognised', () => {
  assert.equal(staffStage(null), null);
  assert.equal(staffStage({ phase: 'CLOSED' }), null);
  assert.equal(staffStage({ phase: 'SOMETHING_NEW' }), null);
});
