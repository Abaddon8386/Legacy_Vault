import { useLayoutEffect, useState } from 'react';
import PasswordRecoveryPage from './PasswordRecoveryPage.jsx';
import { readRecoveryCredential, requestPasswordRecovery, resetRecoveredPassword } from '../../utils/passwordRecoveryService.js';

/**
 * Route kết nối `PasswordRecoveryPage` với dịch vụ khôi phục mật khẩu. Được `App.jsx` render ở `/forgot-password` (mode request) và `/reset-password` (mode reset).
 *
 * Ở mode reset: đọc mã khôi phục từ URL fragment `#token=` (`readRecoveryCredential`) rồi xóa fragment khỏi lịch sử bằng `history.replaceState`.
 * `onRequestRecovery` -> `POST /api/v1/auth/password-recovery/requests` (202, body email + locale);
 * `onResetPassword` -> `POST /api/v1/auth/password-recovery/reset` (204, body credential + password), thành công thì gọi `onComplete(lang)`.
 * Không có mã hợp lệ thì không truyền `onResetPassword` và form hiện thông báo cần xác minh.
 *
 * @param {object} props
 * @param {'request'|'reset'} props.mode Chế độ.
 * @param {Function} props.onComplete Callback sau khi đặt lại mật khẩu thành công.
 * Các props còn lại được chuyển cho `PasswordRecoveryPage` (ví dụ `initialLang`, `onNavigate`).
 */
export default function PasswordRecoveryRoute({ mode, onComplete, ...props }) {
  const [credential] = useState(() => mode === 'reset' ? readRecoveryCredential(window.location.hash) : null);
  useLayoutEffect(() => {
    if (mode === 'reset') window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
  }, [mode]);
  return <PasswordRecoveryPage {...props} mode={mode} onRequestRecovery={requestPasswordRecovery}
    onResetPassword={credential ? async (data, options) => {
      await resetRecoveredPassword(credential, data, options);
      if (!options.signal.aborted) onComplete(options.lang);
    } : undefined} />;
}
