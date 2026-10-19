import { useState, useRef, useEffect } from 'react';
import { validateLogin } from '../../utils/loginValidation.js';
import { authenticateUser, authenticateWithGoogle, getAuthMessage } from '../../utils/loginService.js';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton.jsx';
import './LoginPage.css';

const i18nContent = {
  vi: {
    brandName: 'LegacyVault',
    brandTag: 'Hệ thống Quản lý Di sản Số',
    editorialEyebrow: 'BẢO TỒN & TRAO GỬI DI SẢN',
    editorialHeading: 'Chào mừng bạn trở lại\nvới LegacyVault.',
    editorialDesc:
      'Không gian số an tâm, nơi bạn tiếp tục sắp xếp tài sản cá nhân, lưu giữ ký ức gia đình và quản lý kế hoạch di sản.',
    pillar1: 'Không gian số an tâm · Hệ thống hóa và bảo toàn nguyên vẹn di sản gia đình.',
    pillar2: 'Quyền kiểm soát chủ động · Không gian bảo mật riêng tư cho chủ sở hữu di sản.',
    pillar3: 'Đồng hành bền vững · Lưu giữ ký ức và thông điệp gửi gắm thế hệ tương lai.',
    copyright: '© 2026 LegacyVault · Sanctuary of Generations',

    formBadge: 'ĐĂNG NHẬP',
    title: 'Đăng nhập tài khoản',
    subtitle: 'Nhập thông tin xác thực để truy cập không gian di sản của bạn.',

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
  },
  en: {
    brandName: 'LegacyVault',
    brandTag: 'Digital Heritage Sanctuary',
    editorialEyebrow: 'PRESERVE & PASS ON HERITAGE',
    editorialHeading: 'Welcome back to\nLegacyVault.',
    editorialDesc:
      'A secure, serene digital sanctuary where you continue organizing personal assets, preserving family memories, and managing your legacy.',
    pillar1: 'Digital Heritage Protection · Systematically safeguarding family legacy records.',
    pillar2: 'Autonomous Control · Dedicated private space for digital heritage owners.',
    pillar3: 'Enduring Companion · Preserving memories and messages for future generations.',
    copyright: '© 2026 LegacyVault · Sanctuary of Generations',

    formBadge: 'SIGN IN',
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
  },
};


const initialForm = {
  email: '',
  password: '',
};

export default function LoginPage({ onNavigateToRegister, onAuthenticated }) {
  const [lang, setLang] = useState('vi');
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
    if (pendingRef.current) return;
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
    <div className="hn-login-page">
      {/* ==================================================================
          LEFT REGION: Editorial Brand Story & Calm Organic Art
          Noble deep forest sanctuary backdrop + subtle gold filament curves
          ================================================================== */}
      <section className="hn-login-editorial-region" aria-label="Brand Sanctuary Story">
        <div className="hn-login-editorial-wrapper">
          {/* Top Brand Header (Entrance 1) */}
          <header className="hn-login-brand-header hn-login-entrance-1">
            <div className="hn-login-brand-lockup">
              <div className="hn-login-brand-crest" aria-hidden="true">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M12 2L4 6.5V12C4 17 7.5 20.8 12 22C16.5 20.8 20 17 20 12V6.5L12 2Z"
                    stroke="#c5a059"
                    strokeWidth="1.8"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                  <circle cx="12" cy="11" r="2" fill="#c5a059" />
                  <path d="M12 13V16" stroke="#c5a059" strokeWidth="1.8" strokeLinecap="round" />
                </svg>
              </div>
              <div className="hn-login-brand-titles">
                <span className="hn-login-brand-name">{t.brandName}</span>
                <span className="hn-login-brand-tag">{t.brandTag}</span>
              </div>
            </div>
          </header>

          {/* Main Story Body */}
          <div className="hn-login-story-body">
            {/* Eyebrow Pill (Entrance 2) */}
            <div className="hn-login-eyebrow-pill hn-login-entrance-2">{t.editorialEyebrow}</div>

            {/* Heading & Description (Entrance 3) */}
            <h1 className="hn-login-heading hn-login-entrance-3">{t.editorialHeading}</h1>
            <p className="hn-login-description hn-login-entrance-3">{t.editorialDesc}</p>

            {/* Calm Organic Visual: Living Heritage Wave swells matching PS-1 (Entrance 4) */}
            <div className="hn-login-calm-artwork hn-login-entrance-4" aria-hidden="true">
              <svg
                viewBox="0 0 460 220"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
                className="hn-login-calm-svg"
              >
                <defs>
                  <linearGradient id="hnLgSoftGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1a4c3e" stopOpacity="0.88" />
                    <stop offset="50%" stopColor="#245d4d" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#10362b" stopOpacity="0.96" />
                  </linearGradient>
                  <linearGradient id="hnLgCeladon" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#82b5a5" stopOpacity="0.45" />
                    <stop offset="50%" stopColor="#c5e0d6" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#9ccbc0" stopOpacity="0.25" />
                  </linearGradient>
                  <linearGradient id="hnLgGoldLine" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(197, 160, 89, 0.4)" />
                    <stop offset="50%" stopColor="rgba(235, 205, 140, 1)" />
                    <stop offset="100%" stopColor="rgba(197, 160, 89, 0.5)" />
                  </linearGradient>
                </defs>

                {/* Back Wave Layer & Primary Gold Contour (Grouped for swell motion) */}
                <g className="hn-wave-group hn-wave-group-back">
                  <path
                    className="hn-wave-back"
                    d="M -120 160 C -30 110, 60 180, 160 130 C 250 90, 340 170, 440 120 C 500 95, 540 140, 580 115 L 580 240 L -120 240 Z"
                    fill="url(#hnLgSoftGreen)"
                  />
                  <path
                    className="hn-gold-main"
                    d="M -120 160 C -30 110, 60 180, 160 130 C 250 90, 340 170, 440 120 C 500 95, 540 140, 580 115"
                    fill="none"
                    stroke="url(#hnLgGoldLine)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </g>

                {/* Front Wave Layer & Secondary Gold Accent (Grouped for counter-movement) */}
                <g className="hn-wave-group hn-wave-group-front">
                  <path
                    className="hn-wave-front"
                    d="M -120 180 C -40 130, 50 195, 140 145 C 230 100, 310 185, 410 135 C 470 105, 530 160, 580 130 L 580 240 L -120 240 Z"
                    fill="url(#hnLgCeladon)"
                  />
                  <path
                    className="hn-gold-sub"
                    d="M -100 195 C -10 150, 70 205, 160 160 C 245 125, 335 195, 425 150 C 490 120, 540 170, 580 145"
                    fill="none"
                    stroke="rgba(217, 185, 120, 0.65)"
                    strokeWidth="1.2"
                    strokeLinecap="round"
                  />
                </g>
              </svg>
            </div>

            {/* Calm Pillars of Trust (Entrance 4) */}
            <div className="hn-login-pillars hn-login-entrance-4">
              <div className="hn-login-pillar-item">
                <span className="hn-pillar-bullet" aria-hidden="true">✦</span>
                <span className="hn-pillar-text">{t.pillar1}</span>
              </div>
              <div className="hn-login-pillar-item">
                <span className="hn-pillar-bullet" aria-hidden="true">✦</span>
                <span className="hn-pillar-text">{t.pillar2}</span>
              </div>
              <div className="hn-login-pillar-item">
                <span className="hn-pillar-bullet" aria-hidden="true">✦</span>
                <span className="hn-pillar-text">{t.pillar3}</span>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <footer className="hn-login-editorial-footer">
            <span>{t.copyright}</span>
          </footer>
        </div>
      </section>

      {/* ==================================================================
          RIGHT REGION: Pure Warm-Ivory Login Form Area
          Editorial typography, generous spacing, sand-gold CTA button
          ================================================================== */}
      <main className="hn-login-form-region" aria-label="Login Form">
        <div className="hn-login-form-container">
          {/* Top Form Header with Language Toggle (Entrance 1) */}
          <div className="hn-login-form-topbar hn-login-entrance-1">
            <span className="hn-login-form-badge">{t.formBadge}</span>
            <div className="hn-login-lang-toggle" role="radiogroup" aria-label="Language selection">
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
          <h2 className="hn-login-form-title hn-login-entrance-2">{t.title}</h2>
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
              disabled={status === 'submitting'}
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