import test from 'node:test';
import assert from 'node:assert/strict';
import { formatCaseReference } from './caseReference.js';
test('case references shorten UUIDs only and preserve business references', () => {
  assert.equal(formatCaseReference('ab6e594d-ba69-405c-86ab-d54f38d8c897'), 'ab6e594d…c897');
  assert.equal(formatCaseReference('CASE-2026-0001'), 'CASE-2026-0001');
  assert.equal(formatCaseReference(null), '—');
});
