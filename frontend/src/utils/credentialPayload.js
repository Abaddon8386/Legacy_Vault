// The backend encrypts payload as opaque text; the API shape stays unchanged.
export function credentialPayload(username = '', password = '') {
  if (!username.trim() && !password) return '';
  return JSON.stringify({ username: username.trim(), password });
}
