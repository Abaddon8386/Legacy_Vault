import { useState, useId } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  FileText,
  RefreshCw,
  ArrowRightCircle,
} from 'lucide-react';
import {
  validateStaffLegalDocumentForm,
} from '../../utils/staffLegalDocumentsValidation.js';
import { staffLegalDocumentsI18n } from './staffLegalDocumentsI18n.js';
import './StaffLegalDocumentsPage.css';

export default function StaffLegalDocumentsPage({
  lang = 'vi',
  initialDossier = null,
}) {
  const t = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;
  const issuerId = useId();
  const docNumId = useId();
  const dateId = useId();

  // Form State
  const [issuer, setIssuer] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');

  // Selected dossier/version target state
  // Explicitly reset or track target to prevent forwarding to wrong target
  const [selectedDossier, setSelectedDossier] = useState(initialDossier);

  // Validation feedback
  const [errors, setErrors] = useState({});
  const [validatedOnce, setValidatedOnce] = useState(false);
  const [validationStatus, setValidationStatus] = useState(null); // 'success' | 'error' | null

  const handleIssuerChange = (val) => {
    setIssuer(val);
    if (validatedOnce) {
      const res = validateStaffLegalDocumentForm({
        issuer: val,
        documentNumber,
        issuanceDate,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleDocNumChange = (val) => {
    setDocumentNumber(val);
    if (validatedOnce) {
      const res = validateStaffLegalDocumentForm({
        issuer,
        documentNumber: val,
        issuanceDate,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleDateChange = (val) => {
    setIssuanceDate(val);
    if (validatedOnce) {
      const res = validateStaffLegalDocumentForm({
        issuer,
        documentNumber,
        issuanceDate: val,
      });
      setErrors(res.errors);
      setValidationStatus(res.isValid ? 'success' : 'error');
    }
  };

  const handleValidateLocal = () => {
    setValidatedOnce(true);
    const res = validateStaffLegalDocumentForm({
      issuer,
      documentNumber,
      issuanceDate,
    });
    setErrors(res.errors);
    setValidationStatus(res.isValid ? 'success' : 'error');
  };

  const handleReset = () => {
    setIssuer('');
    setDocumentNumber('');
    setIssuanceDate('');
    setErrors({});
    setValidatedOnce(false);
    setValidationStatus(null);
    // Reset selected dossier target to prevent forwarding to previous target
    setSelectedDossier(initialDossier);
  };

  return (
    <div className="lv-staff-documents-view">
      {/* Page Title Area */}
      <div className="lv-staff-title-area">
        <div>
          <h1 className="lv-staff-title">{t.pageTitle}</h1>
          <p className="lv-staff-subtitle">{t.formSubtitle}</p>
        </div>
      </div>

      {/* Critical Business Rule Warning */}
      <section
        className="lv-staff-warning-banner"
        role="alert"
        aria-labelledby="staff-warning-heading"
      >
        <AlertTriangle size={24} className="lv-staff-warning-banner__icon" aria-hidden="true" />
        <div className="lv-staff-warning-banner__body">
          <h2 id="staff-warning-heading" className="lv-staff-warning-banner__title">
            {t.staffNoticeTitle}
          </h2>
          <p>{t.staffNoticeBody}</p>
        </div>
      </section>

      {/* Stored Dossier & Version Records Section */}
      <section className="lv-dossier-card" aria-labelledby="dossier-heading">
        <div className="lv-dossier-card__header">
          <h2 id="dossier-heading">{t.dossierSectionTitle}</h2>
        </div>

        {!selectedDossier?.version && (
          <div className="lv-dossier-unconnected-box">
            <FileText size={28} className="lv-dossier-unconnected-icon" aria-hidden="true" />
            <h3>{t.dossierUnconnectedTitle}</h3>
            <p>{t.dossierUnconnectedDesc}</p>
          </div>
        )}

        <div className="lv-dossier-specs-grid">
          <div className="lv-dossier-row">
            <span className="lv-dossier-label">{t.dossierVersionLabel}</span>
            {selectedDossier?.version ? (
              <span className="lv-dossier-value-badge">Phiên bản {selectedDossier.version}</span>
            ) : (
              <span className="lv-dossier-value-unloaded">{t.dossierVersionUnloaded}</span>
            )}
          </div>

          <div className="lv-dossier-row">
            <span className="lv-dossier-label">{t.dossierHashLabel}</span>
            <div
              className={`lv-hash-box ${!selectedDossier?.sha256 ? 'lv-hash-box--empty' : ''}`}
            >
              {selectedDossier?.sha256 || t.dossierHashUnloaded}
            </div>
          </div>

          <div className="lv-dossier-row">
            <span className="lv-dossier-label">{t.selectedDossierLabel}</span>
            {selectedDossier?.docketReference ? (
              <span className="lv-dossier-selected-ref">{selectedDossier.docketReference}</span>
            ) : (
              <span className="lv-dossier-value-unloaded">{t.selectedDossierUnloaded}</span>
            )}
          </div>
        </div>
      </section>

      {/* Document Metadata Form */}
      <section className="lv-form-card" aria-labelledby="form-heading">
        <div className="lv-form-card__header">
          <h2 id="form-heading">{t.formTitle}</h2>
          <p>{t.formDesc}</p>
        </div>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {/* Issuing Authority */}
          <div className="lv-form-group">
            <label htmlFor={issuerId} className="lv-form-label lv-form-label--required">
              {t.issuerLabel}
            </label>
            <span className="lv-form-hint">{t.issuerHint}</span>
            <input
              id={issuerId}
              type="text"
              className="lv-form-input"
              placeholder={t.issuerPlaceholder}
              value={issuer}
              onChange={(e) => handleIssuerChange(e.target.value)}
            />
            {errors.issuer && (
              <div className="lv-form-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.issuer] || errors.issuer}</span>
              </div>
            )}
          </div>

          {/* Document Number */}
          <div className="lv-form-group">
            <label htmlFor={docNumId} className="lv-form-label lv-form-label--required">
              {t.documentNumberLabel}
            </label>
            <span className="lv-form-hint">{t.documentNumberHint}</span>
            <input
              id={docNumId}
              type="text"
              className="lv-form-input"
              placeholder={t.documentNumberPlaceholder}
              value={documentNumber}
              onChange={(e) => handleDocNumChange(e.target.value)}
            />
            {errors.documentNumber && (
              <div className="lv-form-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.documentNumber] || errors.documentNumber}</span>
              </div>
            )}
          </div>

          {/* Issuance Date */}
          <div className="lv-form-group">
            <label htmlFor={dateId} className="lv-form-label lv-form-label--required">
              {t.issuanceDateLabel}
            </label>
            <span className="lv-form-hint">{t.issuanceDateHint}</span>
            <input
              id={dateId}
              type="date"
              className="lv-form-input"
              value={issuanceDate}
              onChange={(e) => handleDateChange(e.target.value)}
            />
            {errors.issuanceDate && (
              <div className="lv-form-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.issuanceDate] || errors.issuanceDate}</span>
              </div>
            )}
          </div>

          {/* Action Buttons */}
          <div className="lv-form-actions">
            <div className="lv-form-actions__row">
              <button
                type="button"
                className="lv-btn-forward-disabled"
                disabled={true}
                title={t.btnForwardHelper}
                aria-label={t.btnForwardToLegal}
                aria-disabled="true"
              >
                <ArrowRightCircle size={16} aria-hidden="true" />
                <span>{t.btnForwardToLegal}</span>
              </button>

              <button
                type="button"
                className="lv-btn-validate-local"
                onClick={handleValidateLocal}
              >
                <span>{t.btnValidateForm}</span>
              </button>

              <button
                type="button"
                className="lv-btn-reset"
                onClick={handleReset}
              >
                <RefreshCw size={14} style={{ display: 'inline', marginRight: 4 }} aria-hidden="true" />
                <span>{t.btnReset}</span>
              </button>
            </div>

            <div className="lv-action-helper-notice" role="status">
              <ShieldAlert size={15} flexShrink={0} aria-hidden="true" />
              <span>{t.btnForwardHelper}</span>
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
