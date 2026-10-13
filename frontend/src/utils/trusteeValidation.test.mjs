import test from 'node:test';
import assert from 'node:assert/strict';
import { validateTrustee } from './trusteeValidation.js';

test('validateTrustee - requires fullName', () => {
  const errors = validateTrustee({ fullName: '', phone: '0901234567' });
  assert.ok(errors.fullName);
});

test('validateTrustee - limits fullName to 150 chars', () => {
  const longName = 'a'.repeat(151);
  const errors = validateTrustee({ fullName: longName, phone: '0901234567' });
  assert.ok(errors.fullName);
});

test('validateTrustee - requires at least phone or email', () => {
  const errors = validateTrustee({ fullName: 'Nguyễn Văn A' });
  assert.ok(errors.contact);
  assert.ok(errors.phone);
  assert.ok(errors.email);
});

test('validateTrustee - accepts valid phone without email', () => {
  const errors = validateTrustee({ fullName: 'Nguyễn Văn A', phone: '0901234567' });
  assert.deepEqual(errors, {});
});

test('validateTrustee - accepts valid email without phone', () => {
  const errors = validateTrustee({ fullName: 'Nguyễn Văn A', email: 'test@example.com' });
  assert.deepEqual(errors, {});
});

test('validateTrustee - rejects invalid phone', () => {
  const errors = validateTrustee({ fullName: 'Nguyễn Văn A', phone: '123' });
  assert.ok(errors.phone);
});

test('validateTrustee - rejects invalid email', () => {
  const errors = validateTrustee({ fullName: 'Nguyễn Văn A', email: 'not-an-email' });
  assert.ok(errors.email);
});

test('validateTrustee - checks relationship and note lengths', () => {
  const errors = validateTrustee({
    fullName: 'Nguyễn Văn A',
    phone: '0901234567',
    relationship: 'x'.repeat(101),
    note: 'y'.repeat(501),
  });
  assert.ok(errors.relationship);
  assert.ok(errors.note);
});
