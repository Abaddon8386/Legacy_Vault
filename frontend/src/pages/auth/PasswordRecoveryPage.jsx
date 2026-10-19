import { useEffect, useRef, useState } from 'react';
import { validatePasswordFields } from '../../utils/registrationValidation.js';
import { recoveryErrorKey, validateRecoveryEmail } from '../../utils/passwordRecoveryValidation.js';
import { passwordRecoveryI18n } from './passwordRecoveryI18n.js';
import './LoginPage.css';
import './PasswordRecoveryPage.css';

// Component callbacks only. No HTTP endpoint, recovery credential format or provider is assumed.
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
  const errors = reset ? validatePasswordFields(values, lang) : validateRecoveryEmail(values.email, lang);
  useEffect(() => {
    headingRef.current?.focus();
    return () => requestRef.current?.abort();
  }, []);

  function change(field, value) {
    setValues(previous => ({ ...previous, [field]: value }));
    setErrorKey(null);
  }
  function navigate(event, path) {
    if (!onNavigate || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onNavigate(`${path}?lang=${lang}`);
  }
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
      await handler(reset ? { password: values.password } : { email: values.email.trim() }, { signal: controller.signal });
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
  return <main className="lv-password-recovery-page">
    <section className="lv-recovery-card" aria-labelledby="recovery-title">
      <div className="lv-recovery-topbar">
        <a className="lv-recovery-brand" href="/">LegacyVault</a>
        <div role="group" aria-label={t.language} className="lv-recovery-languages">
          {['vi', 'en'].map(value => <button key={value} type="button" aria-pressed={lang === value} onClick={() => setLang(value)}>{value.toUpperCase()}</button>)}
        </div>
      </div>
      <h1 id="recovery-title" ref={headingRef} tabIndex={-1}>{reset ? t.resetTitle : t.requestTitle}</h1>
      <p className="lv-recovery-description">{reset ? t.resetDescription : t.requestDescription}</p>
      {!available && <p className="lv-recovery-notice" role="note">{reset ? t.verificationRequired : t.unavailable}</p>}
      {status === 'success' ? <p className="lv-recovery-success" role="status">{reset ? t.completed : t.accepted}</p> :
        <form className="hn-login-form" onSubmit={submit} noValidate aria-busy={busy}>
          {fields.map(field => <div className="hn-login-field-group" key={field}>
            <label className="hn-login-label" htmlFor={`recovery-${field}`}>{t[field]}</label>
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
      <a className="lv-recovery-link" href={`/login?lang=${lang}`} onClick={event => navigate(event, '/login')}>← {t.back}</a>
    </section>
  </main>;
}

export default function PasswordRecoveryPage({ mode = 'request', ...props }) {
  return <RecoveryForm key={mode} mode={mode} {...props} />;
}
