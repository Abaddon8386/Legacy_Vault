import test from 'node:test';
import assert from 'node:assert/strict';
import { legalBlocker, legalDate, legalReadOnly, legalStatus, legalStatusTone, legalStepBlocker } from '../pages/legal/legalPresentation.js';

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
  assert.equal(legalBlocker('SECRET_INTERNAL_ERROR', false).step, null);
});
test('Closed records and unlocked vaults stay read-only', () => {
  assert.equal(legalReadOnly({ caseStatus: 'CLOSED' }), true);
  assert.equal(legalReadOnly({ caseStatus: 'CANCELLED', vaultStatus: 'ACTIVE' }), true);
  assert.equal(legalReadOnly({ caseStatus: 'OPEN', vaultStatus: 'UNLOCKED' }), true);
  assert.equal(legalReadOnly({ caseStatus: 'OPEN', vaultStatus: 'LEGAL_BASIS_VERIFICATION' }), false);
});

test('Semantic status colors distinguish waiting, closed, success and errors', () => {
  assert.equal(legalStatusTone('ON_HOLD'), 'warning');
  assert.equal(legalStatusTone('CANCELLED'), 'neutral');
  assert.equal(legalStatusTone('UNLOCKED'), 'success');
  assert.equal(legalStatusTone('INVALID'), 'error');
  assert.equal(legalStatusTone('FUTURE_STATUS'), 'info');
});

test('Legal explains missing records, forwarded versions and holds using existing data', () => {
  assert.match(legalStepBlocker('death-verification', {}, true), /No death documents/);
  assert.match(legalStepBlocker('death-verification', { documentCount: 1 }, true), /Select a death document/);
  assert.match(legalStepBlocker('death-verification', { documentCount: 1, documentId: 'selected', data: { decisions: [{}] } }, true), /already has a recorded decision/);
  assert.match(legalStepBlocker('will-document-verification', {}, true), /No original paper will/);
  assert.match(legalStepBlocker('will-document-verification', { data: { originalWillIntakes: [{}], wills: [] } }, true), /No digitized will/);
  assert.match(legalStepBlocker('basis-route-selection', { data: { dossier: { route: 'COURT' } } }, true), /no current legal|no document|document|version/i);
  assert.match(legalStepBlocker('dossier-review', { data: { dossier: { route: 'ON_HOLD' } } }, true), /on hold/);
  assert.match(legalStepBlocker('dossier-review', { data: { dossier: { route: 'COURT', requiredVersion: 2, versions: [{ version: 1 }] } } }, true), /older than the required/);
  assert.match(legalStepBlocker('dossier-review', { data: { dossier: { route: 'COURT', requiredVersion: 1, versions: [{ version: 1, forwardStatus: 'NOT_FORWARDED' }] } } }, true), /Staff have not forwarded/);
});
