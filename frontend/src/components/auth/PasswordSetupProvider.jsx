import { useId, useLayoutEffect, useRef, useState } from 'react';
import { request, ApiError } from '../../api/http.js';
import { registerPasswordSetup, passwordSetupError } from '../../utils/passwordSetupFlow.js';
import { validatePasswordFields } from '../../utils/registrationValidation.js';
import { useModalFocus } from '../common/useModalFocus.js';
import GoogleSignInButton from './GoogleSignInButton.jsx';
import './PasswordSetupProvider.css';
import { PasswordSetupContext } from './passwordSetupContext.js';

export default function PasswordSetupProvider({ session, onConfigured, children }) {
  return <PasswordSetupContext.Provider value={{ needed: session?.user?.passwordLoginEnabled === false, accessToken: session?.accessToken }}>
    <PasswordSetupScope key={`${session?.accessToken || ''}:${session?.user?.id || ''}`} session={session} onConfigured={onConfigured} />{children}
  </PasswordSetupContext.Provider>;
}

function PasswordSetupScope({ session, onConfigured }) {
  const [prompt, setPrompt] = useState(null);
  const waiting = useRef(new Set());
  const token = session?.accessToken, userId = session?.user?.id, expiresAt = session?.expiresAt;
  useLayoutEffect(() => {
    const unregister = registerPasswordSetup(options => new Promise((resolve, reject) => {
      if (!token || token !== options.accessToken || !userId || !Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
        reject(new DOMException('Session changed', 'AbortError')); return;
      }
      const waiter = { resolve, reject, signal: options.signal };
      waiter.abort = () => { waiting.current.delete(waiter); reject(new DOMException('Aborted', 'AbortError')); if (!waiting.current.size) setPrompt(null); };
      waiting.current.add(waiter);
      options.signal?.addEventListener('abort', waiter.abort, { once: true });
      setPrompt(previous => previous || { lang: options.lang || 'vi' });
    }));
    const waiters = waiting.current;
    return () => {
      unregister();
      for (const waiter of waiters) { waiter.signal?.removeEventListener('abort', waiter.abort); waiter.reject(new DOMException('Session changed', 'AbortError')); }
      waiters.clear();
    };
  }, [token, userId, expiresAt]);
  function finish(password) {
    if (password) onConfigured?.(token);
    for (const waiter of waiting.current) {
      waiter.signal?.removeEventListener('abort', waiter.abort);
      if (password) waiter.resolve(password); else waiter.reject(passwordSetupError());
    }
    waiting.current.clear(); setPrompt(null);
  }
  return prompt && <PasswordSetupDialog session={session} lang={prompt.lang} onDone={finish} />;
}

function PasswordSetupDialog({ session, lang, onDone }) {
  const en = lang === 'en', id = useId();
  const [password, setPassword] = useState(''), [confirm, setConfirm] = useState(''), [credential, setCredential] = useState('');
  const [status, setStatus] = useState('checking'), [error, setError] = useState('');
  const busy = useRef(false), controller = useRef(null), alive = useRef(true);
  const ref = useModalFocus(true, () => onDone(null), status === 'saving');
  // This dialog can sit over an asset/profile dialog. Handle its keyboard events before the underlying dialog.
  useLayoutEffect(() => {
    const keyboard = event => {
      if (!['Tab', 'Escape'].includes(event.key)) return;
      event.stopImmediatePropagation();
      if (event.key === 'Escape') { event.preventDefault(); if (status !== 'saving') onDone(null); return; }
      const controls = [...ref.current.querySelectorAll('button:enabled,input:enabled,[tabindex="0"]')];
      const first = controls[0], last = controls.at(-1);
      if (!first) { event.preventDefault(); ref.current.focus(); }
      else if (!ref.current.contains(document.activeElement) || (event.shiftKey && document.activeElement === first)) { event.preventDefault(); (event.shiftKey ? last : first).focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener('keydown', keyboard, true);
    return () => window.removeEventListener('keydown', keyboard, true);
  }, [onDone, ref, status]);
  useLayoutEffect(() => {
    alive.current = true;
    const c = new AbortController(); controller.current = c;
    request('/auth/me', { accessToken: session.accessToken, lang, signal: c.signal, expectedStatus: 200, cache: 'no-store' })
      .then(user => { if (!c.signal.aborted) {
        if (user.id !== session.user.id || typeof user.passwordLoginEnabled !== 'boolean') throw new ApiError('INVALID_RESPONSE');
        if (user.passwordLoginEnabled) { setError('PASSWORD_ALREADY_SET'); setStatus('blocked'); }
        else setStatus('ready');
      } }).catch(failure => { if (!c.signal.aborted) { setError(failure.code || 'NETWORK_ERROR'); setStatus('blocked'); } });
    return () => { alive.current = false; controller.current?.abort(); };
  }, [session, lang]);
  const errors = validatePasswordFields({ password, confirmPassword: confirm }, lang);
  if (new TextEncoder().encode(password).length > 72) errors.password = en ? 'Password must not exceed 72 bytes.' : 'Mật khẩu không được vượt quá 72 byte.';
  const labels = {
    GOOGLE_IDENTITY_MISMATCH: en ? 'Choose the Google account already linked to this account, then try again.' : 'Hãy chọn đúng tài khoản Google đã liên kết với tài khoản này rồi thử lại.',
    INVALID_GOOGLE_CREDENTIAL: en ? 'Verify with Google again to get a new confirmation.' : 'Vui lòng xác thực lại với Google để nhận xác nhận mới.',
    PASSWORD_ALREADY_SET: en ? 'A password has already been set. Close this dialog and use your current password.' : 'Tài khoản đã có mật khẩu. Đóng hộp thoại và nhập mật khẩu hiện tại.',
    PASSWORD_POLICY: en ? 'This password does not meet the password requirements.' : 'Mật khẩu này chưa đáp ứng yêu cầu. Vui lòng chọn mật khẩu khác.',
    UNAUTHENTICATED: en ? 'Your session expired. Close this dialog and sign in again.' : 'Phiên làm việc đã hết hạn. Đóng hộp thoại và đăng nhập lại.',
  };
  async function submit(event) {
    event.preventDefault();
    if (busy.current || status !== 'ready' || !credential || Object.keys(errors).length) return;
    busy.current = true; setStatus('saving'); setError('');
    const c = new AbortController(); controller.current = c;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; c.abort(); }, 20000);
    try {
      const result = await request('/auth/password/setup', { method: 'POST', body: { password, credential }, accessToken: session.accessToken, lang, signal: c.signal, expectedStatus: 200 });
      if (!alive.current || c.signal.aborted) return;
      if (result?.passwordLoginEnabled !== true) throw new ApiError('INVALID_RESPONSE');
      const saved = password; setPassword(''); setConfirm(''); setCredential(''); onDone(saved);
    } catch (failure) {
      if (alive.current && (!c.signal.aborted || timedOut)) {
        setCredential(''); setError(timedOut ? 'SETUP_UNCONFIRMED' : failure.code || 'NETWORK_ERROR');
        setStatus(['UNAUTHENTICATED', 'PASSWORD_ALREADY_SET'].includes(failure.code) ? 'blocked' : 'ready');
      }
    } finally { clearTimeout(timer); busy.current = false; }
  }
  return <div className="lv-password-setup" role="presentation">
    <section ref={ref} role="dialog" aria-modal="true" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} tabIndex={-1}>
      <h2 id={`${id}-title`}>{en ? 'Set your account password' : 'Đặt mật khẩu cho tài khoản'}</h2>
      <p id={`${id}-description`}>{en ? 'You signed in with Google. Set a password once to continue this protected action. Your entered details will be kept.' : 'Bạn đang đăng nhập bằng Google. Đặt mật khẩu lần đầu để tiếp tục thao tác được bảo vệ. Thông tin đang nhập sẽ được giữ lại.'}</p>
      {status === 'checking' && <p role="status">{en ? 'Checking your account…' : 'Đang kiểm tra tài khoản…'}</p>}
      {error && <p role="alert">{labels[error] || (en ? 'Unable to confirm the password setup. Try again, or close and check your account before retrying.' : 'Chưa xác nhận được việc đặt mật khẩu. Thử lại hoặc đóng hộp thoại và kiểm tra tài khoản trước khi thực hiện lại.')}</p>}
      <form onSubmit={submit}>
        <fieldset disabled={status !== 'ready'}>
          <label htmlFor={`${id}-password`}>{en ? 'New password' : 'Mật khẩu mới'}</label>
          <input id={`${id}-password`} type="password" autoComplete="new-password" maxLength={72} value={password} onChange={event => setPassword(event.target.value)} aria-describedby={`${id}-policy`} required />
          <p id={`${id}-policy`} className="lv-password-setup__help">{en ? 'Use 8–72 characters, up to 72 bytes.' : 'Dùng 8–72 ký tự, tối đa 72 byte.'}</p>
          {password && errors.password && <p role="alert">{errors.password}</p>}
          <label htmlFor={`${id}-confirm`}>{en ? 'Confirm new password' : 'Nhập lại mật khẩu mới'}</label>
          <input id={`${id}-confirm`} type="password" autoComplete="new-password" maxLength={72} value={confirm} onChange={event => setConfirm(event.target.value)} required />
          {confirm && errors.confirmPassword && <p role="alert">{errors.confirmPassword}</p>}
          <p>{en ? 'Verify again with the Google account linked to this account.' : 'Xác thực lại bằng tài khoản Google đã liên kết với tài khoản này.'}</p>
          <GoogleSignInButton id={`${id}-google`} lang={lang} disabled={status !== 'ready'} onCredentialReceived={value => { setCredential(value.credential); setError(''); }} onError={value => setError(value.code)} />
          {credential && <p role="status">{en ? 'Google confirmation received.' : 'Đã nhận xác nhận từ Google.'}</p>}
        </fieldset>
        <div className="lv-password-setup__actions">
          <button type="button" disabled={status === 'saving'} onClick={() => onDone(null)}>{en ? 'Cancel' : 'Hủy'}</button>
          <button type="submit" disabled={status !== 'ready' || !credential || !!Object.keys(errors).length}>{status === 'saving' ? (en ? 'Saving…' : 'Đang lưu…') : (en ? 'Set password and continue' : 'Đặt mật khẩu và tiếp tục')}</button>
        </div>
      </form>
    </section>
  </div>;
}
