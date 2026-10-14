import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLogin, loginValidationMessages } from './loginValidation.js';

test('Login Validation - Valid inputs return no errors', () => {
  const valid = {
    email: 'vaultowner@legacyvault.vn',
    password: 'SecurePassword123!',
  };

  const errorsVi = validateLogin(valid, 'vi');
  assert.deepEqual(errorsVi, {});

  const errorsEn = validateLogin(valid, 'en');
  assert.deepEqual(errorsEn, {});
});

test('Login Validation - Empty credentials trigger required errors (vi)', () => {
  const empty = {
    email: '',
    password: '',
  };

  const errors = validateLogin(empty, 'vi');
  assert.equal(errors.email, loginValidationMessages.vi.emailRequired);
  assert.equal(errors.password, loginValidationMessages.vi.passwordRequired);
});

test('Login Validation - Whitespace-only credentials trigger required errors', () => {
  const whitespace = {
    email: '   ',
    password: '   ',
  };

  const errors = validateLogin(whitespace, 'vi');
  assert.equal(errors.email, loginValidationMessages.vi.emailRequired);
  assert.equal(errors.password, loginValidationMessages.vi.passwordRequired);
});

test('Login Validation - Invalid email format triggers format error', () => {
  const invalidEmail = {
    email: 'invalid-email-format',
    password: 'Password123',
  };

  const errors = validateLogin(invalidEmail, 'vi');
  assert.equal(errors.email, loginValidationMessages.vi.emailInvalid);
  assert.equal(errors.password, undefined);
});

test('Login Validation - English localization returns correct messages', () => {
  const empty = {
    email: '',
    password: '',
  };

  const errors = validateLogin(empty, 'en');
  assert.equal(errors.email, loginValidationMessages.en.emailRequired);
  assert.equal(errors.password, loginValidationMessages.en.passwordRequired);

  const invalidEmail = {
    email: 'bad@format',
    password: 'pass',
  };
  const errorsFormat = validateLogin(invalidEmail, 'en');
  assert.equal(errorsFormat.email, loginValidationMessages.en.emailInvalid);
});

test('Login Validation - Dynamic language switching preserves inputs and updates all error types', () => {
  // Scenario 1: Empty inputs switched from VI to EN and back
  const emptyInputs = { email: '', password: '' };
  const viErrors = validateLogin(emptyInputs, 'vi');
  assert.equal(viErrors.email, 'Vui lòng nhập địa chỉ email.');
  assert.equal(viErrors.password, 'Vui lòng nhập mật khẩu.');

  const enErrors = validateLogin(emptyInputs, 'en');
  assert.equal(enErrors.email, 'Please enter your email address.');
  assert.equal(enErrors.password, 'Please enter your password.');

  // Scenario 2: Invalid email format switched from VI to EN
  const invalidFormatInputs = { email: 'bad-email-syntax', password: '' };
  const viFormatErrors = validateLogin(invalidFormatInputs, 'vi');
  assert.equal(viFormatErrors.email, 'Địa chỉ email chưa đúng định dạng.');

  const enFormatErrors = validateLogin(invalidFormatInputs, 'en');
  assert.equal(enFormatErrors.email, 'Please enter a valid email address.');

  // Ensure input values were not mutated
  assert.equal(invalidFormatInputs.email, 'bad-email-syntax');
  assert.equal(invalidFormatInputs.password, '');
});