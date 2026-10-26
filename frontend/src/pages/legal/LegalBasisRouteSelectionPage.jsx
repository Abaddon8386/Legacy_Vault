import { useState, useId } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  FileText,
  UserCheck,
  Info,
  Building2,
  Scale,
  PauseCircle,
} from 'lucide-react';
import {
  validateBasisRouteForm,
} from '../../utils/legalBasisRouteValidation.js';
import { legalBasisRouteI18n } from './legalBasisRouteI18n.js';
import './LegalBasisRouteSelectionPage.css';

export default function LegalBasisRouteSelectionPage({
  session,
  lang = 'vi',
  initialDocket = null,
}) {
  const t = legalBasisRouteI18n[lang] || legalBasisRouteI18n.vi;
  const docketRefId = useId();
  const reasonId = useId();

  // Form State
  const [docketReference, setDocketReference] = useState(
    initialDocket?.docketReference || ''
  );
  const [route, setRoute] = useState('');
  const [reason, setReason] = useState('');

  // Validation feedback
  const [errors, setErrors] = useState({});
  const [validatedOnce, setValidatedOnce] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success' | 'error' | null

  const currentUserDisplay = session?.user?.fullName
    ? `${session.user.fullName} (${session.user.email})`
    : session?.user?.email || (lang === 'en' ? 'Legal Verifier' : 'Chuyên viên Pháp lý');

  const handleRouteChange = (selectedRoute) => {
    setRoute(selectedRoute);
    if (validatedOnce) {
      const res = validateBasisRouteForm({
        docketReference,
        route: selectedRoute,
        reason,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleReasonChange = (newReason) => {
    setReason(newReason);
    if (validatedOnce) {
      const res = validateBasisRouteForm({
        docketReference,
        route,
        reason: newReason,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleValidateLocal = () => {
    setValidatedOnce(true);
    const res = validateBasisRouteForm({
      docketReference,
      route,
      reason,
    });
    setErrors(res.errors);
    setValidationStatus(res.isValid ? 'success' : 'error');
  };

  return (
    <div className="lv-basis-route-view">
      {/* Page Title Area */}
      <div className="lv-legal-title-area">
        <div>
          <h1 className="lv-legal-title">{t.pageTitle}</h1>
          <p className="lv-legal-subtitle">{t.formSubtitle}</p>
        </div>
      </div>

      {/* Critical Business Rule Warning: Route selection != State modification (LV-BASIS-001) */}
      <section
        className="lv-basis-warning-banner"
        role="alert"
        aria-labelledby="basis-warning-heading"
      >
        <AlertTriangle size={24} className="lv-basis-warning-banner__icon" aria-hidden="true" />
        <div className="lv-basis-warning-banner__body">
          <h2 id="basis-warning-heading" className="lv-basis-warning-banner__title">
            {t.basisNoticeTitle}
          </h2>
          <p>{t.basisNoticeBody}</p>
        </div>
      </section>

      {/* Docket Metadata & Server State Section */}
      <section className="lv-docket-card" aria-labelledby="docket-heading">
        <div className="lv-docket-card__header">
          <h2 id="docket-heading">{t.docketSectionTitle}</h2>
        </div>

        {!initialDocket?.status && (
          <div className="lv-docket-unconnected-box">
            <FileText size={28} className="lv-docket-unconnected-icon" aria-hidden="true" />
            <h3>{t.docketUnconnectedTitle}</h3>
            <p>{t.docketUnconnectedDesc}</p>
          </div>
        )}

        <div className="lv-docket-specs-grid">
          <div className="lv-docket-row">
            <span className="lv-docket-label">{t.recordedStatusLabel}</span>
            <div className="lv-docket-status-wrap">
              {initialDocket?.status ? (
                <span className="lv-docket-value-badge">{initialDocket.status}</span>
              ) : (
                <span className="lv-docket-value-unloaded">{t.recordedStatusUnloaded}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Basis Route Selection Form */}
      <section className="lv-form-card" aria-labelledby="form-heading">
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

          {/* Basis Route Choice Cards (NOTARIAL, COURT, ON_HOLD) */}
          <fieldset className="lv-form-group" style={{ border: 'none', padding: 0 }}>
            <legend className="lv-form-label lv-form-label--required">
              {t.routeGroupLabel}
            </legend>
            <div className="lv-route-cards-grid">
              {/* NOTARIAL (Công chứng) */}
              <label
                className={`lv-route-card lv-route-card--notarial ${
                  route === 'NOTARIAL' ? 'lv-route-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-basis-route"
                  value="NOTARIAL"
                  checked={route === 'NOTARIAL'}
                  onChange={() => handleRouteChange('NOTARIAL')}
                />
                <div className="lv-route-card__head">
                  <span className="lv-route-card__radio-circle" aria-hidden="true">
                    {route === 'NOTARIAL' && <span className="lv-route-card__radio-dot" />}
                  </span>
                  <Building2 size={18} style={{ color: '#164639' }} aria-hidden="true" />
                  <span className="lv-route-card__title">{t.routeNotarialTitle}</span>
                </div>
                <span className="lv-route-card__desc">{t.routeNotarialDesc}</span>
              </label>

              {/* COURT (Tòa án) */}
              <label
                className={`lv-route-card lv-route-card--court ${
                  route === 'COURT' ? 'lv-route-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-basis-route"
                  value="COURT"
                  checked={route === 'COURT'}
                  onChange={() => handleRouteChange('COURT')}
                />
                <div className="lv-route-card__head">
                  <span className="lv-route-card__radio-circle" aria-hidden="true">
                    {route === 'COURT' && <span className="lv-route-card__radio-dot" />}
                  </span>
                  <Scale size={18} style={{ color: '#b5832a' }} aria-hidden="true" />
                  <span className="lv-route-card__title">{t.routeCourtTitle}</span>
                </div>
                <span className="lv-route-card__desc">{t.routeCourtDesc}</span>
              </label>

              {/* ON_HOLD (Tạm dừng xử lý) */}
              <label
                className={`lv-route-card lv-route-card--onhold ${
                  route === 'ON_HOLD' ? 'lv-route-card--active' : ''
                }`}
              >
                <input
                  type="radio"
                  name="legal-basis-route"
                  value="ON_HOLD"
                  checked={route === 'ON_HOLD'}
                  onChange={() => handleRouteChange('ON_HOLD')}
                />
                <div className="lv-route-card__head">
                  <span className="lv-route-card__radio-circle" aria-hidden="true">
                    {route === 'ON_HOLD' && <span className="lv-route-card__radio-dot" />}
                  </span>
                  <PauseCircle size={18} style={{ color: '#6b726b' }} aria-hidden="true" />
                  <span className="lv-route-card__title">{t.routeOnHoldTitle}</span>
                </div>
                <span className="lv-route-card__desc">{t.routeOnHoldDesc}</span>
              </label>
            </div>

            {errors.route && (
              <div className="lv-form-error-msg" role="alert" style={{ marginTop: 8 }}>
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.route] || t.validationFailure}</span>
              </div>
            )}
          </fieldset>

          {/* Adjudication Rationale (Required, non-empty after trim) */}
          <div className="lv-form-group">
            <label htmlFor={reasonId} className="lv-form-label lv-form-label--required">
              {t.reasonLabel}
            </label>
            <span className="lv-form-hint">{t.reasonHint}</span>
            <textarea
              id={reasonId}
              className="lv-form-textarea"
              rows={4}
              placeholder={t.reasonPlaceholder}
              value={reason}
              onChange={(e) => handleReasonChange(e.target.value)}
            />
            {errors.reason && (
              <div className="lv-form-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.reason] || t.validationFailure}</span>
              </div>
            )}
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
