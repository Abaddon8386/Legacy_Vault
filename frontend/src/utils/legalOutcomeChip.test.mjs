import test from 'node:test';
import assert from 'node:assert/strict';
import { versionOutcomeChip } from '../components/staff/documentOutcomeResults.js';

const version = (entry, extra = {}) => ({ version: 1, current: true, legalHistory: [{ id: 'a', decidedAt: '2026-10-26T08:38:00Z', reason: 'ok', currentScope: true, ...entry }], ...extra });

test('a current approval shows the green approved chip', () => {
  assert.deepEqual(versionOutcomeChip(version({ result: 'LEGAL_APPROVED' })), { label: 'Đã phê duyệt', tone: 'positive', stale: false, resultLabel: 'Đã phê duyệt' });
});

test('an approval that is no longer in scope never looks current', () => {
  const chip = versionOutcomeChip(version({ result: 'LEGAL_APPROVED', currentScope: false }));
  assert.equal(chip.tone, 'history');
  assert.equal(chip.stale, true);
  assert.equal(chip.label, 'Kết quả cũ');
  assert.equal(chip.resultLabel, 'Đã phê duyệt');
});

test('a result on an older document version is historical even when its scope flag is true', () => {
  const chip = versionOutcomeChip(version({ result: 'LEGAL_APPROVED' }, { current: false }), true);
  assert.equal(chip.tone, 'history');
  assert.equal(chip.label, 'Previous result');
});

test('no decision gives no chip', () => {
  assert.equal(versionOutcomeChip({ legalHistory: [] }), null);
  assert.equal(versionOutcomeChip(undefined), null);
});
