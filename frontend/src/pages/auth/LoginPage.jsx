import { useState, useRef, useEffect } from 'react';
import { validateLogin } from '../../utils/loginValidation.js';
import { authenticateUser, authenticateWithGoogle, getAuthMessage } from '../../utils/loginService.js';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton.jsx';
import AuthBrand from './AuthBrand.jsx';
import InvitationEntry from '../../components/invitations/InvitationEntry.jsx';
import './LoginPage.css';

const i18nContent = {
  vi: {
    title: 'Đăng nhập tài khoản',
    subtitle: 'Chào mừng bạn trở lại với không gian di sản của mình.',

    emailLabel: 'Địa chỉ Email',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Mật khẩu',
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
    submitButton: 'Đăng nhập',
    submittingButton: 'Đang đăng nhập…',
    orDivider: 'Hoặc',
    googleSigningIn: 'Đang xác thực tài khoản Google…',
    signupPrompt: 'Chưa có tài khoản?',
    signupAction: 'Khởi tạo tài khoản cá nhân',
    forgotPassword: 'Quên mật khẩu?',
  },
  en: {
    title: 'Sign in to your account',
    subtitle: 'Enter your credentials to access your heritage sanctuary.',

    emailLabel: 'Email Address',
    emailPlaceholder: 'you@example.com',
    passwordLabel: 'Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    submitButton: 'Sign in',
    submittingButton: 'Signing in…',
    orDivider: 'or',
    googleSigningIn: 'Authenticating with Google…',
    signupPrompt: "Don't have an account?",
    signupAction: 'Create personal account',
    forgotPassword: 'Forgot password?',
  },
};


const initialForm = {
  email: '',
  password: '',
};

export default function LoginPage({ onNavigateToForgotPassword, onNavigateToRegister, onAuthenticated, onNavigateToInvitations, invitationMode = false, onCancelInvitation }) {
  const [lang, setLang] = useState(() => typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('lang') === 'en' ? 'en' : 'vi');
  const [values, setValues] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('idle'); // idle | submitting | success | failure
  const [statusMessage, setStatusMessage] = useState('');
  const [lastStatusCode, setLastStatusCode] = useState(null);
  const t = i18nContent[lang];
  const pendingRef = useRef(false);
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);

  const handleLanguageChange = (newLang) => {
    if (newLang === lang) return;
    setLang(newLang);

    // 1. Cập nhật mọi validation errors đang hiển thị theo ngôn ngữ mới (không xóa dữ liệu nhập)
    if (Object.keys(errors).length > 0) {
      const freshValidation = validateLogin(values, newLang);
      const nextErrors = {};
      for (const field of Object.keys(errors)) {
        if (freshValidation[field]) {
          nextErrors[field] = freshValidation[field];
        }
      }
      setErrors(nextErrors);
    }

    // 2. Cập nhật thông báo phản hồi (status message) nếu đang hiển thị
    if (lastStatusCode) {
      setStatusMessage(getAuthMessage(lastStatusCode, newLang));
    }
  };

  const handleInputChange = (field, value) => {
    setValues((prev) => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (pendingRef.current) return;

    const validationErrors = validateLogin(values, lang);
    setErrors(validationErrors);

    if (Object.keys(validationErrors).length > 0) {
      setStatus('idle');
      return;
    }

    pendingRef.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setStatus('submitting');
    setStatusMessage('');
    setLastStatusCode(null);

    try {
      const response = await authenticateUser(values, {

        signal: controller.signal,
        isDevPreview: false,
        lang,
      });

      if (controller.signal.aborted) return;
      await onAuthenticated?.(response, { signal: controller.signal, lang });
      if (controller.signal.aborted) return;
      setValues(initialForm);
      setStatus('success');
      setLastStatusCode(response.code || 'SUCCESS');
      setStatusMessage(response.message);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('failure');
      const errCode = err?.code || 'NETWORK_ERROR';
      setLastStatusCode(errCode);
      setStatusMessage(
        getAuthMessage(errCode, lang)
      );
    } finally {
      pendingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const handleGoogleCredential = async (credentialResponse) => {
    if (pendingRef.current || invitationMode) return;
    pendingRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('submitting');
    setStatusMessage('');
    setLastStatusCode(null);

    try {
      const response = await authenticateWithGoogle(
        { credential: credentialResponse?.credential },
        { signal: controller.signal, lang }
      );
      if (controller.signal.aborted) return;
      await onAuthenticated?.(response, { signal: controller.signal, lang });
      if (controller.signal.aborted) return;
      setValues(initialForm);
      setStatus('success');
      setLastStatusCode(response.code || 'SUCCESS');
      setStatusMessage(response.message);
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('failure');
      const errCode = err?.code || 'GOOGLE_SIGNIN_UNAVAILABLE';
      setLastStatusCode(errCode);
      setStatusMessage(err.message || getAuthMessage(errCode, lang));
    } finally {
      pendingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const handleGoogleError = (err) => {
    if (status === 'submitting') return;
    // The Google button already displays connection errors beside its fallback.
    if (err?.code === 'GOOGLE_SCRIPT_LOAD_ERROR') return;
    setStatus('failure');
    const errCode = err?.code || 'GOOGLE_SCRIPT_LOAD_ERROR';
    setLastStatusCode(errCode);
    setStatusMessage(err.message || getAuthMessage(errCode, lang));
  };

  const handleRegisterClick = (e) => {
    e.preventDefault();
    if (typeof onNavigateToRegister === 'function') {
      onNavigateToRegister();
    } else {
      window.history.pushState({}, '', '/register');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <div className="hn-login-page lv-auth-page">
      <a className="hn-login-back-home lv-auth-back-home" href="/">{lang === 'en' ? '← Back to home' : '← Về trang chủ'}</a>
      <main className="hn-login-form-region lv-auth-card" aria-label="Login Form">
        <div className="hn-login-form-container lv-auth-content">
          {/* Top Form Header with Language Toggle (Entrance 1) */}
          <div className="hn-login-form-topbar lv-auth-topbar">

            <div className="hn-login-lang-toggle lv-auth-languages" role="radiogroup" aria-label="Language selection">
              <button
                type="button"
                className={`hn-login-lang-btn ${lang === 'vi' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('vi')}
                role="radio"
                aria-checked={lang === 'vi'}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                className={`hn-login-lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
                role="radio"
                aria-checked={lang === 'en'}
              >
                English
              </button>
            </div>
          </div>

          {/* Form Title & Subtitle (Entrance 2) */}
          <AuthBrand />
          <h1 className="hn-login-form-title hn-login-entrance-2">{t.title}</h1>
          <p className="hn-login-form-sub hn-login-entrance-2">{t.subtitle}</p>

          <form onSubmit={handleSubmit} noValidate className="hn-login-form hn-login-entrance-3">
            {/* Field 1: Email Address */}
            <div className="hn-login-field-group">
              <label className="hn-login-label" htmlFor="hn-login-email">
                <span>
                  {t.emailLabel} <span className="hn-login-req">*</span>
                </span>
              </label>
              <input
                id="hn-login-email"
                type="email"
                className={`hn-login-input ${errors.email ? 'has-error' : ''}`}
                placeholder={t.emailPlaceholder}
                value={values.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'hn-login-email-error' : undefined}
                required
              />
              {errors.email && (
                <span id="hn-login-email-error" className="hn-login-error-msg" role="alert">
                  {errors.email}
                </span>
              )}
            </div>

            {/* Field 2: Password with Toggle Visibility */}
            <div className="hn-login-field-group">
              <label className="hn-login-label" htmlFor="hn-login-password">
                <span>
                  {t.passwordLabel} <span className="hn-login-req">*</span>
                </span>
              </label>
              <div className="hn-login-input-wrap">
                <input
                  id="hn-login-password"
                  type={showPassword ? 'text' : 'password'}
                  className={`hn-login-input ${errors.password ? 'has-error' : ''}`}
                  placeholder="••••••••"
                  value={values.password}
                  onChange={(e) => handleInputChange('password', e.target.value)}
                  autoComplete="current-password"
                  aria-invalid={Boolean(errors.password)}
                  aria-describedby={errors.password ? 'hn-login-password-error' : undefined}
                  required
                />
                <button
                  type="button"
                  className="hn-login-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  aria-label={showPassword ? t.hidePassword : t.showPassword}
                  title={showPassword ? t.hidePassword : t.showPassword}
                >
                  {showPassword ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
              {errors.password && (
                <span id="hn-login-password-error" className="hn-login-error-msg" role="alert">
                  {errors.password}
                </span>
              )}
            </div>

            <a className="hn-login-forgot-password" href={`/forgot-password?lang=${lang}`} onClick={event => {
              if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || !onNavigateToForgotPassword) return;
              event.preventDefault();
              onNavigateToForgotPassword(`/forgot-password?lang=${lang}`);
            }}>{t.forgotPassword}</a>
            {/* Sand Gold Primary Action CTA */}
            <button
              type="submit"
              className="hn-login-cta-btn"
              disabled={status === 'submitting'}
            >
              <span>{status === 'submitting' ? t.submittingButton : t.submitButton}</span>
              <span className="hn-login-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {/* Divider: Hoặc / or */}
          <div className="hn-login-divider hn-login-entrance-3" role="separator" aria-label={t.orDivider}>
            <span>{t.orDivider}</span>
          </div>

          {/* Google Sign-in Section */}
          <div className="hn-login-google-section hn-login-entrance-3">
            <GoogleSignInButton
              id="hn-login-google-btn"
              disabled={status === 'submitting' || invitationMode}
              lang={lang}
              text="continue_with"
              onCredentialReceived={handleGoogleCredential}
              onError={handleGoogleError}
            />
          </div>


          {/* Status Alert Box */}
          {status !== 'idle' && status !== 'submitting' && (
            <div className={`hn-login-status-box ${status}`} role="status">
              <div className="hn-login-status-icon" aria-hidden="true">
                {status === 'success' ? '✓' : '!'}
              </div>
              <div className="hn-login-status-text">{statusMessage}</div>
            </div>
          )}

          {/* Footer Info & Sign-up Link (Customer-facing, no RBAC note) */}
          <InvitationEntry lang={lang} onNavigate={onNavigateToInvitations} invitationMode={invitationMode} onCancel={onCancelInvitation} disabled={status === 'submitting'} />
          <footer className="hn-login-form-footer hn-login-entrance-4">
            <div className="hn-login-signin-prompt">
              {t.signupPrompt}{' '}
              <a href="/register" onClick={handleRegisterClick}>
                {t.signupAction}
              </a>
            </div>
          </footer>
        </div>
      </main>
    </div>
  );
}
