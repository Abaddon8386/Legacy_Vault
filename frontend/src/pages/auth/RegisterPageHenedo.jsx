import { useState, useEffect, useRef } from 'react';
import { validateRegistration } from '../../utils/registrationValidation.js';
import './RegisterPageHenedo.css';
import { registerUser, getRegistrationMessage } from '../../utils/registrationService.js';
import { authenticateWithGoogle, authStatusMessages } from '../../utils/loginService.js';
import GoogleSignInButton from '../../components/auth/GoogleSignInButton.jsx';

const i18nContent = {
  vi: {
    brandName: 'LegacyVault',
    brandTag: 'Hệ thống Quản lý Di sản Số',
    editorialEyebrow: 'LƯU GIỮ HÔM NAY · TRAO GỬI MAI SAU',
    editorialHeading: 'Một nơi gìn giữ\nnhững điều quý giá nhất.',
    editorialDesc:
      'Không gian số thanh bình, nơi bạn chủ động sắp xếp tài sản, lưu giữ ký ức và chuẩn bị kế hoạch trao gửi trọn vẹn cho người thân yêu.',
    pillar1: 'Sắp xếp tập trung · Dễ dàng hệ thống hóa và quản lý danh mục tài sản số cá nhân.',
    pillar2: 'Chủ động chuyển giao · Tự quyết định người nhận và chuẩn bị lộ trình bàn giao theo ý nguyện.',
    pillar3: 'Gìn giữ trọn vẹn · Lưu giữ kỷ niệm và thông điệp ý nghĩa gửi gắm đến người thân yêu.',
    copyright: '© 2026 LegacyVault · Sanctuary of Generations',

    formBadge: 'KHỞI TẠO TÀI KHOẢN DI SẢN',
    title: 'Tạo tài khoản cá nhân',
    subtitle: 'Khởi tạo không gian số để sắp xếp tài sản cá nhân và chuẩn bị kế hoạch trao gửi di sản.',

    fullNameLabel: 'Họ và tên',
    fullNamePlaceholder: 'Ví dụ: Nguyễn Văn An',
    emailLabel: 'Địa chỉ Email',
    emailPlaceholder: 'nguyen.van.an@example.com',
    phoneLabel: 'Số điện thoại',
    phoneHint: 'Tùy chọn',
    phonePlaceholder: '0901234567',
    passwordLabel: 'Mật khẩu',
    passwordHint: 'Tối thiểu 8 ký tự',
    confirmPasswordLabel: 'Nhập lại mật khẩu',
    showPassword: 'Hiện mật khẩu',
    hidePassword: 'Ẩn mật khẩu',
    termsText: 'Tôi đồng ý với',
    termsLink: 'Điều khoản dịch vụ',
    andText: 'và',
    privacyLink: 'Chính sách bảo vệ dữ liệu di sản',
    submitButton: 'Tạo tài khoản',
    submittingButton: 'Đang khởi tạo tài khoản…',
    orDivider: 'Hoặc',
    signinPrompt: 'Đã có tài khoản?',
    signinAction: 'Đăng nhập',
    pendingNotice: 'Thông tin đăng ký đã được xác thực hợp lệ. Hệ thống đang tiến hành xử lý yêu cầu tạo tài khoản.',
    successNotice: 'Đăng ký thành công! Bạn có thể đăng nhập để bắt đầu thiết lập kho di sản.',
    failureNotice: 'Không thể đăng ký. Vui lòng kiểm tra lại thông tin.',

    termsModalTitle: 'Thông tin Điều khoản dịch vụ',
    termsModalContent:
      'Văn bản Điều khoản dịch vụ chính thức của LegacyVault hiện đang trong giai đoạn hoàn thiện pháp lý và sẽ được công bố đầy đủ khi hệ thống chính thức ra mắt. Tất cả các cam kết về quyền lợi và nghĩa vụ của người sử dụng sẽ tuân thủ nghiêm ngặt các quy định pháp luật hiện hành.',
    privacyModalTitle: 'Chính sách bảo vệ dữ liệu di sản',
    privacyModalContent:
      'Chính sách bảo vệ dữ liệu và quyền riêng tư chính thức của LegacyVault hiện đang được hoàn thiện cùng các quy chuẩn kỹ thuật. Khi đi vào hoạt động, mọi thông tin và dữ liệu di sản của bạn sẽ được bảo vệ cẩn trọng theo các tiêu chuẩn bảo mật dữ liệu cao nhất.',
    modalClose: 'Đã hiểu',
  },
  en: {
    brandName: 'LegacyVault',
    brandTag: 'Digital Heritage Sanctuary',
    editorialEyebrow: 'PRESERVE TODAY · PASS ON TOMORROW',
    editorialHeading: 'A peaceful sanctuary\nfor what matters most.',
    editorialDesc:
      'A serene digital haven where you can thoughtfully organize personal assets, cherish family memories, and prepare plans for loved ones.',
    pillar1: 'Centralized Organization · Easily structure and manage your personal digital assets in one place.',
    pillar2: 'Autonomous Transfer · Decide designated recipients and prepare transfer plans on your own terms.',
    pillar3: 'Preserve with Care · Safeguard meaningful memories and heartfelt messages for future generations.',
    copyright: '© 2026 LegacyVault · Sanctuary of Generations',

    formBadge: 'INITIALIZE PERSONAL SANCTUARY',
    title: 'Create personal account',
    subtitle: 'Set up your digital space to organize personal assets and prepare your legacy transfer plan.',

    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'e.g. Alexander Vance',
    emailLabel: 'Email Address',
    emailPlaceholder: 'alexander@example.com',
    phoneLabel: 'Phone Number',
    phoneHint: 'Optional',
    phonePlaceholder: '0901234567',
    passwordLabel: 'Password',
    passwordHint: 'At least 8 characters',
    confirmPasswordLabel: 'Confirm Password',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    termsText: 'I agree to the',
    termsLink: 'Terms of Service',
    andText: 'and',
    privacyLink: 'Heritage Privacy Policy',
    submitButton: 'Create account',
    submittingButton: 'Creating sanctuary…',
    orDivider: 'or',
    signinPrompt: 'Already have an account?',
    signinAction: 'Sign in',
    pendingNotice: 'Registration details validated. System is processing your account creation request.',
    successNotice: 'Registration successful! You may now sign in to begin organizing your vault.',
    failureNotice: 'Registration failed. Please check your inputs.',

    termsModalTitle: 'Terms of Service Notice',
    termsModalContent:
      'The formal LegacyVault Terms of Service are currently undergoing legal finalization and will be published upon the official public release. All user rights and obligations will adhere strictly to applicable laws and standards.',
    privacyModalTitle: 'Heritage Privacy Policy Notice',
    privacyModalContent:
      'The formal LegacyVault Data Privacy Policy is being finalized alongside technical security specifications. When live, your data and digital heritage assets will be safeguarded with strict confidentiality in compliance with data protection regulations.',
    modalClose: 'Understood',
  },
};

const initialForm = {
  fullName: '',
  email: '',
  phone: '',
  password: '',
  confirmPassword: '',
  agreeTerms: false,
};

export default function RegisterPageHenedo({ onNavigateToLogin, onAuthenticated }) {
  const [lang, setLang] = useState('vi');
  const [values, setValues] = useState(initialForm);
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [status, setStatus] = useState('idle');
  const [statusCode, setStatusCode] = useState('');
  const statusMessage = authStatusMessages[lang]?.[statusCode] || getRegistrationMessage(statusCode, lang);
  const pendingRef = useRef(false);
  const controllerRef = useRef(null);
  useEffect(() => () => controllerRef.current?.abort(), []);
  const [policyModal, setPolicyModal] = useState(null);

  const t = i18nContent[lang];

  const handleGoogleCredential = async (credentialResponse) => {
    if (pendingRef.current) return;
    pendingRef.current = true;
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setStatus('submitting');
    setStatusCode('');

    try {
      const response = await authenticateWithGoogle(
        { credential: credentialResponse?.credential },
        { signal: controller.signal, lang }
      );
      if (controller.signal.aborted) return;
      if (typeof onAuthenticated === 'function') {
        await onAuthenticated(response, { signal: controller.signal, lang });
      } else {
        setStatus('success');
        setStatusCode('SUCCESS');
        setTimeout(() => navigateToLogin(), 1000);
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      setStatus('failure');
      setStatusCode(err?.code || 'GOOGLE_SIGNIN_UNAVAILABLE');
    } finally {
      pendingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  const handleGoogleError = (err) => {
    if (status === 'submitting') return;
    setStatus('failure');
    setStatusCode(err?.code || 'GOOGLE_SCRIPT_LOAD_ERROR');
  };


  useEffect(() => {
    if (!policyModal) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setPolicyModal(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [policyModal]);

  const navigateToLogin = () => {
    if (typeof onNavigateToLogin === 'function') {
      onNavigateToLogin();
    } else {
      window.history.pushState({}, '', '/login');
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  const handleLoginClick = (e) => {
    e.preventDefault();
    navigateToLogin();
  };

  const handleLanguageChange = (nextLang) => {
    setLang(nextLang);
    const translatedErrors = validateRegistration(values, nextLang);
    setErrors((previous) => Object.fromEntries(
      Object.keys(previous)
        .filter((field) => translatedErrors[field])
        .map((field) => [field, translatedErrors[field]])
    ));
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
    const validationErrors = validateRegistration(values, lang);
    setErrors(validationErrors);
    if (Object.keys(validationErrors).length) { setStatus('idle'); return; }
    pendingRef.current = true;
    const controller = new AbortController(); controllerRef.current = controller;
    setStatus('submitting'); setStatusCode('');
    try {
      await registerUser(values, { lang, signal: controller.signal });
      if (controller.signal.aborted) return;
      setValues(initialForm); setStatus('success'); setStatusCode('SUCCESS');
      navigateToLogin();
    } catch (error) {
      if (controller.signal.aborted) return;
      setStatus('failure'); setStatusCode(error.code || 'INTERNAL_ERROR');
    } finally {
      pendingRef.current = false;
      if (controllerRef.current === controller) controllerRef.current = null;
    }
  };

  return (
    <div className="henedo-page">
      {/* ==================================================================
          LEFT REGION: Editorial Sanctuary Story & Calm Organic Art
          Warm deep forest sanctuary backdrop + soft botanical curves
          ================================================================== */}
      <section className="henedo-editorial-region" aria-label="Brand Sanctuary Story">
        <div className="editorial-content-wrapper">
          {/* Top Brand Header (Entrance 1) */}
          <header className="henedo-brand-header henedo-entrance-1">
            <div className="henedo-brand-lockup">
              <div className="henedo-brand-crest" aria-hidden="true">
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
              <div className="henedo-brand-titles">
                <span className="henedo-brand-name">{t.brandName}</span>
                <span className="henedo-brand-tag">{t.brandTag}</span>
              </div>
            </div>
          </header>

          {/* Main Story Body */}
          <div className="editorial-story-body">
            {/* Eyebrow Pill (Entrance 2) */}
            <div className="henedo-eyebrow-pill henedo-entrance-2">{t.editorialEyebrow}</div>

            {/* Heading & Description (Entrance 3) */}
            <h1 className="editorial-heading henedo-entrance-3">{t.editorialHeading}</h1>
            <p className="editorial-description henedo-entrance-3">{t.editorialDesc}</p>

            {/* Calm Organic Visual: Noticeable Living Heritage Wave swells (Entrance 4) */}
            <div className="henedo-calm-artwork henedo-entrance-4" aria-hidden="true">
              <svg
                viewBox="0 0 460 220"
                preserveAspectRatio="none"
                xmlns="http://www.w3.org/2000/svg"
                className="calm-svg"
              >
                <defs>
                  <linearGradient id="hnSoftGreen" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#1a4c3e" stopOpacity="0.88" />
                    <stop offset="50%" stopColor="#245d4d" stopOpacity="0.65" />
                    <stop offset="100%" stopColor="#10362b" stopOpacity="0.96" />
                  </linearGradient>
                  <linearGradient id="hnCeladon" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="#82b5a5" stopOpacity="0.45" />
                    <stop offset="50%" stopColor="#c5e0d6" stopOpacity="0.55" />
                    <stop offset="100%" stopColor="#9ccbc0" stopOpacity="0.25" />
                  </linearGradient>
                  <linearGradient id="hnGoldLine" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="rgba(197, 160, 89, 0.4)" />
                    <stop offset="50%" stopColor="rgba(235, 205, 140, 1)" />
                    <stop offset="100%" stopColor="rgba(197, 160, 89, 0.5)" />
                  </linearGradient>
                </defs>

                {/* Back Wave Layer & Primary Gold Contour (Grouped for perfect alignment) */}
                <g className="hn-wave-group hn-wave-group-back">
                  <path
                    className="hn-wave-back"
                    d="M -120 160 C -30 110, 60 180, 160 130 C 250 90, 340 170, 440 120 C 500 95, 540 140, 580 115 L 580 240 L -120 240 Z"
                    fill="url(#hnSoftGreen)"
                  />
                  <path
                    className="hn-gold-main"
                    d="M -120 160 C -30 110, 60 180, 160 130 C 250 90, 340 170, 440 120 C 500 95, 540 140, 580 115"
                    fill="none"
                    stroke="url(#hnGoldLine)"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                </g>

                {/* Front Wave Layer & Secondary Gold Accent (Grouped for counter-movement) */}
                <g className="hn-wave-group hn-wave-group-front">
                  <path
                    className="hn-wave-front"
                    d="M -120 180 C -40 130, 50 195, 140 145 C 230 100, 310 185, 410 135 C 470 105, 530 160, 580 130 L 580 240 L -120 240 Z"
                    fill="url(#hnCeladon)"
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
            <div className="henedo-pillars henedo-entrance-4">
              <div className="henedo-pillar-item">
                <span className="pillar-leaf-bullet" aria-hidden="true">◆</span>
                <span className="pillar-text">{t.pillar1}</span>
              </div>
              <div className="henedo-pillar-item">
                <span className="pillar-leaf-bullet" aria-hidden="true">◆</span>
                <span className="pillar-text">{t.pillar2}</span>
              </div>
              <div className="henedo-pillar-item">
                <span className="pillar-leaf-bullet" aria-hidden="true">◆</span>
                <span className="pillar-text">{t.pillar3}</span>
              </div>
            </div>
          </div>

          {/* Bottom Copyright */}
          <footer className="editorial-footer">
            <span>{t.copyright}</span>
          </footer>
        </div>
      </section>

      {/* ==================================================================
          RIGHT REGION: Pure Warm-Ivory Registration Form
          Editorial typography, generous breathing room, sand-gold CTA
          ================================================================== */}
      <main className="henedo-form-region" aria-label="Registration Form">
        {/* Form Container (Entrance 5) */}
        <div className="henedo-form-container henedo-entrance-5">
          {/* Top Form Header with Language Toggle */}
          <div className="henedo-form-topbar">
            <span className="henedo-form-badge">{t.formBadge}</span>
            <div className="henedo-lang-toggle" role="radiogroup" aria-label="Language selection">
              <button
                type="button"
                className={`hn-lang-btn ${lang === 'vi' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('vi')}
                role="radio"
                aria-checked={lang === 'vi'}
              >
                Tiếng Việt
              </button>
              <button
                type="button"
                className={`hn-lang-btn ${lang === 'en' ? 'active' : ''}`}
                onClick={() => handleLanguageChange('en')}
                role="radio"
                aria-checked={lang === 'en'}
              >
                English
              </button>
            </div>
          </div>

          <h2 className="henedo-form-title">{t.title}</h2>
          <p className="henedo-form-sub">{t.subtitle}</p>

          <form onSubmit={handleSubmit} noValidate className="henedo-form">
            {/* Row 1: Full Name & Phone Number */}
            <div className="henedo-field-row">
              <div className="henedo-field-group">
                <label className="henedo-label" htmlFor="hn-fullName">
                  {t.fullNameLabel} <span className="hn-req">*</span>
                </label>
                <input
                  id="hn-fullName"
                  type="text"
                  className={`henedo-input ${errors.fullName ? 'has-error' : ''}`}
                  placeholder={t.fullNamePlaceholder}
                  value={values.fullName}
                  onChange={(e) => handleInputChange('fullName', e.target.value)}
                  autoComplete="name"
                  aria-invalid={Boolean(errors.fullName)}
                  aria-describedby={errors.fullName ? 'hn-fullName-error' : undefined}
                  required
                />
                {errors.fullName && (
                  <span id="hn-fullName-error" className="henedo-error-msg" role="alert">
                    {errors.fullName}
                  </span>
                )}
              </div>

              <div className="henedo-field-group">
                <label className="henedo-label" htmlFor="hn-phone">
                  <span>{t.phoneLabel}</span>
                  <span className="hn-hint">({t.phoneHint})</span>
                </label>
                <input
                  id="hn-phone"
                  type="tel"
                  className={`henedo-input ${errors.phone ? 'has-error' : ''}`}
                  placeholder={t.phonePlaceholder}
                  value={values.phone}
                  onChange={(e) => handleInputChange('phone', e.target.value)}
                  autoComplete="tel"
                  aria-invalid={Boolean(errors.phone)}
                  aria-describedby={errors.phone ? 'hn-phone-error' : undefined}
                />
                {errors.phone && (
                  <span id="hn-phone-error" className="henedo-error-msg" role="alert">
                    {errors.phone}
                  </span>
                )}
              </div>
            </div>

            {/* Row 2: Email Address */}
            <div className="henedo-field-group">
              <label className="henedo-label" htmlFor="hn-email">
                {t.emailLabel} <span className="hn-req">*</span>
              </label>
              <input
                id="hn-email"
                type="email"
                className={`henedo-input ${errors.email ? 'has-error' : ''}`}
                placeholder={t.emailPlaceholder}
                value={values.email}
                onChange={(e) => handleInputChange('email', e.target.value)}
                autoComplete="email"
                aria-invalid={Boolean(errors.email)}
                aria-describedby={errors.email ? 'hn-email-error' : undefined}
                required
              />
              {errors.email && (
                <span id="hn-email-error" className="henedo-error-msg" role="alert">
                  {errors.email}
                </span>
              )}
            </div>

            {/* Row 3: Passwords in 2 columns */}
            <div className="henedo-field-row">
              <div className="henedo-field-group">
                <label className="henedo-label" htmlFor="hn-password">
                  <span>
                    {t.passwordLabel} <span className="hn-req">*</span>
                  </span>
                  <span className="hn-hint">({t.passwordHint})</span>
                </label>
                <div className="henedo-input-wrap">
                  <input
                    id="hn-password"
                    type={showPassword ? 'text' : 'password'}
                    className={`henedo-input ${errors.password ? 'has-error' : ''}`}
                    placeholder="••••••••"
                    value={values.password}
                    onChange={(e) => handleInputChange('password', e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.password)}
                    aria-describedby={errors.password ? 'hn-password-error' : undefined}
                    required
                  />
                  <button
                    type="button"
                    className="henedo-eye-btn"
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
                  <span id="hn-password-error" className="henedo-error-msg" role="alert">
                    {errors.password}
                  </span>
                )}
              </div>

              <div className="henedo-field-group">
                <label className="henedo-label" htmlFor="hn-confirmPassword">
                  {t.confirmPasswordLabel} <span className="hn-req">*</span>
                </label>
                <div className="henedo-input-wrap">
                  <input
                    id="hn-confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    className={`henedo-input ${errors.confirmPassword ? 'has-error' : ''}`}
                    placeholder="••••••••"
                    value={values.confirmPassword}
                    onChange={(e) => handleInputChange('confirmPassword', e.target.value)}
                    autoComplete="new-password"
                    aria-invalid={Boolean(errors.confirmPassword)}
                    aria-describedby={errors.confirmPassword ? 'hn-confirmPassword-error' : undefined}
                    required
                  />
                </div>
                {errors.confirmPassword && (
                  <span id="hn-confirmPassword-error" className="henedo-error-msg" role="alert">
                    {errors.confirmPassword}
                  </span>
                )}
              </div>
            </div>

            {/* Terms Checkbox */}
            <div className="henedo-checkbox-wrap">
              <label className="henedo-checkbox-label" htmlFor="hn-agreeTerms">
                <input
                  id="hn-agreeTerms"
                  type="checkbox"
                  className="henedo-checkbox-native"
                  checked={values.agreeTerms}
                  onChange={(e) => handleInputChange('agreeTerms', e.target.checked)}
                  aria-invalid={Boolean(errors.agreeTerms)}
                  aria-describedby={errors.agreeTerms ? 'hn-terms-error' : undefined}
                />
                <span className="henedo-checkbox-custom" aria-hidden="true">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </span>
                <span className="henedo-checkbox-text">
                  {t.termsText}{' '}
                  <button
                    type="button"
                    className="hn-text-link"
                    onClick={() => setPolicyModal('terms')}
                  >
                    {t.termsLink}
                  </button>{' '}
                  {t.andText}{' '}
                  <button
                    type="button"
                    className="hn-text-link"
                    onClick={() => setPolicyModal('privacy')}
                  >
                    {t.privacyLink}
                  </button>
                  .
                </span>
              </label>
              {errors.agreeTerms && (
                <span id="hn-terms-error" className="henedo-error-msg hn-terms-err" role="alert">
                  {errors.agreeTerms}
                </span>
              )}
            </div>

            {/* Sand Gold Primary Action CTA */}
            <button
              type="submit"
              className="henedo-cta-btn"
              disabled={status === 'submitting'}
            >
              <span>{status === 'submitting' ? t.submittingButton : t.submitButton}</span>
              <span className="hn-arrow" aria-hidden="true">→</span>
            </button>
          </form>

          {/* Divider: Hoặc / or */}
          <div className="henedo-divider" role="separator" aria-label={t.orDivider}>
            <span>{t.orDivider}</span>
          </div>

          {/* Google Sign-in Section */}
          <div className="henedo-google-section">
            <GoogleSignInButton
              id="hn-register-google-btn"
              disabled={status === 'submitting'}
              lang={lang}
              text="continue_with"
              onCredentialReceived={handleGoogleCredential}
              onError={handleGoogleError}
            />
          </div>

          {/* Status Alert Notification */}
          {status !== 'idle' && status !== 'submitting' && (

            <div className={`henedo-status-box ${status}`} role="status">
              <div className="henedo-status-icon" aria-hidden="true">
                {status === 'pending' && 'ℹ'}
                {status === 'success' && '✓'}
                {status === 'failure' && '!'}
              </div>
              <div className="henedo-status-text">{statusMessage}</div>
            </div>
          )}

          {/* Footer Info & Signin Prompt (No RBAC note) */}
          <footer className="henedo-form-footer">
            {typeof onNavigateToLogin === 'function' && (
              <div className="henedo-signin-prompt">
                {t.signinPrompt}{' '}
                <a href="/login" onClick={handleLoginClick}>
                  {t.signinAction}
                </a>
              </div>
            )}
          </footer>
        </div>
      </main>

      {/* Informational Policy Modal */}
      {policyModal && (
        <div
          className="henedo-modal-backdrop"
          role="presentation"
          onClick={() => setPolicyModal(null)}
        >
          <div
            className="henedo-modal-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="hn-modal-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="henedo-modal-crest" aria-hidden="true">
              ✦
            </div>
            <h3 id="hn-modal-title" className="henedo-modal-title">
              {policyModal === 'terms' ? t.termsModalTitle : t.privacyModalTitle}
            </h3>
            <p className="henedo-modal-body">
              {policyModal === 'terms' ? t.termsModalContent : t.privacyModalContent}
            </p>
            <button
              type="button"
              className="henedo-modal-close-btn"
              onClick={() => setPolicyModal(null)}
              autoFocus
            >
              {t.modalClose}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
