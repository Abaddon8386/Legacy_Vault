import { useEffect, useState } from 'react';
import { readStoredSession, storeSession } from '../../utils/session.js';
import { sessionExpiryState } from '../../utils/sessionExpiry.js';
import './SessionExpiryNotice.css';

// Presentational: shows nothing unless a warning is due.
export function SessionExpiryBanner({ state, lang = 'vi', onSignIn, onDismiss }) {
  if (!state) return null;
  const en = lang === 'en';
  const when = state.lastMinute ? (en ? 'less than a minute' : 'chưa đến 1 phút') : (en ? `about ${state.minutes} minutes` : `khoảng ${state.minutes} phút`);
  return <aside className="lv-session-expiry" role={state.lastMinute ? 'alert' : 'status'} aria-live={state.lastMinute ? 'assertive' : 'polite'}>
    <p className="lv-session-expiry__text">
      <strong>{en ? 'Your session is about to expire.' : 'Phiên đăng nhập sắp hết hạn.'}</strong>
      {' '}{en ? `You will be signed out in ${when}. Save your work, then sign in again.` : `Bạn sẽ bị đăng xuất sau ${when}. Hãy lưu công việc đang làm rồi đăng nhập lại.`}
    </p>
    <div className="lv-session-expiry__actions">
      <button type="button" className="lv-session-expiry__primary" onClick={onSignIn}>{en ? 'Sign in again' : 'Đăng nhập lại'}</button>
      {!state.lastMinute && <button type="button" className="lv-session-expiry__secondary" onClick={onDismiss}>{en ? 'Later' : 'Để sau'}</button>}
    </div>
  </aside>;
}

// Reads the stored session, so it works for every role and page without touching the app's own session handling.
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
