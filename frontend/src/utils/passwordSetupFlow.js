// The mounted application owns the dialog. No password or Google credential is cached here.
/**
 * Hàm xử lý hộp thoại đặt mật khẩu lần đầu do ứng dụng đăng ký (components/auth/PasswordSetupProvider.jsx).
 */
let handler;
/**
 * Đăng ký hàm mở hộp thoại đặt mật khẩu cho phiên hiện tại; trả hàm hủy đăng ký.
 */
export function registerPasswordSetup(handlerForSession) {
  handler = handlerForSession;
  return () => { if (handler === handlerForSession) handler = undefined; };
}
/**
 * Tạo lỗi đặt mật khẩu với code (mặc định PASSWORD_SETUP_CANCELLED); PASSWORD_NOT_SET có status 403.
 */
export function passwordSetupError(code = 'PASSWORD_SETUP_CANCELLED') {
  return Object.assign(new Error(code), { code, status: code === 'PASSWORD_NOT_SET' ? 403 : 0 });
}
/**
 * Thông điệp vi/en khi người dùng hủy đặt mật khẩu.
 */
export function passwordSetupCancelledMessage(lang) {
  return lang === 'en'
    ? 'You cancelled password setup. Set a password to continue.'
    : 'Bạn đã hủy đặt mật khẩu. Hãy đặt mật khẩu để tiếp tục.';
}
/**
 * Yêu cầu người dùng nhập mật khẩu lần đầu qua hộp thoại đã đăng ký. Từ chối với AbortError nếu bị hủy hoặc phiên đã đổi, hoặc PASSWORD_NOT_SET nếu chưa có handler.
 */
export function requestFirstPassword(options = {}) {
  if (options.signal?.aborted) return Promise.reject(new DOMException('Aborted', 'AbortError'));
  if (!handler) return Promise.reject(passwordSetupError('PASSWORD_NOT_SET'));
  const owner = handler;
  return owner(options).then(password => {
    if (owner !== handler || options.signal?.aborted) throw new DOMException('Session changed', 'AbortError');
    return password;
  });
}
/**
 * Chạy run(password); nếu backend trả 403 PASSWORD_NOT_SET (tài khoản đăng nhập bằng Google chưa có mật khẩu) thì hiện hộp thoại đặt mật khẩu và chạy lại đúng một lần. Dùng bởi các thao tác cần xác thực lại như xem tài sản, tệp di chúc.
 */
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
