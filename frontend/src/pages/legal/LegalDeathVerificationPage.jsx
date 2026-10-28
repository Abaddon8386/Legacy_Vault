import { useState, useId } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  HelpCircle,
  FileText,
  UserCheck,
  Info,
} from 'lucide-react';
import {
  validateDeathVerificationForm,
} from '../../utils/legalDeathVerificationValidation.js';
import { legalI18n } from './legalI18n.js';
import './LegalDeathVerificationPage.css';

export default function LegalDeathVerificationPage({
  session,
  lang = 'vi',
}) {
  const t = legalI18n[lang] || legalI18n.vi;
  const docketRefId = useId();
  const reasonId = useId();
  const notesId = useId();

  // Form State
  const [docketReference, setDocketReference] = useState('');
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');

  // Validation feedback
  const [errors, setErrors] = useState({});
  const [validatedOnce, setValidatedOnce] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success' | 'error' | null

  const currentUserDisplay = session?.user?.fullName
    ? `${session.user.fullName} (${session.user.email})`
    : session?.user?.email || (lang === 'en' ? 'Legal Verifier' : 'Chuyên viên Pháp lý');

  const handleDecisionChange = (selected) => {
    setDecision(selected);
    if (validatedOnce) {
      const res = validateDeathVerificationForm({
        docketReference,
        decision: selected,
        reason,
        notes,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleReasonChange = (e) => {
    const val = e.target.value;
    setReason(val);
    if (validatedOnce) {
      const res = validateDeathVerificationForm({
        docketReference,
        decision,
        reason: val,
        notes,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleValidateLocal = () => {
    setValidatedOnce(true);
    const res = validateDeathVerificationForm({
      docketReference,
      decision,
      reason,
      notes,
    });
    setErrors(res.errors);
    setValidationStatus(res.isValid ? 'success' : 'error');
  };

  return (
    <div className="lv-legal-view">
      {/* Page Title Area */}
      <div className="lv-legal-title-area">
        <div>
          <h1 className="lv-legal-title">{t.pageTitle}</h1>
          <p className="lv-legal-subtitle">{t.formSubtitle}</p>
        </div>
      </div>

      {/* Critical Business Rule Warning: DMS Trigger != Death Confirmation (LV-DEATH-002) */}
      <section
        className="lv-dms-warning-banner"
        role="alert"
        aria-labelledby="dms-warning-heading"
      >
        <AlertTriangle size={24} className="lv-dms-warning-banner__icon" aria-hidden="true" />
        <div className="lv-dms-warning-banner__body">
          <h2 id="dms-warning-heading" className="lv-dms-warning-banner__title">
            {t.dmsWarningTitle}
          </h2>
          <p>{t.dmsWarningBody}</p>
        </div>
      </section>



      {/* Verification Queue Section (Explicitly Unconnected, Not Empty) */}
      <section className="lv-queue-card lv-surface-card" aria-labelledby="queue-heading">
        <div className="lv-queue-card__header">
          <h2 id="queue-heading">{t.queueSectionTitle}</h2>
        </div>
        <div className="lv-queue-status-box">
          <FileText size={28} className="lv-queue-status-icon" aria-hidden="true" />
          <h3>{t.queueUnconnectedTitle}</h3>
          <p>{t.queueUnconnectedDesc}</p>
        </div>
      </section>

      {/* Review Docket Form */}
      <section className="lv-form-card lv-surface-card" aria-labelledby="form-heading">
        <div className="lv-form-card__header">
          <h2 id="form-heading">{t.formTitle}</h2>
          <p>{t.formDesc}</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {/* Docket / Reference Identifier */}
          <div className="lv-form-group">
            <label htmlFor={docketRefId} className="lv-form-label">
              {t.docketRefLabel}
            </label>
            <span className="lv-form-hint">{t.docketRefHint}</span>
            <input
              id={docketRefId}
              type="text"
              className="lv-form-input"
              placeholder={t.docketRefPlaceholder}
              value={docketReference}
              onChange={(e) => setDocketReference(e.target.value)}
            />
          </div>

          {/* Verification Decision (APPROVE / REJECT / REQUEST_MORE_EVIDENCE) */}
          <fieldset className="lv-form-group" style={{ border: 'none', padding: 0 }}>
            <legend className="lv-form-label lv-form-label--required">
              {t.decisionLabel}
            </legend>
            <div className="lv-decision-cards-grid">
              {/* APPROVE */}
              <label
                className={`lv-decision-card lv-decision-card--approve ${
                  decision === 'APPROVE' ? 'lv-decision-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-decision"
                  value="APPROVE"
                  checked={decision === 'APPROVE'}
                  onChange={() => handleDecisionChange('APPROVE')}
                />
                <div className="lv-decision-card__head">
                  <span className="lv-decision-card__radio-circle" aria-hidden="true">
                    {decision === 'APPROVE' && <span className="lv-decision-card__radio-dot" />}
                  </span>
                  <CheckCircle2 size={18} style={{ color: '#027a48' }} aria-hidden="true" />
                  <span className="lv-decision-card__title">{t.decisionApprove}</span>
                </div>
                <span className="lv-decision-card__desc">{t.decisionApproveDesc}</span>
              </label>

              {/* REJECT */}
              <label
                className={`lv-decision-card lv-decision-card--reject ${
                  decision === 'REJECT' ? 'lv-decision-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-decision"
                  value="REJECT"
                  checked={decision === 'REJECT'}
                  onChange={() => handleDecisionChange('REJECT')}
                />
                <div className="lv-decision-card__head">
                  <span className="lv-decision-card__radio-circle" aria-hidden="true">
                    {decision === 'REJECT' && <span className="lv-decision-card__radio-dot" />}
                  </span>
                  <XCircle size={18} style={{ color: '#b42318' }} aria-hidden="true" />
                  <span className="lv-decision-card__title">{t.decisionReject}</span>
                </div>
                <span className="lv-decision-card__desc">{t.decisionRejectDesc}</span>
              </label>

              {/* REQUEST_MORE_EVIDENCE */}
              <label
                className={`lv-decision-card lv-decision-card--request ${
                  decision === 'REQUEST_MORE_EVIDENCE' ? 'lv-decision-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-decision"
                  value="REQUEST_MORE_EVIDENCE"
                  checked={decision === 'REQUEST_MORE_EVIDENCE'}
                  onChange={() => handleDecisionChange('REQUEST_MORE_EVIDENCE')}
                />
                <div className="lv-decision-card__head">
                  <span className="lv-decision-card__radio-circle" aria-hidden="true">
                    {decision === 'REQUEST_MORE_EVIDENCE' && (
                      <span className="lv-decision-card__radio-dot" />
                    )}
                  </span>
                  <HelpCircle size={18} style={{ color: '#b54708' }} aria-hidden="true" />
                  <span className="lv-decision-card__title">{t.decisionRequestEvidence}</span>
                </div>
                <span className="lv-decision-card__desc">{t.decisionRequestEvidenceDesc}</span>
              </label>
            </div>

            {errors.decision && (
              <div className="lv-form-error-msg" role="alert" style={{ marginTop: 8 }}>
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.decision] || t.validationFailure}</span>
              </div>
            )}
          </fieldset>

          {/* Verification Reason (Mandatory - not empty after trim) */}
          <div className="lv-form-group">
            <label htmlFor={reasonId} className="lv-form-label lv-form-label--required">
              {t.reasonLabel}
            </label>
            <span className="lv-form-hint">{t.reasonHint}</span>
            <textarea
              id={reasonId}
              className={`lv-form-textarea ${errors.reason ? 'lv-form-textarea--error' : ''}`}
              rows={4}
              placeholder={t.reasonPlaceholder}
              value={reason}
              onChange={handleReasonChange}
              aria-invalid={Boolean(errors.reason)}
              aria-describedby={errors.reason ? 'reason-error' : undefined}
            />
            {errors.reason && (
              <div id="reason-error" className="lv-form-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.reason] || t.validationFailure}</span>
              </div>
            )}
          </div>

          {/* Optional Additional Notes */}
          <div className="lv-form-group">
            <label htmlFor={notesId} className="lv-form-label">
              {t.notesLabel}
            </label>
            <textarea
              id={notesId}
              className="lv-form-textarea"
              rows={2}
              placeholder={t.notesPlaceholder}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {/* Review History Area */}
          <div className="lv-audit-card" aria-labelledby="audit-card-heading">
            <div className="lv-audit-card__title" id="audit-card-heading">
              <UserCheck size={16} aria-hidden="true" />
              <span>{t.reviewHistoryTitle}</span>
            </div>

            <div className="lv-audit-no-data-box">
              <Info size={16} aria-hidden="true" />
              <div>
                <strong>{t.reviewHistoryNoData}</strong>
                <p>{t.reviewHistoryDesc}</p>
              </div>
            </div>

            {session?.user && (
              <div className="lv-current-user-info">
                <span className="lv-current-user-label">{t.currentUserLabel}</span>{' '}
                <span className="lv-current-user-value">{currentUserDisplay}</span>{' '}
                <span className="lv-current-user-note">{t.currentUserNote}</span>
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
                <span>{t.btnSubmit}</span>
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
                <span>{t.validationSuccess}</span>
              </div>
            )}
            {validationStatus === 'error' && (
              <div className="lv-validation-feedback lv-validation-feedback--error" role="alert">
                <AlertTriangle size={16} aria-hidden="true" />
                <span>{t.validationFailure}</span>
              </div>
            )}
          </div>
        </form>
      </section>
    </div>
  );
}
