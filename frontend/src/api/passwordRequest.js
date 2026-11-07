import { ApiError, request } from './http.js';
import { withFirstPassword } from '../utils/passwordSetupFlow.js';

export function passwordRequest(path, options, field = 'password') {
  return withFirstPassword(password => request(path, { ...options, body: { ...options.body, [field]: password } }), options.body[field], options);
}

// Binary responses use the same setup flow, without replacing the application's fetch function.
export function passwordFetch(url, init, options = {}) {
  const originalBody = JSON.parse(init.body);
  return withFirstPassword(async password => {
    const response = await (options.fetchFn || globalThis.fetch)(url, { ...init, body: JSON.stringify({ ...originalBody, password }) });
    if (response.status === 403) {
      const error = await response.clone().json().catch(() => null);
      if (error?.code === 'PASSWORD_NOT_SET') throw new ApiError('PASSWORD_NOT_SET', 403);
    }
    return response;
  }, originalBody.password, options);
}
