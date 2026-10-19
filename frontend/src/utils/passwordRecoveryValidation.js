import { EMAIL_REGEX, loginValidationMessages } from './loginValidation.js';

export function validateRecoveryEmail(email, lang = 'vi') {
  const t = loginValidationMessages[lang] || loginValidationMessages.vi;
  const value = typeof email === 'string' ? email.trim() : '';
  if (!value) return { email: t.emailRequired };
  if (value.length > 254 || !EMAIL_REGEX.test(value)) return { email: t.emailInvalid };
  return {};
}

// Never display provider responses or account-existence details in the form.
export function recoveryErrorKey(error) {
  if (error?.status === 429 || error?.code === 'RATE_LIMITED') return 'rateLimited';
  if (error?.code === 'RECOVERY_INVALID') return 'invalidRecovery';
  if (error?.code === 'PASSWORD_POLICY') return 'passwordPolicy';
  return 'requestError';
}
