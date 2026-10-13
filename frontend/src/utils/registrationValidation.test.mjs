import test from 'node:test';
import assert from 'node:assert/strict';
import { validateRegistration, validationMessages } from './registrationValidation.js';

test('Registration Validation - Valid inputs return no errors', () => {
  const valid = {
    fullName: 'Nguyễn Văn A',
    email: 'nguyen.van.a@example.com',
    phone: '0901234567',
    password: 'SecurePassword123!',
    confirmPassword: 'SecurePassword123!',
    agreeTerms: true,
  };

  const errorsVi = validateRegistration(valid, 'vi');
  assert.deepEqual(errorsVi, {});

  const errorsEn = validateRegistration(valid, 'en');
  assert.deepEqual(errorsEn, {});
});

test('Registration Validation - Empty fields trigger required errors (vi)', () => {
  const empty = {
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  };

  const errors = validateRegistration(empty, 'vi');
  assert.equal(errors.fullName, validationMessages.vi.fullNameRequired);
  assert.equal(errors.email, validationMessages.vi.emailRequired);
  assert.equal(errors.password, validationMessages.vi.passwordRequired);
  assert.equal(errors.confirmPassword, validationMessages.vi.confirmRequired);
  assert.equal(errors.agreeTerms, validationMessages.vi.termsRequired);
});

test('Registration Validation - One-character name is valid; malformed email/phone/password are rejected', () => {
  const invalid = {
    fullName: 'N',
    email: 'not-an-email',
    phone: '12345',
    password: '123',
    confirmPassword: '456',
    agreeTerms: true,
  };

  const errors = validateRegistration(invalid, 'vi');
  assert.equal(errors.fullName, undefined);
  assert.equal(errors.email, validationMessages.vi.emailInvalid);
  assert.equal(errors.phone, validationMessages.vi.phoneInvalid);
  assert.equal(errors.password, validationMessages.vi.passwordShort);
  assert.equal(errors.confirmPassword, validationMessages.vi.confirmMismatch);
});

test('Registration Validation - Optional phone can be empty without error', () => {
  const validWithoutPhone = {
    fullName: 'Trần Thị B',
    email: 'tran.b@example.com',
    phone: '',
    password: 'Password888',
    confirmPassword: 'Password888',
    agreeTerms: true,
  };

  const errors = validateRegistration(validWithoutPhone, 'vi');
  assert.equal(errors.phone, undefined);
  assert.deepEqual(errors, {});
});

test('Registration Validation - English localization works', () => {
  const empty = {
    fullName: '',
    email: '',
    phone: '',
    password: '',
    confirmPassword: '',
    agreeTerms: false,
  };

  const errors = validateRegistration(empty, 'en');
  assert.equal(errors.fullName, validationMessages.en.fullNameRequired);
  assert.equal(errors.email, validationMessages.en.emailRequired);
  assert.equal(errors.password, validationMessages.en.passwordRequired);
  assert.equal(errors.confirmPassword, validationMessages.en.confirmRequired);
  assert.equal(errors.agreeTerms, validationMessages.en.termsRequired);
});
