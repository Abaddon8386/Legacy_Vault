import { request, ApiError } from '../api/http.js';
import { readUser } from '../api/contracts.js';
import { isSessionActive } from '../utils/session.js';
import { canEditProfileEmail, isValidEmail } from '../utils/accountEditValidation.js';

// Only explicitly editable profile fields are sent; IDs/roles/system state never enter the body.
export async function updateProfile(session, changes, { signal, lang = 'vi' } = {}) {
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !['fullName', 'phoneNumber', 'email', 'currentPassword'].includes(key))) throw new ApiError('INVALID_PROFILE_PATCH');
  const body = Object.fromEntries(keys.filter(key => ['fullName', 'phoneNumber'].includes(key)).map(key => [key, changes[key]]));
  if (Object.hasOwn(changes, 'email')) {
    if (!canEditProfileEmail(session).canEdit) throw new ApiError('ACCESS_DENIED', 403);
    if (!isValidEmail(changes.email)) throw new ApiError('VALIDATION_FAILED', 400);
    const email = changes.email.trim().toLowerCase();
    if (email !== session.user.email.trim().toLowerCase()) {
      if (typeof changes.currentPassword !== 'string' || !changes.currentPassword.trim()) throw new ApiError('CURRENT_PASSWORD_REQUIRED', 400);
      body.email = email;
      body.currentPassword = changes.currentPassword;
    }
  }
  if ((!Object.hasOwn(body, 'email') && Object.hasOwn(changes, 'currentPassword')) || !Object.keys(body).length) throw new ApiError('INVALID_PROFILE_PATCH');
  const raw = await request('/auth/me', { method: 'PATCH', body,
    accessToken: session.accessToken, signal, lang, expectedStatus: 200 });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const user = readUser(raw);
  if (user.id !== session.user.id || !Object.hasOwn(user, 'phoneNumber')) throw new ApiError('INVALID_PROFILE_RESPONSE');
  return user;
}
