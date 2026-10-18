import { staffAuthFeedback, useStaffSessionExpiry } from './staffFeedback.js';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  FileText,
  User,
  Shield,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
  Calendar,
  Building2,
  Hash,
} from 'lucide-react';
import { Button } from '../../components/common/Button.jsx';
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import { submitPhysicalIntakeRecord, validateIntakeForm, validateIntakeReceipt } from './staffIntakeService.js';
import './StaffCaseIntakePage.css';

/**
 * StaffCaseIntakePage — Giao diện Tiếp nhận người nộp và hồ sơ tử vong (PS-26)
 *
 * RANH GIỚI NGHIỆP VỤ & PHÁP LÝ:
 * 1. Tiếp nhận hồ sơ chỉ là ghi nhận metadata giấy tờ bản cứng:
 *    - Không xác nhận tử vong.
 *    - Không phê duyệt giá trị pháp lý.
 *    - Không tự đổi Vault/DMS hoặc hoàn tất case.
 *    - Không unlock, decrypt hay bàn giao tài sản.
 * 2. Người nộp (Trustee/người thi hành/thân nhân) có thể ở ngoài hệ thống, không cần tài khoản.
 * 3. Tách rõ Ngày cấp giấy tờ với Thời điểm Staff tiếp nhận hồ sơ.
 * 4. Người tiếp nhận xác định tự động từ phiên Staff; FE không gửi actor ID tùy ý.
 */
export default function StaffCaseIntakePage(props) {
  const scope = JSON.stringify([props.caseItem?.id || props.caseItem?.caseNumber, props.accessToken, Boolean(props.isDevPreview)]);
  return <IntakeForm key={scope} {...props} />;
}

function IntakeForm({
  caseItem,
  onBack,
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  onUnauthorized,
  initialData = {},
  onSubmitRecord = submitPhysicalIntakeRecord,
}) {
  const t = getStaffCaseTranslations(lang).intake;

  // Form State
  const [formData, setFormData] = useState(() => ({
    submitterName: initialData.submitterName || '',
    submitterPhone: initialData.submitterPhone || '',
    submitterEmail: initialData.submitterEmail || '',
    relationship: initialData.relationship || '',
    documentType: initialData.documentType || '',
    issuingAuthority: initialData.issuingAuthority || '',
    documentNumber: initialData.documentNumber || '',
    issuingDate: initialData.issuingDate || '',
    intakeDateTime: initialData.intakeDateTime || '', // Explicit local physical receipt time
    physicalNotes: initialData.physicalNotes || '',
  }));

  const [storedFieldErrors, setFieldErrors] = useState({});
  const currentValidation = validateIntakeForm(formData, lang).errors;
  const fieldErrors = Object.fromEntries(Object.entries(storedFieldErrors).map(([key, value]) =>
    [key, value === true ? (currentValidation[key] || t.beneficiarySelect?.selectPrompt) : value]));
  const notifySessionExpiry = useStaffSessionExpiry({ accessToken, isDevPreview, onUnauthorized });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successReceipt, setSuccessReceipt] = useState(null);

  const abortControllerRef = useRef(null);
  const activeCaseRef = useRef(caseItem?.id || caseItem?.caseNumber);
  // Cleanup abort controller khi unmount
  useEffect(() => {
    activeCaseRef.current = caseItem?.id || caseItem?.caseNumber;
    return () => {
      activeCaseRef.current = null;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [caseItem?.id, caseItem?.caseNumber]);

  // Format Helper
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    // Xóa lỗi của trường khi người dùng nhập lại
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();

    // Chặn gửi lặp khi đang xử lý
    if (isSubmitting || abortControllerRef.current) return;

    if (!caseItem) {
      setSubmitError({ message: t.noCaseDesc });
      return;
    }

    // Client-side validation
    const validation = validateIntakeForm(formData, lang);
    if (!validation.isValid) {
      setFieldErrors(Object.fromEntries(Object.keys(validation.errors).map(key => [key, true])));
      // Cuộn lên phần tử lỗi đầu tiên
      const firstErrorField = Object.keys(validation.errors)[0];
      const errorEl = document.querySelector(`[data-field="${firstErrorField}"]`);
      if (errorEl && typeof errorEl.scrollIntoView === 'function') {
        errorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    const currentCaseId = caseItem.id || caseItem.caseNumber;

    try {
      const result = await onSubmitRecord(currentCaseId, formData, {
        accessToken,
        isDevPreview,
        lang,
        signal: controller.signal,
      });

      // Kiểm tra nếu case đã đổi trong lúc request đang bay -> bỏ qua phản hồi cũ
      if (controller.signal.aborted || activeCaseRef.current !== currentCaseId) {
        return;
      }

      setSuccessReceipt(validateIntakeReceipt(result, currentCaseId, { accessToken, isDevPreview }));
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (controller.signal.aborted || activeCaseRef.current !== currentCaseId) return;

      notifySessionExpiry(err);
      if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else {
        setSubmitError(err);
      }
    } finally {
      if (activeCaseRef.current === currentCaseId) {
        abortControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  const authFeedback = staffAuthFeedback(submitError, lang);

  // Trường hợp thiếu ngữ cảnh case
  if (!caseItem) {
    return (
      <div className="lv-intake-page lv-intake-page--no-case">
        <div className="lv-intake-header">
          <Button variant="secondary" size="sm" onClick={onBack} className="lv-intake-back-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t.backToListBtn}</span>
          </Button>
        </div>

        <div className="lv-intake-state-card" role="alert">
          <div className="lv-intake-state-icon-wrap lv-intake-state-icon-wrap--warning">
            <AlertCircle size={32} aria-hidden="true" />
          </div>
          <h2 className="lv-intake-state-title">{t.noCaseTitle}</h2>
          <p className="lv-intake-state-desc">{t.noCaseDesc}</p>
          <div className="lv-intake-state-actions">
            <Button variant="primary" onClick={onBack}>
              {t.backToListBtn}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Trường hợp gửi thành công (Hiển thị biên nhận mô phỏng)
  if (successReceipt) {
    return (
      <div className="lv-intake-page">
        <div className="lv-intake-header">
          <Button variant="secondary" size="sm" onClick={onBack} className="lv-intake-back-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t.backToListBtn}</span>
          </Button>
        </div>

        <div className="lv-intake-success-card" role="status">
          <div className="lv-intake-success-icon-wrap">
            <CheckCircle2 size={36} aria-hidden="true" />
          </div>
          <h2 className="lv-intake-success-title">{t.feedback.successTitle}</h2>
          <p className="lv-intake-success-desc">{t.feedback.successDesc}</p>

          <div className="lv-intake-receipt-box">
            <div className="lv-intake-receipt-row">
              <span className="lv-intake-receipt-label">{t.fields.caseNumber}:</span>
              <strong className="lv-intake-receipt-val">{caseItem.caseNumber}</strong>
            </div>
            <div className="lv-intake-receipt-row">
              <span className="lv-intake-receipt-label">{t.feedback.receiptNumber}</span>
              <strong className="lv-intake-receipt-val lv-intake-receipt-val--code">
                {successReceipt.receiptNumber}
              </strong>
            </div>
            <div className="lv-intake-receipt-row">
              <span className="lv-intake-receipt-label">{t.review.submitterLabel}</span>
              <span className="lv-intake-receipt-val">{formData.submitterName}</span>
            </div>
            <div className="lv-intake-receipt-row">
              <span className="lv-intake-receipt-label">{t.review.documentLabel}</span>
              <span className="lv-intake-receipt-val">
                {t.fields.documentTypeOptions[formData.documentType] || formData.documentType}{formData.documentNumber ? ` (${formData.documentNumber})` : ''}
              </span>
            </div>
            <div className="lv-intake-receipt-row">
              <span className="lv-intake-receipt-label">{t.feedback.recordedAt}</span>
              <span className="lv-intake-receipt-val">{formatDate(successReceipt.recordedAt)}</span>
            </div>
          </div>

          <div className="lv-intake-simulation-warning" role="note">
            <Info size={16} aria-hidden="true" />
            <span>{t.feedback.simulationWarning}</span>
          </div>

          <div className="lv-intake-success-actions">
            <Button variant="primary" onClick={onBack}>
              {t.buttons.back}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isBackendNotReady = submitError?.code === 'BACKEND_NOT_READY';

  return (
    <div className="lv-intake-page">
      {/* Header and Back Button */}
      <div className="lv-intake-header">
        <Button variant="secondary" size="sm" onClick={onBack} className="lv-intake-back-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t.backToListBtn}</span>
        </Button>

        <div className="lv-intake-header__titles">
          <div className="lv-intake-eyebrow">{t.eyebrow}</div>
          <h1 className="lv-intake-title">{t.pageTitle}</h1>
          <p className="lv-intake-subtitle">{t.pageSubtitle}</p>
        </div>
      </div>

      {/* DEV Preview Notice Banner */}
      {isDevPreview && (
        <div className="lv-intake-preview-banner" role="status">
          <div className="lv-intake-preview-banner__icon">
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <div className="lv-intake-preview-banner__text">
            {t.devPreviewBanner}
          </div>
        </div>
      )}

      {/* Legal Boundary Notice */}
      <div className="lv-intake-legal-notice" role="note">
        <div className="lv-intake-legal-notice__icon">
          <Info size={18} aria-hidden="true" />
        </div>
        <div className="lv-intake-legal-notice__body">
          <h4 className="lv-intake-legal-notice__title">{t.legalNoticeTitle}</h4>
          <p className="lv-intake-legal-notice__text">{t.legalNotice}</p>
        </div>
      </div>

      {/* Submission Error Banner */}
      {submitError && (
        <div className="lv-intake-error-banner" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div className="lv-intake-error-banner__content">
            <h4>{authFeedback?.title || (isBackendNotReady ? t.feedback.notReadyTitle : t.feedback.errorTitle)}</h4>
            <p>{authFeedback?.description || (isBackendNotReady ? t.feedback.notReadyDesc : t.feedback.errorDesc)}</p>
          </div>
        </div>
      )}

      {/* Main Intake Form */}
      <form onSubmit={handleSubmit} className="lv-intake-form" noValidate>
        {/* SECTION A: THÔNG TIN HỒ SƠ ĐANG TIẾP NHẬN */}
        <section className="lv-intake-section">
          <h2 className="lv-intake-section__title">
            <FileText size={18} aria-hidden="true" />
            <span>{t.sections.caseRef}</span>
          </h2>

          <div className="lv-intake-case-context-card">
            <div className="lv-intake-context-grid">
              <div className="lv-intake-context-item">
                <span className="lv-intake-context-label">{t.fields.caseNumber}</span>
                <span className="lv-intake-context-val lv-intake-context-val--code">
                  <Hash size={13} aria-hidden="true" />
                  {caseItem.caseNumber}
                </span>
              </div>

              <div className="lv-intake-context-item">
                <span className="lv-intake-context-label">{t.fields.vaultName}</span>
                <span className="lv-intake-context-val lv-intake-context-val--vault">
                  <Shield size={13} aria-hidden="true" />
                  {caseItem.vaultName}
                </span>
              </div>

              <div className="lv-intake-context-item">
                <span className="lv-intake-context-label">{t.fields.ownerName}</span>
                <span className="lv-intake-context-val">
                  <User size={13} aria-hidden="true" />
                  {caseItem.ownerName || caseItem.ownerFullName || '—'}
                </span>
              </div>

              <div className="lv-intake-context-item">
                <span className="lv-intake-context-label">{t.fields.gracePeriodEnded}</span>
                <span className="lv-intake-context-val">
                  <Clock size={13} aria-hidden="true" />
                  {formatDate(caseItem.gracePeriodEndedAt)}
                </span>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION B: THÔNG TIN NGƯỜI NỘP HỒ SƠ */}
        <section className="lv-intake-section">
          <h2 className="lv-intake-section__title">
            <User size={18} aria-hidden="true" />
            <span>{t.sections.submitter}</span>
          </h2>

          <p className="lv-intake-section__subnote">
            {t.fields.submitterNotice}
          </p>

          <div className="lv-intake-form-grid">
            {/* Họ và tên người nộp (bắt buộc) */}
            <div className={`lv-intake-field lv-intake-field--full ${fieldErrors.submitterName ? 'lv-intake-field--error' : ''}`} data-field="submitterName">
              <label htmlFor="intake-submitter-name" className="lv-intake-label">
                <span>{t.fields.submitterName}</span>
                <span className="lv-intake-required" aria-hidden="true">*</span>
              </label>
              <input
                id="intake-submitter-name"
                type="text"
                className="lv-intake-input"
                placeholder={t.fields.submitterNamePlaceholder}
                value={formData.submitterName}
                onChange={(e) => handleInputChange('submitterName', e.target.value)}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.submitterName)}
                aria-describedby={fieldErrors.submitterName ? 'err-submitterName' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.submitterName && (
                <span id="err-submitterName" className="lv-intake-error-text" role="alert">
                  {fieldErrors.submitterName}
                </span>
              )}
            </div>

            {/* Số điện thoại (Đề xuất) */}
            <div className={`lv-intake-field ${fieldErrors.submitterPhone ? 'lv-intake-field--error' : ''}`} data-field="submitterPhone">
              <label htmlFor="intake-submitter-phone" className="lv-intake-label">
                <span>{t.fields.submitterPhone}</span>
              </label>
              <input
                id="intake-submitter-phone"
                type="tel"
                className="lv-intake-input"
                placeholder={t.fields.submitterPhonePlaceholder}
                value={formData.submitterPhone}
                onChange={(e) => handleInputChange('submitterPhone', e.target.value)}
                aria-invalid={Boolean(fieldErrors.submitterPhone)}
                aria-describedby={fieldErrors.submitterPhone ? 'err-submitterPhone' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.submitterPhone && (
                <span id="err-submitterPhone" className="lv-intake-error-text" role="alert">
                  {fieldErrors.submitterPhone}
                </span>
              )}
            </div>

            {/* Email (Đề xuất) */}
            <div className={`lv-intake-field ${fieldErrors.submitterEmail ? 'lv-intake-field--error' : ''}`} data-field="submitterEmail">
              <label htmlFor="intake-submitter-email" className="lv-intake-label">
                <span>{t.fields.submitterEmail}</span>
              </label>
              <input
                id="intake-submitter-email"
                type="email"
                className="lv-intake-input"
                placeholder={t.fields.submitterEmailPlaceholder}
                value={formData.submitterEmail}
                onChange={(e) => handleInputChange('submitterEmail', e.target.value)}
                aria-invalid={Boolean(fieldErrors.submitterEmail)}
                aria-describedby={fieldErrors.submitterEmail ? 'err-submitterEmail' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.submitterEmail && (
                <span id="err-submitterEmail" className="lv-intake-error-text" role="alert">
                  {fieldErrors.submitterEmail}
                </span>
              )}
            </div>

            {/* Mối quan hệ với chủ sở hữu (Đề xuất) */}
            <div className="lv-intake-field" data-field="relationship">
              <label htmlFor="intake-submitter-rel" className="lv-intake-label">
                <span>{t.fields.relationship}</span>
              </label>
              <select
                id="intake-submitter-rel"
                className="lv-intake-select"
                value={formData.relationship}
                onChange={(e) => handleInputChange('relationship', e.target.value)}
                disabled={isSubmitting}
              >
                <option value="">{t.fields.relationshipOptions.select}</option>
                <option value="TRUSTEE">{t.fields.relationshipOptions.TRUSTEE}</option>
                <option value="FAMILY_MEMBER">{t.fields.relationshipOptions.FAMILY_MEMBER}</option>
                <option value="LEGAL_REPRESENTATIVE">{t.fields.relationshipOptions.LEGAL_REPRESENTATIVE}</option>
                <option value="OTHER">{t.fields.relationshipOptions.OTHER}</option>
              </select>
            </div>
          </div>
        </section>

        {/* SECTION C: THÔNG TIN GIẤY TỜ BẢN CỨNG */}
        <section className="lv-intake-section">
          <h2 className="lv-intake-section__title">
            <Building2 size={18} aria-hidden="true" />
            <span>{t.sections.document}</span>
          </h2>

          <div className="lv-intake-form-grid">
            {/* Loại giấy tờ */}
            <div className={`lv-intake-field lv-intake-field--full ${fieldErrors.documentType ? 'lv-intake-field--error' : ''}`} data-field="documentType">
              <label htmlFor="intake-doc-type" className="lv-intake-label">
                <span>{t.fields.documentType}</span>
                <span className="lv-intake-required" aria-hidden="true">*</span>
              </label>
              <select
                id="intake-doc-type"
                className="lv-intake-select"
                value={formData.documentType}
                onChange={(e) => handleInputChange('documentType', e.target.value)}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.documentType)}
                aria-describedby={fieldErrors.documentType ? 'err-documentType' : undefined}
                disabled={isSubmitting}
              >
                <option value="">{t.fields.documentTypeOptions.select}</option>
                <option value="DEATH_EXTRACT">{t.fields.documentTypeOptions.DEATH_EXTRACT}</option>
                <option value="DEATH_CERTIFICATE">{t.fields.documentTypeOptions.DEATH_CERTIFICATE}</option>
                <option value="COURT_DECLARATION">{t.fields.documentTypeOptions.COURT_DECLARATION}</option>
              </select>
              <span className="lv-intake-field-hint">{t.fields.documentTypeNote}</span>
              {fieldErrors.documentType && (
                <span id="err-documentType" className="lv-intake-error-text" role="alert">
                  {fieldErrors.documentType}
                </span>
              )}
            </div>

            {/* Cơ quan cấp giấy tờ */}
            <div className={`lv-intake-field ${fieldErrors.issuingAuthority ? 'lv-intake-field--error' : ''}`} data-field="issuingAuthority">
              <label htmlFor="intake-issuing-auth" className="lv-intake-label">
                <span>{t.fields.issuingAuthority}</span>
              </label>
              <input
                id="intake-issuing-auth"
                type="text"
                className="lv-intake-input"
                placeholder={t.fields.issuingAuthorityPlaceholder}
                value={formData.issuingAuthority}
                onChange={(e) => handleInputChange('issuingAuthority', e.target.value)}
                aria-required="false"
                aria-invalid={Boolean(fieldErrors.issuingAuthority)}
                aria-describedby={fieldErrors.issuingAuthority ? 'err-issuingAuthority' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.issuingAuthority && (
                <span id="err-issuingAuthority" className="lv-intake-error-text" role="alert">
                  {fieldErrors.issuingAuthority}
                </span>
              )}
            </div>

            {/* Số hiệu / Số vào sổ giấy tờ */}
            <div className={`lv-intake-field ${fieldErrors.documentNumber ? 'lv-intake-field--error' : ''}`} data-field="documentNumber">
              <label htmlFor="intake-doc-number" className="lv-intake-label">
                <span>{t.fields.documentNumber}</span>
              </label>
              <input
                id="intake-doc-number"
                type="text"
                className="lv-intake-input"
                placeholder={t.fields.documentNumberPlaceholder}
                value={formData.documentNumber}
                onChange={(e) => handleInputChange('documentNumber', e.target.value)}
                aria-required="false"
                aria-invalid={Boolean(fieldErrors.documentNumber)}
                aria-describedby={fieldErrors.documentNumber ? 'err-documentNumber' : undefined}
                disabled={isSubmitting}
              />
              {fieldErrors.documentNumber && (
                <span id="err-documentNumber" className="lv-intake-error-text" role="alert">
                  {fieldErrors.documentNumber}
                </span>
              )}
            </div>

            {/* Ngày cấp giấy tờ (Issuing Date) */}
            <div className={`lv-intake-field ${fieldErrors.issuingDate ? 'lv-intake-field--error' : ''}`} data-field="issuingDate">
              <label htmlFor="intake-issuing-date" className="lv-intake-label">
                <span>{t.fields.issuingDate}</span>
              </label>
              <input
                id="intake-issuing-date"
                type="date"
                className="lv-intake-input"
                value={formData.issuingDate}
                onChange={(e) => handleInputChange('issuingDate', e.target.value)}
                aria-required="false"
                aria-invalid={Boolean(fieldErrors.issuingDate)}
                aria-describedby={fieldErrors.issuingDate ? 'err-issuingDate' : undefined}
                disabled={isSubmitting}
              />
              <span className="lv-intake-field-hint">{t.fields.issuingDateNote}</span>
              {fieldErrors.issuingDate && (
                <span id="err-issuingDate" className="lv-intake-error-text" role="alert">
                  {fieldErrors.issuingDate}
                </span>
              )}
            </div>

            {/* Thời điểm Staff tiếp nhận (Intake DateTime) */}
            <div className={`lv-intake-field ${fieldErrors.intakeDateTime ? 'lv-intake-field--error' : ''}`} data-field="intakeDateTime">
              <label htmlFor="intake-datetime" className="lv-intake-label">
                <span>{t.fields.intakeDateTime}</span>
                <span className="lv-intake-required" aria-hidden="true">*</span>
              </label>
              <input
                id="intake-datetime"
                type="datetime-local"
                className="lv-intake-input"
                value={formData.intakeDateTime}
                onChange={(e) => handleInputChange('intakeDateTime', e.target.value)}
                onInput={(e) => handleInputChange('intakeDateTime', e.currentTarget.value)}
                aria-required="true"
                aria-invalid={Boolean(fieldErrors.intakeDateTime)}
                aria-describedby={fieldErrors.intakeDateTime ? 'err-intakeDateTime' : undefined}
                disabled={isSubmitting}
              />
              <span className="lv-intake-field-hint">{t.fields.intakeDateTimeNote}</span>
              {fieldErrors.intakeDateTime && (
                <span id="err-intakeDateTime" className="lv-intake-error-text" role="alert">
                  {fieldErrors.intakeDateTime}
                </span>
              )}
            </div>

            {/* Ghi chú hiện trạng bản cứng (Tùy chọn) */}
            <div className="lv-intake-field lv-intake-field--full" data-field="physicalNotes">
              <label htmlFor="intake-notes" className="lv-intake-label">
                <span>{t.fields.physicalNotes}</span>
              </label>
              <textarea
                id="intake-notes"
                className="lv-intake-textarea"
                rows={3}
                placeholder={t.fields.physicalNotesPlaceholder}
                value={formData.physicalNotes}
                onChange={(e) => handleInputChange('physicalNotes', e.target.value)}
                disabled={isSubmitting}
              />
            </div>
          </div>
        </section>

        {/* SECTION D: XEM LẠI & THAO TÁC TIẾP NHẬN */}
        <section className="lv-intake-section">
          <h2 className="lv-intake-section__title">
            <Calendar size={18} aria-hidden="true" />
            <span>{t.sections.review}</span>
          </h2>

          <div className="lv-intake-review-card">
            <h3 className="lv-intake-review-card__heading">{t.review.summaryTitle}</h3>
            <div className="lv-intake-review-list">
              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.submitterLabel}</span>
                <span className="lv-intake-review-v">
                  {formData.submitterName ? (
                    <strong>{formData.submitterName}</strong>
                  ) : (
                    <em className="lv-text-muted">{t.review.notProvided}</em>
                  )}
                  {formData.submitterPhone ? ` • ${formData.submitterPhone}` : ''}
                </span>
              </div>

              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.documentLabel}</span>
                <span className="lv-intake-review-v">
                  {t.fields.documentTypeOptions[formData.documentType] || formData.documentType}
                  {formData.documentNumber ? ` (${formData.documentNumber})` : ''}
                </span>
              </div>

              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.issuedByLabel}</span>
                <span className="lv-intake-review-v">
                  {formData.issuingAuthority || <em className="lv-text-muted">{t.review.notProvided}</em>}
                </span>
              </div>

              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.issuedDateLabel}</span>
                <span className="lv-intake-review-v">
                  {formData.issuingDate || <em className="lv-text-muted">{t.review.notProvided}</em>}
                </span>
              </div>

              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.intakeTimeLabel}</span>
                <span className="lv-intake-review-v">
                  {formData.intakeDateTime || <em className="lv-text-muted">{t.review.notProvided}</em>}
                </span>
              </div>

              <div className="lv-intake-review-row">
                <span className="lv-intake-review-k">{t.review.receiverLabel}</span>
                <span className="lv-intake-review-v">
                  <strong>{getStaffCaseTranslations(lang).roleBadge}</strong>
                  <span className="lv-intake-staff-pill">{t.fields.receiverStaffNote}</span>
                </span>
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="lv-intake-actions-bar">
            <Button
              type="button"
              variant="secondary"
              onClick={onBack}
              disabled={isSubmitting}
              className="lv-intake-cancel-btn"
            >
              {t.buttons.cancel}
            </Button>

            <Button
              type="submit"
              variant="primary"
              onClick={handleSubmit}
              isLoading={isSubmitting}
              disabled={isSubmitting}
              className="lv-intake-submit-btn"
            >
              {isSubmitting ? t.buttons.submitting : t.buttons.submit}
            </Button>
          </div>
        </section>
      </form>
    </div>
  );
}
