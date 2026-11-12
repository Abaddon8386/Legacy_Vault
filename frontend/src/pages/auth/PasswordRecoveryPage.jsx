import { useEffect, useRef, useState } from 'react';
import { recoveryErrorKey, validateRecoveryEmail, validateRecoveryPassword } from '../../utils/passwordRecoveryValidation.js';
import { passwordRecoveryI18n } from './passwordRecoveryI18n.js';
import './LoginPage.css';
import './PasswordRecoveryPage.css';
import AuthBrand from './AuthBrand.jsx';

/**
 * Form quên mật khẩu (nhập email) hoặc đặt lại mật khẩu (mật khẩu mới + xác nhận) tùy `mode`.
 * Không tự gọi HTTP: dùng `onRequestRecovery`/`onResetPassword` do `PasswordRecoveryRoute` cung cấp. Validate bằng
 * `validateRecoveryEmail`/`validateRecoveryPassword`; lỗi API được ánh xạ qua `recoveryErrorKey`; nếu mã khôi phục không hợp lệ
 * form bị khóa và gợi ý yêu cầu lại. Request bị hủy khi gỡ component; chặn gửi trùng bằng `pending`.
 *
 * @param {object} props
 * @param {'request'|'reset'} props.mode Chế độ.
 * @param {'vi'|'en'} [props.initialLang='vi'] Ngôn ngữ ban đầu.
 * @param {Function} [props.onRequestRecovery] `({email}, {signal, lang}) => Promise`.
 * @param {Function} [props.onResetPassword] `({password}, {signal, lang}) => Promise`.
 * @param {Function} [props.onNavigate] Điều hướng nội bộ (đăng nhập, yêu cầu lại).
 */
// HTTP and credential handling belong to PasswordRecoveryRoute.
function RecoveryForm({ mode, initialLang = 'vi', onRequestRecovery, onResetPassword, onNavigate }) {
  const [lang, setLang] = useState(initialLang === 'en' ? 'en' : 'vi');
  const [values, setValues] = useState({ email: '', password: '', confirmPassword: '' });
  const [attempted, setAttempted] = useState(false);
  const [status, setStatus] = useState('idle');
  const [errorKey, setErrorKey] = useState(null);
  const [recoveryInvalid, setRecoveryInvalid] = useState(false);
  const [showPasswords, setShowPasswords] = useState(false);
  const requestRef = useRef(null), pending = useRef(false), headingRef = useRef(null);
  const t = passwordRecoveryI18n[lang];
  const reset = mode === 'reset';
  const handler = reset ? onResetPassword : onRequestRecovery;
  const available = typeof handler === 'function';
  const busy = status === 'pending';
  const errors = reset ? validateRecoveryPassword(values, lang) : validateRecoveryEmail(values.email, lang);
  useEffect(() => {
    headingRef.current?.focus();
    return () => requestRef.current?.abort();
  }, []);

  /**
   * Cập nhật một trường form và xóa lỗi API hiện tại.
   */
  function change(field, value) {
    setValues(previous => ({ ...previous, [field]: value }));
    setErrorKey(null);
  }
  /**
   * Điều hướng nội bộ kèm `?lang=`; bỏ qua khi nhấn phím bổ trợ để trình duyệt mở tab mới như thường.
   */
  function navigate(event, path) {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(`${path}?lang=${lang}`);
  }
  /**
   * Submit form: validate (focus trường lỗi đầu), gọi handler của mode, hiển thị thành công hoặc ánh xạ lỗi sang khóa i18n.
   */
  async function submit(event) {
    event.preventDefault();
    if (pending.current) return;
    setAttempted(true);
    setErrorKey(null);
    if (Object.keys(errors).length) {
      document.getElementById(`recovery-${Object.keys(errors)[0]}`)?.focus();
      return;
    }
    if (!available || recoveryInvalid) return;
    pending.current = true;
    const controller = new AbortController(); requestRef.current = controller;
    setStatus('pending');
    try {
      await handler(reset ? { password: values.password } : { email: values.email.trim() }, { signal: controller.signal, lang });
      if (controller.signal.aborted) return;
      setValues({ email: '', password: '', confirmPassword: '' });
      setAttempted(false);
      setShowPasswords(false);
      setStatus('success');
    } catch (error) {
      if (controller.signal.aborted) return;
      const key = recoveryErrorKey(error);
      setErrorKey(key);
      if (reset && key === 'invalidRecovery') {
        setRecoveryInvalid(true);
        setValues(previous => ({ ...previous, password: '', confirmPassword: '' }));
        setAttempted(false);
      }
      setStatus('error');
    } finally {
      if (requestRef.current === controller) { pending.current = false; requestRef.current = null; }
    }
  }
  const fields = reset ? ['password', 'confirmPassword'] : ['email'];
  return <main className="lv-password-recovery-page lv-auth-page">
    <a className="lv-auth-back-home" href="/">{lang === 'en' ? '← Back to home' : '← Về trang chủ'}</a>
    <section className="lv-recovery-card lv-auth-card" aria-labelledby="recovery-title">
      <div className="lv-auth-topbar">
        <div role="group" aria-label={t.language} className="lv-recovery-languages lv-auth-languages">
          {['vi', 'en'].map(value => <button key={value} type="button" aria-pressed={lang === value} onClick={() => setLang(value)}>{value === 'vi' ? 'Tiếng Việt' : 'English'}</button>)}
        </div>
      </div>
      <AuthBrand />
      <h1 id="recovery-title" className="lv-auth-title" ref={headingRef} tabIndex={-1}>{reset ? t.resetTitle : t.requestTitle}</h1>
      <p className="lv-auth-description">{reset ? t.resetDescription : t.requestDescription}</p>
      {!available && <p className="lv-recovery-notice" role="note">{reset ? t.verificationRequired : t.unavailable}</p>}
      {status === 'success' ? <p className="lv-recovery-success" role="status">{reset ? t.completed : t.accepted}</p> :
        <form className="hn-login-form" onSubmit={submit} noValidate aria-busy={busy}>
          {fields.map(field => <div className="hn-login-field-group" key={field}>
            <label className="hn-login-label" htmlFor={`recovery-${field}`}>{t[field]}<span className="lv-required-mark" aria-hidden="true">*</span></label>
            <input id={`recovery-${field}`} className={`hn-login-input ${attempted && errors[field] ? 'has-error' : ''}`}
              type={field === 'email' ? 'email' : showPasswords ? 'text' : 'password'}
              autoComplete={field === 'email' ? 'email' : 'new-password'} required
              maxLength={field === 'email' ? 254 : 72} value={values[field]} disabled={busy}
              onChange={event => change(field, event.target.value)} aria-invalid={Boolean(attempted && errors[field])}
              aria-describedby={attempted && errors[field] ? `recovery-${field}-error` : reset ? 'recovery-password-hint' : undefined} />
            {attempted && errors[field] && <p id={`recovery-${field}-error`} className="hn-login-error-msg" role="alert">{errors[field]}</p>}
          </div>)}
          {reset && <>
            <p id="recovery-password-hint" className="lv-recovery-description">{t.passwordHint}</p>
            <button className="lv-recovery-text-button" type="button" aria-pressed={showPasswords} onClick={() => setShowPasswords(value => !value)} disabled={busy}>{showPasswords ? t.hidePassword : t.showPassword}</button>
          </>}
          {(errorKey || recoveryInvalid) && <p className="lv-recovery-notice" role="alert">{t[recoveryInvalid ? 'invalidRecovery' : errorKey]}</p>}
          {busy && <p role="status">{t.submitting}</p>}
          <button className="hn-login-cta-btn" type="submit" disabled={!available || busy || recoveryInvalid}>{busy ? t.submitting : reset ? t.resetSubmit : t.requestSubmit}</button>
        </form>}
      {reset && <a className="lv-recovery-link" href={`/forgot-password?lang=${lang}`} onClick={event => navigate(event, '/forgot-password')}>{t.requestAgain}</a>}
      <footer className="lv-auth-footer"><a className="lv-recovery-link" href={`/login?lang=${lang}`} onClick={event => navigate(event, '/login')}>← {t.back}</a></footer>
    </section>
  </main>;
}

/**
 * Màn quên/đặt lại mật khẩu. Bọc `RecoveryForm` với `key` theo mode để state được reset khi đổi chế độ.
 *
 * @param {object} props `mode` ('request' mặc định hoặc 'reset') và các props chuyển cho `RecoveryForm`.
 */
export default function PasswordRecoveryPage({ mode = 'request', ...props }) {
  return <RecoveryForm key={mode} mode={mode} {...props} />;
}
