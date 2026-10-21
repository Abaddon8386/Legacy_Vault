import { useState, useId } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  FileText,
  UserCheck,
  Info,
} from 'lucide-react';
import {
  validateWillVerificationForm,
} from '../../utils/legalWillVerificationValidation.js';
import { legalI18n } from './legalI18n.js';
import './LegalWillDocumentVerificationPage.css';

export default function LegalWillDocumentVerificationPage({
  session,
  lang = 'vi',
  initialDoc = null,
}) {
  const t = legalI18n[lang] || legalI18n.vi;
  const docketRefId = useId();
  const notesId = useId();

  // Form State
  const [docketReference, setDocketReference] = useState(
    initialDoc?.docketReference || ''
  );
  const [comparison, setComparison] = useState('');
  const [notes, setNotes] = useState('');

  // Validation feedback
  const [errors, setErrors] = useState({});
  const [validatedOnce, setValidatedOnce] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success' | 'error' | null

  const currentUserDisplay = session?.user?.fullName
    ? `${session.user.fullName} (${session.user.email})`
    : session?.user?.email || (lang === 'en' ? 'Legal Verifier' : 'Chuyên viên Pháp lý');

  const handleComparisonChange = (selected) => {
    setComparison(selected);
    if (validatedOnce) {
      const res = validateWillVerificationForm({
        docketReference,
        comparison: selected,
        notes,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleValidateLocal = () => {
    setValidatedOnce(true);
    const res = validateWillVerificationForm({
      docketReference,
      comparison,
      notes,
    });
    setErrors(res.errors);
    setValidationStatus(res.isValid ? 'success' : 'error');
  };

  return (
    <div className="lv-will-verification-view">
      {/* Page Title Area */}
      <div className="lv-legal-title-area">
        <div>
          <h1 className="lv-legal-title">{t.willPageTitle || t.pageTitle}</h1>
          <p className="lv-legal-subtitle">{t.willFormSubtitle || t.formSubtitle}</p>
        </div>
      </div>

      {/* Critical Business Rule Warning: Comparison != Legal Approved (LV-WILL-001) */}
      <section
        className="lv-will-warning-banner"
        role="alert"
        aria-labelledby="will-warning-heading"
      >
        <AlertTriangle size={24} className="lv-will-warning-banner__icon" aria-hidden="true" />
        <div className="lv-will-warning-banner__body">
          <h2 id="will-warning-heading" className="lv-will-warning-banner__title">
            {t.willNoticeTitle}
          </h2>
          <p>{t.willNoticeBody}</p>
        </div>
      </section>

      {/* Digitized Record Metadata Section */}
      <section className="lv-metadata-card" aria-labelledby="metadata-heading">
        <div className="lv-metadata-card__header">
          <h2 id="metadata-heading">{t.willQueueSectionTitle || t.queueSectionTitle}</h2>
        </div>

        {!initialDoc?.sha256 && (
          <div className="lv-metadata-unconnected-box">
            <FileText size={28} className="lv-metadata-unconnected-icon" aria-hidden="true" />
            <h3>{t.willQueueUnconnectedTitle || t.queueUnconnectedTitle}</h3>
            <p>{t.willQueueUnconnectedDesc || t.queueUnconnectedDesc}</p>
          </div>
        )}

        <div className="lv-metadata-specs-grid">
          <div className="lv-metadata-row">
            <span className="lv-metadata-label">{t.docVersionLabel}</span>
            {initialDoc?.version ? (
              <span className="lv-metadata-value-badge">Phiên bản {initialDoc.version}</span>
            ) : (
              <span className="lv-metadata-value-unloaded">{t.docVersionUnloaded}</span>
            )}
          </div>

          <div className="lv-hash-box-wrap">
            <span className="lv-metadata-label">{t.docHashLabel}</span>
            <span className="lv-form-hint">{t.docHashHint}</span>
            <div
              className={`lv-hash-box ${!initialDoc?.sha256 ? 'lv-hash-box--empty' : ''}`}
              title={initialDoc?.sha256 ? 'SHA-256 Hash' : undefined}
            >
              {initialDoc?.sha256 || t.docHashUnloaded}
            </div>
          </div>
        </div>
      </section>

      {/* Comparison Docket Form */}
      <section className="lv-form-card" aria-labelledby="form-heading">
        <div className="lv-form-card__header">
          <h2 id="form-heading">{t.willFormTitle || t.formTitle}</h2>
          <p>{t.willFormDesc || t.formDesc}</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {/* Docket / Reference Identifier */}
          <div className="lv-form-group">
            <label htmlFor={docketRefId} className="lv-form-label">
              {t.docketRefLabel}
            </label>
            <span className="lv-form-hint">{t.willDocketRefHint || t.docketRefHint}</span>
            <input
              id={docketRefId}
              type="text"
              className="lv-form-input"
              placeholder={t.willDocketRefPlaceholder || t.docketRefPlaceholder}
              value={docketReference}
              onChange={(e) => setDocketReference(e.target.value)}
            />
          </div>

          {/* Comparison Result (MATCH / MISMATCH) */}
          <fieldset className="lv-form-group" style={{ border: 'none', padding: 0 }}>
            <legend className="lv-form-label lv-form-label--required">
              {t.comparisonLabel}
            </legend>
            <div className="lv-comparison-cards-grid">
              {/* MATCH (Khớp) */}
              <label
                className={`lv-comparison-card lv-comparison-card--match ${
                  comparison === 'MATCH' ? 'lv-comparison-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="will-comparison-decision"
                  value="MATCH"
                  checked={comparison === 'MATCH'}
                  onChange={() => handleComparisonChange('MATCH')}
                />
                <div className="lv-comparison-card__head">
                  <span className="lv-comparison-card__radio-circle" aria-hidden="true">
                    {comparison === 'MATCH' && <span className="lv-comparison-card__radio-dot" />}
                  </span>
                  <CheckCircle2 size={18} style={{ color: '#027a48' }} aria-hidden="true" />
                  <span className="lv-comparison-card__title">{t.comparisonMatch}</span>
                </div>
                <span className="lv-comparison-card__desc">{t.comparisonMatchDesc}</span>
              </label>

              {/* MISMATCH (Không khớp) */}
              <label
                className={`lv-comparison-card lv-comparison-card--mismatch ${
                  comparison === 'MISMATCH' ? 'lv-comparison-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="will-comparison-decision"
                  value="MISMATCH"
                  checked={comparison === 'MISMATCH'}
                  onChange={() => handleComparisonChange('MISMATCH')}
                />
                <div className="lv-comparison-card__head">
                  <span className="lv-comparison-card__radio-circle" aria-hidden="true">
                    {comparison === 'MISMATCH' && <span className="lv-comparison-card__radio-dot" />}
                  </span>
                  <XCircle size={18} style={{ color: '#b42318' }} aria-hidden="true" />
                  <span className="lv-comparison-card__title">{t.comparisonMismatch}</span>
                </div>
                <span className="lv-comparison-card__desc">{t.comparisonMismatchDesc}</span>
              </label>
            </div>

            {errors.comparison && (
              <div className="lv-form-error-msg" role="alert" style={{ marginTop: 8 }}>
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.comparison] || errors.comparison}</span>
              </div>
            )}
          </fieldset>

          {/* Optional Comparison Notes */}
          <div className="lv-form-group">
            <label htmlFor={notesId} className="lv-form-label">
              {t.willNotesLabel || t.notesLabel}
            </label>
            <textarea
              id={notesId}
              className="lv-form-textarea"
              rows={3}
              placeholder={t.willNotesPlaceholder || t.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Review History Area */}
          <div className="lv-audit-card" aria-labelledby="audit-card-heading">
            <div className="lv-audit-card__title" id="audit-card-heading">
              <UserCheck size={16} aria-hidden="true" />
              <span>{t.willReviewHistoryTitle || t.reviewHistoryTitle}</span>
            </div>

            <div className="lv-audit-no-data-box">
              <Info size={16} aria-hidden="true" />
              <div>
                <strong>{t.willReviewHistoryNoData || t.reviewHistoryNoData}</strong>
                <p>{t.willReviewHistoryDesc || t.reviewHistoryDesc}</p>
              </div>
            </div>

            {session?.user && (
              <div className="lv-current-user-info">
                <span className="lv-current-user-label">{t.willCurrentUserLabel || t.currentUserLabel}</span>{' '}
                <span className="lv-current-user-value">{currentUserDisplay}</span>{' '}
                <span className="lv-current-user-note">{t.willCurrentUserNote || t.currentUserNote}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="lv-form-actions">
            <div className="lv-form-actions__row">
              <button
                type="button"
                className="lv-btn-submit-disabled"
                disabled={true}
                title={t.btnSubmitHelper}
                aria-disabled="true"
              >
                <ShieldAlert size={16} aria-hidden="true" />
                <span>{t.willBtnSubmit || t.btnSubmit}</span>
              </button>

              <button
                type="button"
                className="lv-btn-validate-local"
                onClick={handleValidateLocal}
              >
                <span>{t.btnValidateLocal}</span>
              </button>
            </div>

            <div className="lv-action-helper-notice" role="status">
              <AlertTriangle size={15} flexShrink={0} aria-hidden="true" />
              <span>{t.btnSubmitHelper}</span>
            </div>

            {/* Local Validation Feedback */}
            {validationStatus === 'success' && (
              <div className="lv-validation-feedback lv-validation-feedback--success" role="status">
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{t.willValidationSuccess || t.validationSuccess}</span>
              </div>
            )}
            {validationStatus === 'error' && (
              <div className="lv-validation-feedback lv-validation-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{t.willValidationFailure || t.validationFailure}</span>
              </div>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
