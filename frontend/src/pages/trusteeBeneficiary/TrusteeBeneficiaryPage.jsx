import { useState, useEffect, useCallback } from 'react';
import {
  DEFAULT_VAULT_ID,
  getTrustees,
  createTrustee,
  getBeneficiaries,
  createBeneficiary,
  checkConfigurationReadiness,
} from '../../utils/trusteeBeneficiaryService.js';
import { validateTrustee } from '../../utils/trusteeValidation.js';
import { validateBeneficiary } from '../../utils/beneficiaryValidation.js';
import './TrusteeBeneficiaryPage.css';

const i18n = {
  vi: {
    brandName: 'LegacyVault',
    eyebrow: 'THIẾT LẬP BẢO VỆ & DI SẢN',
    pageTitle: 'Chỉ định Người giám hộ & Người thụ hưởng',
    pageDesc:
      'Cấu hình phân quyền bàn giao di sản số bảo mật, rõ ràng và tuân thủ chặt chẽ pháp lý.',
    navBack: '← Quay lại',
    navToLogin: 'Đăng nhập',
    navToRegister: 'Đăng ký',

    // Readiness Banner
    readinessTitle: 'Mức độ sẵn sàng cấu hình kho (Readiness)',
    statusReady: 'Đã sẵn sàng cấu hình',
    statusPending: 'Chưa đủ điều kiện',
    readyMsg: 'Đã đủ điều kiện: Có ít nhất 1 Người thụ hưởng trong hệ thống.',
    pendingMsg: 'Cần có ít nhất 1 Người thụ hưởng để hoàn tất cấu hình kho.',
    beneficiaryCountLabel: 'Người thụ hưởng:',
    trusteeStatusLabel: 'Người giám hộ:',
    trusteeConfigured: 'Đã chỉ định (APPOINTED)',
    trusteeSkipped: 'Đã bỏ qua (Tùy chọn)',
    trusteeUnconfigured: 'Chưa thiết lập (Tùy chọn)',

    // Section A: Trustee
    trusteeTag: 'BƯỚC TÙY CHỌN · ST-04',
    trusteeTitle: '1. Người giám hộ (Trustee)',
    trusteeSubtitle:
      'Người hỗ trợ kích hoạt quy trình chuyển giao di sản số khi xảy ra biến cố.',
    trusteeNotice:
      'Người giám hộ là tùy chọn. Bạn có thể bỏ qua bước này. Người giám hộ KHÔNG cần tài khoản, KHÔNG có quyền mở khóa, giải mã hay xem bí mật, và KHÔNG mặc nhiên là Người thụ hưởng. Mỗi két chỉ có tối đa 1 Người giám hộ được chỉ định.',
    trusteeSkippedBadge: 'Đã bỏ qua Người giám hộ',
    trusteeSkippedDesc:
      'Bạn đã chọn không chỉ định Người giám hộ cho két này. Bạn có thể thiết lập bất cứ lúc nào nếu đổi ý.',
    unskipTrusteeBtn: 'Thiết lập Người giám hộ',
    skipTrusteeBtn: 'Bỏ qua Người giám hộ',
    maxTrusteeReachedNotice:
      'Két đã có 1 Người giám hộ được chỉ định (Đã đạt giới hạn tối đa 1 Người giám hộ trên mỗi két).',
    duplicateTrusteeError:
      'Két đã có Người giám hộ được chỉ định. Mỗi két chỉ có tối đa 1 Người giám hộ hiện tại.',
    vaultNotEditableError:
      'Két đang ở trạng thái không thể chỉnh sửa.',

    // Section B: Beneficiary
    beneficiaryTag: 'BẮT BUỘC TỐI THIỂU 1 · ST-05',
    beneficiaryTitle: '2. Người thụ hưởng (Beneficiary)',
    beneficiarySubtitle:
      'Người được chỉ định nhận thông tin và di sản sau khi quy trình chuyển giao được kích hoạt hợp lệ.',
    beneficiaryNotice:
      'Cần ít nhất 1 Người thụ hưởng để hoàn tất cấu hình. Người thụ hưởng KHÔNG cần tài khoản, hệ thống KHÔNG tạo tài khoản người dùng, KHÔNG cấp liên kết nhận quyền (Claim Link), KHÔNG tạo Cổng khách (Guest Portal) hay mã OTP, và KHÔNG phân bổ tỷ lệ phần trăm chia tài sản tại bước này.',
    noBeneficiaries:
      'Chưa có Người thụ hưởng nào được thêm. Vui lòng thêm ít nhất 1 Người thụ hưởng bên dưới.',
    beneficiaryListTitle: 'Danh sách Người thụ hưởng hiện tại:',

    // Form fields
    fullNameLabel: 'Họ và tên',
    fullNamePlaceholder: 'Ví dụ: Nguyễn Văn A',
    phoneLabel: 'Số điện thoại',
    phonePlaceholder: '0901234567 hoặc +84...',
    emailLabel: 'Địa chỉ Email',
    emailPlaceholder: 'name@example.com',
    relationshipLabel: 'Mối quan hệ',
    relationshipPlaceholder: 'Ví dụ: Con gái, Vợ/Chồng, Luật sư...',
    noteLabel: 'Ghi chú bổ sung',
    notePlaceholder: 'Ghi chú ủy quyền hoặc thông tin liên hệ phụ...',
    dobLabel: 'Ngày sinh',
    contactNotice: '* Yêu cầu ít nhất một phương thức liên lạc: Số điện thoại hoặc Email.',

    // Buttons & alerts
    saveTrusteeBtn: 'Lưu Người giám hộ',
    addBeneficiaryBtn: 'Thêm Người thụ hưởng',
    submitting: 'Đang xử lý...',
    appointedStatus: 'Đã chỉ định (APPOINTED)',
    addedSuccessTrustee: 'Đã thêm Người giám hộ thành công.',
    skippedSuccessTrustee: 'Đã đánh dấu bỏ qua Người giám hộ (Cục bộ).',
    addedSuccessBeneficiary: 'Đã thêm Người thụ hưởng thành công.',
  },
  en: {
    brandName: 'LegacyVault',
    eyebrow: 'LEGACY & GUARDIANSHIP SETUP',
    pageTitle: 'Trustee & Beneficiary Setup',
    pageDesc:
      'Configure digital legacy trusteeship and beneficiaries with security, clarity, and legal precision.',
    navBack: '← Back',
    navToLogin: 'Sign in',
    navToRegister: 'Register',

    // Readiness Banner
    readinessTitle: 'Vault Configuration Readiness',
    statusReady: 'Configuration Ready',
    statusPending: 'Action Required',
    readyMsg: 'Minimum requirements met: At least 1 Beneficiary is configured.',
    pendingMsg: 'At least 1 Beneficiary is required to complete vault configuration.',
    beneficiaryCountLabel: 'Beneficiaries:',
    trusteeStatusLabel: 'Trustee:',
    trusteeConfigured: 'Appointed (APPOINTED)',
    trusteeSkipped: 'Skipped (Optional)',
    trusteeUnconfigured: 'Not Configured (Optional)',

    // Section A: Trustee
    trusteeTag: 'OPTIONAL STEP · ST-04',
    trusteeTitle: '1. Trustee',
    trusteeSubtitle:
      'The designated person who assists in initiating the heritage handover upon designated events.',
    trusteeNotice:
      'Trustee is optional. You may skip this step. The Trustee does NOT need an account, has NO permissions to unlock, decrypt, or view secrets, and is NOT automatically a beneficiary. Max 1 appointed Trustee per Vault.',
    trusteeSkippedBadge: 'Trustee Skipped',
    trusteeSkippedDesc:
      'You chose not to designate a Trustee for this vault. You can configure one at any time if you change your mind.',
    unskipTrusteeBtn: 'Set up Trustee',
    skipTrusteeBtn: 'Skip Trustee',
    maxTrusteeReachedNotice:
      'The vault already has 1 appointed Trustee (Maximum of 1 appointed Trustee per Vault reached).',
    duplicateTrusteeError:
      'A trustee has already been appointed for this vault. Maximum 1 appointed trustee per vault.',
    vaultNotEditableError:
      'The vault is in a state that cannot be edited.',

    // Section B: Beneficiary
    beneficiaryTag: 'AT LEAST 1 REQUIRED · ST-05',
    beneficiaryTitle: '2. Beneficiaries',
    beneficiarySubtitle:
      'Individuals designated to receive legacy records once the handover process is duly executed.',
    beneficiaryNotice:
      'At least 1 Beneficiary is required for vault readiness. Beneficiaries do NOT need an account. The system does NOT create accounts, does NOT issue Claim Links, Guest Portals, or OTPs, and does NOT allocate inheritance percentages at this step.',
    noBeneficiaries:
      'No beneficiaries added yet. Please add at least 1 beneficiary below.',
    beneficiaryListTitle: 'Current Beneficiaries:',

    // Form fields
    fullNameLabel: 'Full Name',
    fullNamePlaceholder: 'e.g. John Doe',
    phoneLabel: 'Phone Number',
    phonePlaceholder: '0901234567 or +84...',
    emailLabel: 'Email Address',
    emailPlaceholder: 'name@example.com',
    relationshipLabel: 'Relationship',
    relationshipPlaceholder: 'e.g. Daughter, Spouse, Legal Counsel...',
    noteLabel: 'Additional Note',
    notePlaceholder: 'Delegation notes or auxiliary contact info...',
    dobLabel: 'Date of Birth',
    contactNotice: '* At least one contact method (Phone or Email) is required.',

    // Buttons & alerts
    saveTrusteeBtn: 'Save Trustee',
    addBeneficiaryBtn: 'Add Beneficiary',
    submitting: 'Saving...',
    appointedStatus: 'Appointed (APPOINTED)',
    addedSuccessTrustee: 'Trustee added successfully.',
    skippedSuccessTrustee: 'Trustee skipped (Local choice).',
    addedSuccessBeneficiary: 'Beneficiary added successfully.',
  },
};

export default function TrusteeBeneficiaryPage({ onNavigateToLogin, onNavigateToRegister }) {
  const [lang, setLang] = useState('vi');
  const t = i18n[lang] || i18n.vi;

  const [vaultId] = useState(DEFAULT_VAULT_ID);
  const [trustees, setTrustees] = useState([]);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [isSkipped, setIsSkipped] = useState(false);
  const [readiness, setReadiness] = useState({ isReady: false, beneficiaryCount: 0, hasTrustee: false });

  // Alerts
  const [alert, setAlert] = useState(null); // { type: 'success'|'error', message }

  // Trustee Form
  const [trusteeForm, setTrusteeForm] = useState({
    fullName: '',
    phone: '',
    email: '',
    relationship: '',
    note: '',
  });
  const [trusteeErrors, setTrusteeErrors] = useState({});
  const [isSubmittingTrustee, setIsSubmittingTrustee] = useState(false);

  // Beneficiary Form
  const [beneficiaryForm, setBeneficiaryForm] = useState({
    fullName: '',
    relationship: '',
    dateOfBirth: '',
    phone: '',
    email: '',
  });
  const [beneficiaryErrors, setBeneficiaryErrors] = useState({});
  const [isSubmittingBeneficiary, setIsSubmittingBeneficiary] = useState(false);

  const refreshData = useCallback(async () => {
    try {
      const [tList, bList, rStatus] = await Promise.all([
        getTrustees(vaultId),
        getBeneficiaries(vaultId),
        checkConfigurationReadiness(vaultId),
      ]);
      setTrustees(tList);
      setBeneficiaries(bList);
      setReadiness(rStatus);
    } catch {
      // Keep state intact
    }
  }, [vaultId]);

  useEffect(() => {
    let ignore = false;

    Promise.all([
      getTrustees(vaultId),
      getBeneficiaries(vaultId),
      checkConfigurationReadiness(vaultId),
    ])
      .then(([tList, bList, rStatus]) => {
        if (!ignore) {
          setTrustees(tList);
          setBeneficiaries(bList);
          setReadiness(rStatus);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [vaultId]);

  // Handle Skip Trustee (Pure local UI state)
  const handleSkipTrustee = () => {
    setIsSkipped(true);
    setAlert({ type: 'success', message: t.skippedSuccessTrustee });
  };

  // Handle Unskip Trustee (show form again)
  const handleUnskipTrustee = () => {
    setIsSkipped(false);
  };

  // Handle Submit Trustee
  const handleTrusteeSubmit = async (e) => {
    e.preventDefault();
    const errors = validateTrustee(trusteeForm, lang);
    setTrusteeErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmittingTrustee(true);
    try {
      await createTrustee(vaultId, trusteeForm);
      setAlert({ type: 'success', message: t.addedSuccessTrustee });
      setTrusteeForm({ fullName: '', phone: '', email: '', relationship: '', note: '' });
      setTrusteeErrors({});
      setIsSkipped(false);
      await refreshData();
    } catch (err) {
      let message = err.message || (lang === 'vi' ? 'Có lỗi xảy ra khi thêm Người giám hộ.' : 'Failed to add Trustee.');
      if (err.code === 'TRUSTEE_ALREADY_EXISTS') {
        message = t.duplicateTrusteeError;
      } else if (err.code === 'VAULT_NOT_EDITABLE') {
        message = t.vaultNotEditableError;
      }
      setAlert({
        type: 'error',
        message,
      });
    } finally {
      setIsSubmittingTrustee(false);
    }
  };

  // Handle Submit Beneficiary
  const handleBeneficiarySubmit = async (e) => {
    e.preventDefault();
    const errors = validateBeneficiary(beneficiaryForm, lang);
    setBeneficiaryErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    setIsSubmittingBeneficiary(true);
    try {
      await createBeneficiary(vaultId, beneficiaryForm);
      setAlert({ type: 'success', message: t.addedSuccessBeneficiary });
      setBeneficiaryForm({ fullName: '', relationship: '', dateOfBirth: '', phone: '', email: '' });
      setBeneficiaryErrors({});
      await refreshData();
    } catch (err) {
      setAlert({
        type: 'error',
        message: err.message || (lang === 'vi' ? 'Có lỗi xảy ra khi thêm Người thụ hưởng.' : 'Failed to add Beneficiary.'),
      });
    } finally {
      setIsSubmittingBeneficiary(false);
    }
  };

  const appointedTrustee = trustees[0];
  const todayStr = new Date().toISOString().slice(0, 10);

  return (
    <div className="lv-tb-page">
      <div className="lv-tb-container">
        {/* Top Header */}
        <header className="lv-tb-header">
          <div className="lv-tb-brand">
            <div className="lv-tb-brand-badge" aria-hidden="true">
              LV
            </div>
            <span className="lv-tb-brand-name">{t.brandName}</span>
          </div>

          <div className="lv-tb-top-actions">
            {onNavigateToLogin && (
              <button type="button" className="lv-tb-nav-link" onClick={onNavigateToLogin}>
                {t.navToLogin}
              </button>
            )}
            {onNavigateToRegister && (
              <button type="button" className="lv-tb-nav-link" onClick={onNavigateToRegister}>
                {t.navToRegister}
              </button>
            )}
            <button
              type="button"
              className="lv-tb-lang-toggle"
              onClick={() => setLang(lang === 'vi' ? 'en' : 'vi')}
              aria-label="Toggle language"
            >
              {lang === 'vi' ? 'EN' : 'VI'}
            </button>
          </div>
        </header>

        {/* Hero Title */}
        <div className="lv-tb-title-block">
          <span className="lv-tb-eyebrow">{t.eyebrow}</span>
          <h1 className="lv-tb-title">{t.pageTitle}</h1>
          <p className="lv-tb-desc">{t.pageDesc}</p>
        </div>

        {/* Global Alert Notification */}
        {alert && (
          <div className={`lv-tb-alert ${alert.type}`} role="alert">
            <span>{alert.message}</span>
            <button
              type="button"
              style={{ background: 'none', border: 'none', cursor: 'pointer', fontWeight: 700 }}
              onClick={() => setAlert(null)}
              aria-label="Dismiss alert"
            >
              ✕
            </button>
          </div>
        )}

        {/* Configuration Readiness Banner */}
        <section className="lv-tb-readiness-banner" aria-label="Configuration Readiness Status">
          <div className="lv-tb-readiness-header">
            <span className="lv-tb-readiness-title">
              <span aria-hidden="true">✦</span> {t.readinessTitle}
            </span>
            <span className={`lv-tb-status-badge ${readiness.isReady ? 'ready' : 'pending'}`}>
              {readiness.isReady ? t.statusReady : t.statusPending}
            </span>
          </div>

          <div className="lv-tb-readiness-grid">
            <div className="lv-tb-readiness-item">
              <span className="lv-tb-readiness-label">{t.beneficiaryCountLabel}</span>
              <span className={`lv-tb-readiness-val ${beneficiaries.length >= 1 ? 'done' : 'warn'}`}>
                {beneficiaries.length >= 1
                  ? `${beneficiaries.length} người (✓)`
                  : '0 người (Cần tối thiểu 1)'}
              </span>
            </div>
            <div className="lv-tb-readiness-item">
              <span className="lv-tb-readiness-label">{t.trusteeStatusLabel}</span>
              <span className={`lv-tb-readiness-val ${appointedTrustee || isSkipped ? 'done' : 'warn'}`}>
                {appointedTrustee
                  ? t.trusteeConfigured
                  : isSkipped
                  ? t.trusteeSkipped
                  : t.trusteeUnconfigured}
              </span>
            </div>
          </div>
        </section>

        {/* Main Stack */}
        <div className="lv-tb-sections-stack">
          {/* SECTION A: TRUSTEE (ST-04) */}
          <section className="lv-tb-section-card" aria-labelledby="trustee-heading">
            <div className="lv-tb-section-header">
              <div className="lv-tb-section-title-wrap">
                <span className="lv-tb-section-tag">{t.trusteeTag}</span>
                <h2 id="trustee-heading" className="lv-tb-section-title">
                  {t.trusteeTitle}
                </h2>
                <p className="lv-tb-section-subtitle">{t.trusteeSubtitle}</p>
              </div>

              {!appointedTrustee && !isSkipped && (
                <button
                  type="button"
                  className="lv-tb-btn-skip"
                  onClick={handleSkipTrustee}
                >
                  {t.skipTrusteeBtn}
                </button>
              )}
            </div>

            <div className="lv-tb-notice-box">
              <strong>{lang === 'vi' ? 'Quy tắc nghiệp vụ: ' : 'Business rules: '}</strong>
              {t.trusteeNotice}
            </div>

            {/* Current Trustee or Skipped State */}
            {appointedTrustee ? (
              <div>
                <div className="lv-tb-entity-card">
                  <div className="lv-tb-entity-header">
                    <span className="lv-tb-entity-name">{appointedTrustee.fullName}</span>
                    <span className="lv-tb-badge-appointed">{t.appointedStatus}</span>
                  </div>
                  <div className="lv-tb-entity-grid">
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.phoneLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.phone || '—'}</span>
                    </div>
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.emailLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.email || '—'}</span>
                    </div>
                    <div className="lv-tb-entity-prop">
                      <span className="lv-tb-prop-label">{t.relationshipLabel}</span>
                      <span className="lv-tb-prop-value">{appointedTrustee.relationship || '—'}</span>
                    </div>
                    {appointedTrustee.note && (
                      <div className="lv-tb-entity-prop" style={{ gridColumn: '1 / -1' }}>
                        <span className="lv-tb-prop-label">{t.noteLabel}</span>
                        <span className="lv-tb-prop-value">{appointedTrustee.note}</span>
                      </div>
                    )}
                  </div>
                </div>
                <p className="lv-tb-hint">{t.maxTrusteeReachedNotice}</p>
              </div>
            ) : isSkipped ? (
              <div className="lv-tb-skipped-state">
                <div className="lv-tb-skipped-badge">
                  <span>✓</span> {t.trusteeSkippedBadge}
                </div>
                <p className="lv-tb-skipped-desc">{t.trusteeSkippedDesc}</p>
                <button
                  type="button"
                  className="lv-tb-btn-secondary"
                  onClick={handleUnskipTrustee}
                >
                  {t.unskipTrusteeBtn}
                </button>
              </div>
            ) : (
              /* Add Trustee Form */
              <form className="lv-tb-form" onSubmit={handleTrusteeSubmit} noValidate>
                <div className="lv-tb-form-grid">
                  {/* Full Name */}
                  <div className="lv-tb-field-group full-width">
                    <label className="lv-tb-label" htmlFor="trustee-fullname">
                      {t.fullNameLabel} <span className="lv-tb-req">*</span>
                    </label>
                    <input
                      id="trustee-fullname"
                      type="text"
                      maxLength={150}
                      className={`lv-tb-input ${trusteeErrors.fullName ? 'has-error' : ''}`}
                      placeholder={t.fullNamePlaceholder}
                      value={trusteeForm.fullName}
                      onChange={(e) =>
                        setTrusteeForm({ ...trusteeForm, fullName: e.target.value })
                      }
                    />
                    {trusteeErrors.fullName && (
                      <span className="lv-tb-error-text">{trusteeErrors.fullName}</span>
                    )}
                  </div>

                  {/* Phone */}
                  <div className="lv-tb-field-group">
                    <label className="lv-tb-label" htmlFor="trustee-phone">
                      {t.phoneLabel}
                    </label>
                    <input
                      id="trustee-phone"
                      type="tel"
                      className={`lv-tb-input ${trusteeErrors.phone ? 'has-error' : ''}`}
                      placeholder={t.phonePlaceholder}
                      value={trusteeForm.phone}
                      onChange={(e) =>
                        setTrusteeForm({ ...trusteeForm, phone: e.target.value })
                      }
                    />
                    {trusteeErrors.phone && (
                      <span className="lv-tb-error-text">{trusteeErrors.phone}</span>
                    )}
                  </div>

                  {/* Email */}
                  <div className="lv-tb-field-group">
                    <label className="lv-tb-label" htmlFor="trustee-email">
                      {t.emailLabel}
                    </label>
                    <input
                      id="trustee-email"
                      type="email"
                      className={`lv-tb-input ${trusteeErrors.email ? 'has-error' : ''}`}
                      placeholder={t.emailPlaceholder}
                      value={trusteeForm.email}
                      onChange={(e) =>
                        setTrusteeForm({ ...trusteeForm, email: e.target.value })
                      }
                    />
                    {trusteeErrors.email && (
                      <span className="lv-tb-error-text">{trusteeErrors.email}</span>
                    )}
                  </div>

                  {/* Contact requirement notice */}
                  <div className="lv-tb-field-group full-width">
                    <span className="lv-tb-hint">{t.contactNotice}</span>
                  </div>

                  {/* Relationship */}
                  <div className="lv-tb-field-group full-width">
                    <label className="lv-tb-label" htmlFor="trustee-relationship">
                      {t.relationshipLabel}
                    </label>
                    <input
                      id="trustee-relationship"
                      type="text"
                      maxLength={100}
                      className={`lv-tb-input ${trusteeErrors.relationship ? 'has-error' : ''}`}
                      placeholder={t.relationshipPlaceholder}
                      value={trusteeForm.relationship}
                      onChange={(e) =>
                        setTrusteeForm({ ...trusteeForm, relationship: e.target.value })
                      }
                    />
                    {trusteeErrors.relationship && (
                      <span className="lv-tb-error-text">{trusteeErrors.relationship}</span>
                    )}
                  </div>

                  {/* Note */}
                  <div className="lv-tb-field-group full-width">
                    <label className="lv-tb-label" htmlFor="trustee-note">
                      {t.noteLabel}
                    </label>
                    <textarea
                      id="trustee-note"
                      rows={2}
                      maxLength={500}
                      className={`lv-tb-textarea ${trusteeErrors.note ? 'has-error' : ''}`}
                      placeholder={t.notePlaceholder}
                      value={trusteeForm.note}
                      onChange={(e) =>
                        setTrusteeForm({ ...trusteeForm, note: e.target.value })
                      }
                    />
                    {trusteeErrors.note && (
                      <span className="lv-tb-error-text">{trusteeErrors.note}</span>
                    )}
                  </div>
                </div>

                <div className="lv-tb-actions-row">
                  <button
                    type="submit"
                    className="lv-tb-btn-primary"
                    disabled={isSubmittingTrustee}
                  >
                    {isSubmittingTrustee ? t.submitting : t.saveTrusteeBtn}
                  </button>
                </div>
              </form>
            )}
          </section>

          {/* SECTION B: BENEFICIARY (ST-05) */}
          <section className="lv-tb-section-card" aria-labelledby="beneficiary-heading">
            <div className="lv-tb-section-header">
              <div className="lv-tb-section-title-wrap">
                <span className="lv-tb-section-tag">{t.beneficiaryTag}</span>
                <h2 id="beneficiary-heading" className="lv-tb-section-title">
                  {t.beneficiaryTitle}
                </h2>
                <p className="lv-tb-section-subtitle">{t.beneficiarySubtitle}</p>
              </div>
            </div>

            <div className="lv-tb-notice-box">
              <strong>{lang === 'vi' ? 'Quy tắc nghiệp vụ: ' : 'Business rules: '}</strong>
              {t.beneficiaryNotice}
            </div>

            {/* Existing Beneficiaries List */}
            {beneficiaries.length === 0 ? (
              <div className="lv-tb-empty-state">{t.noBeneficiaries}</div>
            ) : (
              <div style={{ marginBottom: '28px' }}>
                <h3
                  style={{
                    fontSize: '14.5px',
                    fontWeight: 700,
                    color: 'var(--lv-brand-forest, #164639)',
                    marginBottom: '12px',
                  }}
                >
                  {t.beneficiaryListTitle} ({beneficiaries.length})
                </h3>
                {beneficiaries.map((b) => (
                  <div key={b.id} className="lv-tb-entity-card">
                    <div className="lv-tb-entity-header">
                      <span className="lv-tb-entity-name">{b.fullName}</span>
                      <span className="lv-tb-badge-appointed">
                        {b.relationship || (lang === 'vi' ? 'Người thụ hưởng' : 'Beneficiary')}
                      </span>
                    </div>
                    <div className="lv-tb-entity-grid">
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.dobLabel}</span>
                        <span className="lv-tb-prop-value">{b.dateOfBirth || '—'}</span>
                      </div>
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.phoneLabel}</span>
                        <span className="lv-tb-prop-value">{b.phone || '—'}</span>
                      </div>
                      <div className="lv-tb-entity-prop">
                        <span className="lv-tb-prop-label">{t.emailLabel}</span>
                        <span className="lv-tb-prop-value">{b.email || '—'}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Add Beneficiary Form */}
            <form className="lv-tb-form" onSubmit={handleBeneficiarySubmit} noValidate>
              <h3
                style={{
                  fontSize: '15px',
                  fontWeight: 700,
                  color: 'var(--lv-brand-forest, #164639)',
                  marginBottom: '16px',
                }}
              >
                + {t.addBeneficiaryBtn}
              </h3>
              <div className="lv-tb-form-grid">
                {/* Full Name */}
                <div className="lv-tb-field-group full-width">
                  <label className="lv-tb-label" htmlFor="ben-fullname">
                    {t.fullNameLabel} <span className="lv-tb-req">*</span>
                  </label>
                  <input
                    id="ben-fullname"
                    type="text"
                    maxLength={150}
                    className={`lv-tb-input ${beneficiaryErrors.fullName ? 'has-error' : ''}`}
                    placeholder={t.fullNamePlaceholder}
                    value={beneficiaryForm.fullName}
                    onChange={(e) =>
                      setBeneficiaryForm({ ...beneficiaryForm, fullName: e.target.value })
                    }
                  />
                  {beneficiaryErrors.fullName && (
                    <span className="lv-tb-error-text">{beneficiaryErrors.fullName}</span>
                  )}
                </div>

                {/* Relationship */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-relationship">
                    {t.relationshipLabel}
                  </label>
                  <input
                    id="ben-relationship"
                    type="text"
                    maxLength={100}
                    className={`lv-tb-input ${beneficiaryErrors.relationship ? 'has-error' : ''}`}
                    placeholder={t.relationshipPlaceholder}
                    value={beneficiaryForm.relationship}
                    onChange={(e) =>
                      setBeneficiaryForm({ ...beneficiaryForm, relationship: e.target.value })
                    }
                  />
                  {beneficiaryErrors.relationship && (
                    <span className="lv-tb-error-text">{beneficiaryErrors.relationship}</span>
                  )}
                </div>

                {/* Date of Birth */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-dob">
                    {t.dobLabel}
                  </label>
                  <input
                    id="ben-dob"
                    type="date"
                    max={todayStr}
                    className={`lv-tb-input ${beneficiaryErrors.dateOfBirth ? 'has-error' : ''}`}
                    value={beneficiaryForm.dateOfBirth}
                    onChange={(e) =>
                      setBeneficiaryForm({ ...beneficiaryForm, dateOfBirth: e.target.value })
                    }
                  />
                  {beneficiaryErrors.dateOfBirth && (
                    <span className="lv-tb-error-text">{beneficiaryErrors.dateOfBirth}</span>
                  )}
                </div>

                {/* Phone */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-phone">
                    {t.phoneLabel}
                  </label>
                  <input
                    id="ben-phone"
                    type="tel"
                    className={`lv-tb-input ${beneficiaryErrors.phone ? 'has-error' : ''}`}
                    placeholder={t.phonePlaceholder}
                    value={beneficiaryForm.phone}
                    onChange={(e) =>
                      setBeneficiaryForm({ ...beneficiaryForm, phone: e.target.value })
                    }
                  />
                  {beneficiaryErrors.phone && (
                    <span className="lv-tb-error-text">{beneficiaryErrors.phone}</span>
                  )}
                </div>

                {/* Email */}
                <div className="lv-tb-field-group">
                  <label className="lv-tb-label" htmlFor="ben-email">
                    {t.emailLabel}
                  </label>
                  <input
                    id="ben-email"
                    type="email"
                    className={`lv-tb-input ${beneficiaryErrors.email ? 'has-error' : ''}`}
                    placeholder={t.emailPlaceholder}
                    value={beneficiaryForm.email}
                    onChange={(e) =>
                      setBeneficiaryForm({ ...beneficiaryForm, email: e.target.value })
                    }
                  />
                  {beneficiaryErrors.email && (
                    <span className="lv-tb-error-text">{beneficiaryErrors.email}</span>
                  )}
                </div>
              </div>

              <div className="lv-tb-actions-row">
                <button
                  type="submit"
                  className="lv-tb-btn-primary"
                  disabled={isSubmittingBeneficiary}
                >
                  {isSubmittingBeneficiary ? t.submitting : t.addBeneficiaryBtn}
                </button>
              </div>
            </form>
          </section>
        </div>
      </div>
    </div>
  );
}
