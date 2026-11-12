import { useEffect, useState } from 'react';
import { Clock } from 'lucide-react';
import { readStoredSession, storeSession } from '../../utils/session.js';
import { sessionExpiryState } from '../../utils/sessionExpiry.js';
import './SessionExpiryNotice.css';

// Presentational: shows nothing unless a warning is due.
/**
 * Thanh cảnh báo phiên sắp hết hạn (thuần hiển thị): không hiện gì nếu {@code state} rỗng; trong phút cuối dùng {@code role="alert"}.
 *
 * @param {object} props
 * @param {({minutes:number,lastMinute:boolean}|null)} props.state Kết quả của {@code sessionExpiryState}.
 * @param {string} [props.lang='vi']
 * @param {()=>void} props.onSignIn Đăng nhập lại.
 * @param {()=>void} props.onDismiss Để sau (ẩn cho đến phút cuối).
 */
export function SessionExpiryBanner({ state, lang = 'vi', onSignIn, onDismiss }) {
  if (!state) return null;
  const en = lang === 'en';
  const when = state.lastMinute ? (en ? 'less than a minute' : 'chưa đến 1 phút') : (en ? `about ${state.minutes} minutes` : `khoảng ${state.minutes} phút`);
  return <aside className="lv-session-expiry" role={state.lastMinute ? 'alert' : 'status'} aria-live={state.lastMinute ? 'assertive' : 'polite'}>
    <Clock className="lv-session-expiry__icon" size={24} aria-hidden="true" />
    <div className="lv-session-expiry__body">
      <p className="lv-session-expiry__title">{en ? 'Your session is about to expire' : 'Phiên đăng nhập sắp hết hạn'}</p>
      <p className="lv-session-expiry__desc">
        {en ? 'You will be signed out in ' : 'Bạn sẽ bị đăng xuất sau '}<strong>{when}</strong>.{' '}
        {en ? 'Save your work, then sign in again.' : 'Hãy lưu công việc đang làm rồi đăng nhập lại.'}
      </p>
    </div>
    <div className="lv-session-expiry__actions">
      <button type="button" className="lv-session-expiry__primary" onClick={onSignIn}>{en ? 'Sign in again' : 'Đăng nhập lại'}</button>
      {!state.lastMinute && <button type="button" className="lv-session-expiry__secondary" onClick={onDismiss}>{en ? 'Later' : 'Để sau'}</button>}
    </div>
  </aside>;
}

// Reads the stored session, so it works for every role and page without touching the app's own session handling.
/**
 * Đọc phiên đã lưu ({@code readStoredSession}) mỗi 15 giây để tính thời gian còn lại ({@code sessionExpiryState}) và hiển thị {@code SessionExpiryBanner}. Hoạt động cho mọi vai trò mà không đụng đến xử lý phiên của ứng dụng.
 * "Đăng nhập lại" xóa phiên ({@code storeSession(null)}) rồi chuyển tới {@code /login}. Ngôn ngữ lấy từ query {@code ?lang=}. Được gắn trong {@code main.jsx}.
 */
export default function SessionExpiryNotice() {
  const [state, setState] = useState(null);
  const [dismissed, setDismissed] = useState(false);
  const lang = new URLSearchParams(globalThis.window?.location?.search || '').get('lang') === 'en' ? 'en' : 'vi';
  useEffect(() => {
    const check = () => setState(sessionExpiryState(readStoredSession()?.expiresAt));
    check();
    const timer = setInterval(check, 15000);
    return () => clearInterval(timer);
  }, []);
  const signIn = () => {
    storeSession(null);
    window.location.assign('/login');
  };
  // A dismissed warning comes back for the last minute.
  if (dismissed && state && !state.lastMinute) return null;
  return <SessionExpiryBanner state={state} lang={lang} onSignIn={signIn} onDismiss={() => setDismissed(true)} />;
}

