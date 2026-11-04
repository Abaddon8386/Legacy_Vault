// The mounted application owns the dialog. No password or Google credential is cached here.
let handler;
export function registerPasswordSetup(handlerForSession) {
  handler = handlerForSession;
  return () => { if (handler === handlerForSession) handler = undefined; };
}
export function passwordSetupError(code = 'PASSWORD_SETUP_CANCELLED') {
  return Object.assign(new Error(code), { code, status: code === 'PASSWORD_NOT_SET' ? 403 : 0 });
}
export function requestFirstPassword(options = {}) {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (!handler) return Promise.reject(passwordSetupError('PASSWORD_NOT_SET'));
  const owner = handler;
  return owner(options).then(password => {
    if (owner !== handler || options.signal?.aborted) throw new DOMException('Session changed', 'AbortError');
    return password;
  });
}
export async function withFirstPassword(run, password, options) {
  try { return await run(password); }
  catch (error) {
    if (error.code !== 'PASSWORD_NOT_SET' || error.status !== 403) throw error;
    const firstPassword = await requestFirstPassword(options);
    if (options.signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    // Retry only once, only after an explicit PASSWORD_NOT_SET response and a confirmed setup.
    return run(firstPassword);
  }
}
