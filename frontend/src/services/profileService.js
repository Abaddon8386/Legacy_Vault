import { request, ApiError } from '../api/http.js';
import { readUser } from '../api/contracts.js';
import { isSessionActive } from '../utils/session.js';

// Only explicitly editable profile fields are sent; IDs/roles/system state never enter the body.
export async function updateProfile(session, changes, { signal, lang = 'vi' } = {}) {
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const keys = Object.keys(changes);
  if (!keys.length || keys.some(key => !['fullName', 'phoneNumber'].includes(key))) throw new ApiError('INVALID_PROFILE_PATCH');
  const raw = await request('/auth/me', { method: 'PATCH', body: changes,
    accessToken: session.accessToken, signal, lang, expectedStatus: 200 });
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
  if (!isSessionActive(session)) throw new ApiError('UNAUTHENTICATED', 401);
  const user = readUser(raw);
  if (user.id !== session.user.id || !Object.hasOwn(user, 'phoneNumber')) throw new ApiError('INVALID_PROFILE_RESPONSE');
  return user;
}
