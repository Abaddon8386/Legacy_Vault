import { useContext, useEffect, useRef, useState } from 'react';
import { PasswordSetupContext } from './passwordSetupContext.js';
import { passwordSetupCancelledMessage, requestFirstPassword } from '../../utils/passwordSetupFlow.js';

/**
 * Nút "Đặt mật khẩu lần đầu" dành cho tài khoản đăng nhập bằng Google chưa có mật khẩu. Chỉ hiển thị khi {@code PasswordSetupContext.needed} là true
 * (tức {@code session.user.passwordLoginEnabled === false}). Khi bấm gọi {@code requestFirstPassword} ({@code utils/passwordSetupFlow.js}) để mở hộp thoại của
 * {@code PasswordSetupProvider}; mật khẩu vừa đặt được trả qua {@code onReady(password)} để form cha (xem tài sản, tải tệp, đổi email...) dùng tiếp.
 * Hủy hộp thoại thì hiện thông báo {@code PASSWORD_SETUP_CANCELLED}; unmount thì hủy request.
 *
 * @param {object} props
 * @param {string} [props.lang='vi']
 * @param {(password:string)=>void} props.onReady Nhận mật khẩu mới.
 * @param {boolean} [props.disabled=false] Khóa nút.
 */
export default function FirstPasswordButton({ lang = 'vi', onReady, disabled = false }) {
  const context = useContext(PasswordSetupContext), controller = useRef(null);
  const [busy, setBusy] = useState(false), [feedback, setFeedback] = useState('');
  useEffect(() => () => controller.current?.abort(), []);
  if (!context?.needed) return null;
  async function setup() {
    if (controller.current) return;
    const c = new AbortController(); controller.current = c; setBusy(true); setFeedback('');
    try {
      const password = await requestFirstPassword({ accessToken: context.accessToken, lang, signal: c.signal });
      if (!c.signal.aborted) onReady(password);
    } catch (error) {
      if (!c.signal.aborted) setFeedback(error.code === 'PASSWORD_SETUP_CANCELLED'
        ? passwordSetupCancelledMessage(lang)
        : (lang === 'en' ? 'Password setup was not completed. Your entered details are kept.' : 'Chưa hoàn tất đặt mật khẩu. Nội dung bạn đang nhập vẫn được giữ.'));
    }
    finally { if (!c.signal.aborted) { controller.current = null; setBusy(false); } }
  }
  return <div className="lv-first-password-action">
    <p>{lang === 'en' ? 'You signed in with Google and have not set a password yet.' : 'Bạn đăng nhập bằng Google và chưa đặt mật khẩu tài khoản.'}</p>
    <button type="button" disabled={disabled || busy} onClick={setup}>{lang === 'en' ? 'Set your first password' : 'Đặt mật khẩu lần đầu'}</button>
    {feedback && <p role="status">{feedback}</p>}
  </div>;
}
