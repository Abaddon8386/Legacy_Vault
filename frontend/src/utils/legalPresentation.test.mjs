import test from 'node:test';
import assert from 'node:assert/strict';
import { legalBlocker, legalDate, legalReadOnly, legalStatus } from '../pages/legal/legalPresentation.js';

test('Legal dates use Vietnam time for UTC and offset-less backend timestamps', () => {
  for (const value of ['2026-10-22T18:23:03.753702400Z', '2026-10-22T18:23:03.753702400']) {
    assert.equal(legalDate(value), '23/10/2026, 01:23');
  }
  assert.equal(legalDate('2026-10-23'), '23/10/2026');
  assert.equal(legalDate('invalid'), '—');
  assert.equal(legalDate(null), '—');
});
test('Unknown status and blocker codes never become user-facing backend text', () => {
  assert.equal(legalStatus('FUTURE_BACKEND_ENUM'), 'Chưa xác định');
  assert.doesNotMatch(legalBlocker('SECRET_INTERNAL_ERROR', false).text, /SECRET_INTERNAL_ERROR/);
  assert.equal(legalBlocker('LEGAL_APPROVAL_REQUIRED', false).step, 'approval-review');
});
test('Closed records and unlocked vaults stay read-only', () => {
  assert.equal(legalReadOnly({ caseStatus: 'CLOSED' }), true);
  assert.equal(legalReadOnly({ caseStatus: 'OPEN', vaultStatus: 'UNLOCKED' }), true);
  assert.equal(legalReadOnly({ caseStatus: 'OPEN', vaultStatus: 'LEGAL_BASIS_VERIFICATION' }), false);
});
