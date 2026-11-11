import test from 'node:test';
import assert from 'node:assert/strict';
import { distributionTabStatus } from './distributionTabStatus.js';

const tones = (phase, versions = false, allocation = null) => Object.values(distributionTabStatus({ phase, allocation }, versions)).map(item => item.tone);

test('each tab follows the workflow phase', () => {
  assert.deepEqual(tones('AWAITING_DOCUMENTS'), ['waiting', 'waiting', 'none', 'none']);
  assert.deepEqual(tones('DOCUMENTS_UNDER_REVIEW', true), ['active', 'active', 'none', 'done']);
  assert.deepEqual(tones('AWAITING_ALLOCATIONS', true), ['waiting', 'done', 'waiting', 'done']);
  assert.deepEqual(tones('ALLOCATIONS_UNDER_REVIEW', true), ['active', 'done', 'active', 'done']);
  assert.deepEqual(tones('APPROVED', true), ['done', 'done', 'done', 'done']);
});

test('rejection is red only on the parts that were submitted', () => {
  assert.deepEqual(tones('REJECTED', true), ['rejected', 'rejected', 'none', 'done']);
  assert.deepEqual(tones('REJECTED', true, { items: [] }), ['rejected', 'rejected', 'rejected', 'done']);
});

test('no workflow data shows nothing as started, with a readable label', () => {
  const result = distributionTabStatus(null, false, true);
  assert.equal(result.overview.tone, 'none');
  assert.equal(result.overview.label, 'Not started');
});

test('nothing is lit until death and will checks pass; once Legal can send the request, only the overview waits', () => {
  assert.deepEqual(tones('PREREQUISITES_PENDING'), ['none', 'none', 'none', 'none']);
  assert.deepEqual(tones('DOCUMENT_REQUEST_NEEDED'), ['waiting', 'none', 'none', 'none']);
});
