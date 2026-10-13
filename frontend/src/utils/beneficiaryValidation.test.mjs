import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBeneficiary } from './beneficiaryValidation.js';

test('validateBeneficiary - requires fullName', () => {
  const errors = validateBeneficiary({ fullName: '' });
  assert.ok(errors.fullName);
});

test('validateBeneficiary - limits fullName to 150 chars', () => {
  const longName = 'b'.repeat(151);
  const errors = validateBeneficiary({ fullName: longName });
  assert.ok(errors.fullName);
});

test('validateBeneficiary - limits relationship to 100 chars', () => {
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', relationship: 'c'.repeat(101) });
  assert.ok(errors.relationship);
});

test('validateBeneficiary - rejects future dateOfBirth', () => {
  const futureYear = new Date().getFullYear() + 2;
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', dateOfBirth: `${futureYear}-01-01` });
  assert.ok(errors.dateOfBirth);
});

test('validateBeneficiary - accepts valid past dateOfBirth', () => {
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', dateOfBirth: '2000-01-01' });
  assert.deepEqual(errors, {});
});

test('validateBeneficiary - rejects invalid dateOfBirth string', () => {
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', dateOfBirth: 'invalid-date' });
  assert.ok(errors.dateOfBirth);
});

test('validateBeneficiary - validates phone format if provided', () => {
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', phone: '123' });
  assert.ok(errors.phone);
});

test('validateBeneficiary - validates email format if provided', () => {
  const errors = validateBeneficiary({ fullName: 'Trần Thị B', email: 'invalid-email' });
  assert.ok(errors.email);
});

test('validateBeneficiary - succeeds with valid fields without any share percentage or account', () => {
  const errors = validateBeneficiary({
    fullName: 'Trần Thị B',
    relationship: 'Con gái',
    dateOfBirth: '1998-05-12',
    phone: '0912345678',
    email: 'b@example.com',
  });
  assert.deepEqual(errors, {});
});
