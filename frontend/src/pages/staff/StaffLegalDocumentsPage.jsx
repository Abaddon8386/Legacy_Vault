import { useState, useId, useEffect, useRef } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  RefreshCw,
  ArrowRightCircle,
  Clock,
  Send,
  Search,
  Hash,
  Scale,
  Sparkles,
} from 'lucide-react';
import EvidenceFileUploader from '../../components/common/EvidenceFileUploader.jsx';
import {
  validateStaffLegalDocumentForm,
} from '../../utils/staffLegalDocumentsValidation.js';
import {
  fetchBasisDossier,
  uploadBasisVersion,
  forwardBasisVersion,
} from './staffLegalDocumentsService.js';
import { staffLegalDocumentsI18n } from './staffLegalDocumentsI18n.js';
import './StaffLegalDocumentsPage.css';

export default function StaffLegalDocumentsPage({
  lang = 'vi',
  accessToken = null,
  isDevPreview = false,
  caseId: propCaseId = '',
  initialDossier = null,
  onCaseChange,
}) {
  const t = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;

  const caseInputId = useId();
  const issuerId = useId();
  const docNumId = useId();
  const dateId = useId();
  const typeId = useId();
  const notaryOrgId = useId();
  const notaryNumId = useId();
  const notarizedAtId = useId();
  const evidenceRefId = useId();
  const notesId = useId();

  // Case Selection
  const [selectedCaseId, setSelectedCaseId] = useState(propCaseId || '6f1a4c2d-0000-4000-8000-000000000001');
  const [inputCaseId, setInputCaseId] = useState(propCaseId || '6f1a4c2d-0000-4000-8000-000000000001');

  // Dossier State
  const [dossier, setDossier] = useState(initialDossier);
  const [isDossierLoading, setIsDossierLoading] = useState(false);
  const [dossierNotFound, setDossierNotFound] = useState(false);
  const [dossierError, setDossierError] = useState(null);

  // Form State
  const [legalBasisType, setLegalBasisType] = useState('NOTARIAL_PARTITION');
  const [issuer, setIssuer] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [notaryAuthority, setNotaryAuthority] = useState('');
  const [notarialDocumentNumber, setNotarialDocumentNumber] = useState('');
  const [notarizedAt, setNotarizedAt] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);

  // Action / Feedback State
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [errors, setErrors] = useState({});
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  const activeAbortController = useRef(null);

  // Tự động load dossier khi selectedCaseId thay đổi
  useEffect(() => {
    if (activeAbortController.current) {
      activeAbortController.current.abort();
    }
    const controller = new AbortController();
    activeAbortController.current = controller;

    let active = true;

    async function load() {
      if (!selectedCaseId) {
        if (active) {
          setDossier(null);
          setDossierNotFound(false);
        }
        return;
      }

      setIsDossierLoading(true);
      setDossierError(null);
      setDossierNotFound(false);
      setActionSuccess(null);
      setActionError(null);

      try {
        const result = await fetchBasisDossier(selectedCaseId, {
          accessToken,
          isDevPreview,
          lang,
          signal: controller.signal,
        });

        if (active) {
          if (result.notFound || !result.dossier) {
            setDossier(null);
            setDossierNotFound(true);
          } else {
            setDossier(result.dossier);
            setDossierNotFound(false);
            // Cập nhật default legalBasisType theo route của dossier
            if (result.dossier.route === 'NOTARIAL') {
              setLegalBasisType('NOTARIAL_PARTITION');
            } else if (result.dossier.route === 'COURT') {
              setLegalBasisType('COURT_JUDGMENT');
            }
          }
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') {
          setDossier(null);
          setDossierError(err.message || 'Không thể tải hồ sơ căn cứ pháp lý.');
        }
      } finally {
        if (active) {
          setIsDossierLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCaseId, accessToken, isDevPreview, lang]);

  const handleCaseSubmit = (e) => {
    e.preventDefault();
    const trimmed = inputCaseId.trim();
    if (!trimmed) return;
    setSelectedCaseId(trimmed);
    if (onCaseChange) {
      onCaseChange(trimmed);
    }
  };

  const handleResetForm = () => {
    setIssuer('');
    setDocumentNumber('');
    setIssuanceDate('');
    setNotaryAuthority('');
    setNotarialDocumentNumber('');
    setNotarizedAt('');
    setEvidenceReference('');
    setNotes('');
    setEvidenceFile(null);
    setUploadProgress(null);
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
  };

  // Submit phiên bản mới
  const handleSubmitVersion = async (e) => {
    e.preventDefault();
    if (isSubmitting || isForwarding) return;

    setActionSuccess(null);
    setActionError(null);

    const validation = validateStaffLegalDocumentForm({
      issuer,
      documentNumber,
      issuanceDate,
      legalBasisType,
      notaryAuthority,
      notarialDocumentNumber,
      notarizedAt,
      file: evidenceFile,
    }, { lang, requireFile: true });

    if (!validation.isValid) {
      setErrors(validation.errors);
      return;
    }
    setErrors({});

    const metadata = {
      legalBasisType,
      issuingAuthority: issuer.trim(),
      documentNumber: documentNumber.trim(),
      issueDate: issuanceDate,
      notaryAuthority: legalBasisType === 'NOTARIAL_PARTITION' ? (notaryAuthority?.trim() || null) : null,
      notarialDocumentNumber: legalBasisType === 'NOTARIAL_PARTITION' ? (notarialDocumentNumber?.trim() || null) : null,
      notarizedAt: legalBasisType === 'NOTARIAL_PARTITION' ? (notarizedAt || null) : null,
      evidenceReference: evidenceReference?.trim() || null,
      notes: notes?.trim() || null,
      allocations: [],
    };

    setIsSubmitting(true);
    try {
      const updatedDossier = await uploadBasisVersion(selectedCaseId, {
        metadata,
        file: evidenceFile,
      }, {
        accessToken,
        isDevPreview,
        lang,
        onProgress: setUploadProgress,
      });

      setDossier(updatedDossier);
      setActionSuccess(t.uploadSuccessNotice);
      // Reset form sau khi nộp thành công
      handleResetForm();
    } catch (err) {
      setActionError(err.message || t.uploadFailed);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Forward phiên bản mới nhất cho Ban Pháp lý
  const handleForwardToLegal = async () => {
    if (isForwarding || isSubmitting) return;

    const latestVersion = dossier?.versions?.[0];
    if (!latestVersion || latestVersion.forwardStatus === 'FORWARDED') return;

    setIsForwarding(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const updatedDossier = await forwardBasisVersion(selectedCaseId, latestVersion.version, {
        accessToken,
        isDevPreview,
        lang,
      });
      setDossier(updatedDossier);
      setActionSuccess(t.forwardSuccessNotice);
    } catch (err) {
      if (err.code === 'BASIS_VERSION_STALE') {
        setActionError(t.versionStaleError);
      } else {
        setActionError(err.message || t.forwardSuccessNotice);
      }
    } finally {
      setIsForwarding(false);
    }
  };

  const latestVersion = dossier?.versions?.[0] || null;
  const isRouteNotarial = dossier?.route === 'NOTARIAL';
  const isRouteCourt = dossier?.route === 'COURT';
  const isRouteOnHold = dossier?.route === 'ON_HOLD';

  const canForward = dossier &&
    dossier.status === 'LEGAL_BASIS_PROVIDED' &&
    latestVersion &&
    latestVersion.forwardStatus !== 'FORWARDED' &&
    !isForwarding &&
    !isSubmitting;

  return (
    <div className="lv-staff-documents-view">
      {/* Dev preview banner */}
      {isDevPreview && !accessToken && (
        <div className="lv-staff-preview-banner" role="status">
          <Sparkles size={18} className="lv-staff-preview-banner__icon" aria-hidden="true" />
          <div>
            <span className="lv-staff-preview-banner__badge">{t.previewBannerLabel}</span>
            <span className="lv-staff-preview-banner__text">{t.previewBannerDesc}</span>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="lv-staff-title-area">
        <div>
          <h1 className="lv-staff-title">{t.pageTitle}</h1>
          <p className="lv-staff-subtitle">{t.formSubtitle}</p>
        </div>
      </div>

      {/* Business Notice */}
      <section className="lv-staff-warning-banner" role="alert" aria-labelledby="staff-warning-heading">
        <AlertTriangle size={24} className="lv-staff-warning-banner__icon" aria-hidden="true" />
        <div className="lv-staff-warning-banner__body">
          <h2 id="staff-warning-heading" className="lv-staff-warning-banner__title">
            {t.staffNoticeTitle}
          </h2>
          <p>{t.staffNoticeBody}</p>
        </div>
      </section>

      {/* Case Selector */}
      <section className="lv-dossier-card" aria-labelledby="case-select-heading">
        <div className="lv-dossier-card__header">
          <h2 id="case-select-heading">{t.caseSelectTitle}</h2>
        </div>
        <form onSubmit={handleCaseSubmit} className="lv-case-select-form">
          <div className="lv-case-select-bar">
            <label htmlFor={caseInputId} className="visually-hidden">
              {t.caseSelectLabel}
            </label>
            <div className="lv-case-input-wrapper">
              <Search size={16} className="lv-case-input-icon" aria-hidden="true" />
              <input
                id={caseInputId}
                type="text"
                className="lv-form-input lv-case-input"
                placeholder={t.caseSelectPlaceholder}
                value={inputCaseId}
                onChange={(e) => setInputCaseId(e.target.value)}
              />
            </div>
            <button
              type="submit"
              className="lv-btn-load-case"
              disabled={isDossierLoading || !inputCaseId.trim()}
            >
              {isDossierLoading ? (
                <>
                  <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
                  <span>{t.loadingDossier}</span>
                </>
              ) : (
                <span>{t.btnLoadDossier}</span>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* Dossier Status & Stored Versions */}
      <section className="lv-dossier-card" aria-labelledby="dossier-heading">
        <div className="lv-dossier-card__header">
          <h2 id="dossier-heading">{t.dossierSectionTitle}</h2>
          {dossier && (
            <span className={`lv-dossier-status-pill lv-dossier-status-pill--${dossier.status.toLowerCase()}`}>
              {dossier.status === 'LEGAL_BASIS_FORWARDED' ? t.statusForwarded :
                dossier.status === 'LEGAL_BASIS_PROVIDED' ? t.statusProvided :
                dossier.status === 'DRAFT' ? t.statusDraft : t.statusOnHold}
            </span>
          )}
        </div>

        {dossierNotFound && (
          <div className="lv-dossier-unconnected-box" role="status">
            <Scale size={32} className="lv-dossier-unconnected-icon" aria-hidden="true" />
            <h3>{t.awaitingLegalDossierTitle}</h3>
            <p>{t.awaitingLegalDossierDesc}</p>
          </div>
        )}

        {dossierError && (
          <div className="lv-form-error-banner" role="alert">
            <AlertTriangle size={18} aria-hidden="true" />
            <span>{dossierError}</span>
          </div>
        )}

        {isRouteOnHold && (
          <div className="lv-dossier-hold-banner" role="alert">
            <Clock size={20} className="lv-dossier-hold-icon" aria-hidden="true" />
            <div>
              <strong>{t.dossierOnHoldTitle}</strong>
              <p>{t.dossierOnHoldDesc}</p>
            </div>
          </div>
        )}

        {dossier && (
          <div className="lv-dossier-specs-grid">
            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.routeLabel}</span>
              <span className="lv-dossier-value-badge lv-dossier-value-badge--route">
                {isRouteNotarial ? t.routeNotarial : isRouteCourt ? t.routeCourt : t.routeOnHold}
              </span>
            </div>

            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.dossierVersionLabel}</span>
              {latestVersion ? (
                <span className="lv-dossier-value-badge">
                  Phiên bản {latestVersion.version}
                </span>
              ) : (
                <span className="lv-dossier-value-unloaded">{t.dossierVersionUnloaded}</span>
              )}
            </div>

            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.dossierHashLabel}</span>
              <div className={`lv-hash-box ${!latestVersion?.sha256 ? 'lv-hash-box--empty' : ''}`}>
                <Hash size={13} aria-hidden="true" />
                <span>{latestVersion?.sha256 || t.dossierHashUnloaded}</span>
              </div>
            </div>

            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.forwardStatusLabel}</span>
              {latestVersion?.forwardStatus === 'FORWARDED' ? (
                <span className="lv-forward-badge lv-forward-badge--forwarded">
                  <CheckCircle2 size={13} aria-hidden="true" />
                  <span>{t.forwardStatusForwarded}</span>
                </span>
              ) : (
                <span className="lv-forward-badge lv-forward-badge--pending">
                  <Clock size={13} aria-hidden="true" />
                  <span>{t.forwardStatusNotForwarded}</span>
                </span>
              )}
            </div>

            {latestVersion?.forwardedAt && (
              <div className="lv-dossier-row">
                <span className="lv-dossier-label">{t.forwardedAtLabel}</span>
                <span className="lv-dossier-date">
                  {new Date(latestVersion.forwardedAt).toLocaleString(lang === 'en' ? 'en-US' : 'vi-VN')}
                </span>
              </div>
            )}
          </div>
        )}

        {/* Forward to Legal Action Bar */}
        {dossier && !dossierNotFound && !isRouteOnHold && (
          <div className="lv-forward-action-bar">
            {latestVersion?.forwardStatus === 'FORWARDED' ? (
              <div className="lv-forward-completed-msg" role="status">
                <CheckCircle2 size={18} className="lv-success-icon" aria-hidden="true" />
                <span>{t.dossierAlreadyForwardedNotice}</span>
              </div>
            ) : (
              <button
                type="button"
                className={`lv-btn-forward ${canForward ? 'lv-btn-forward--active' : 'lv-btn-forward--disabled'}`}
                disabled={!canForward}
                onClick={handleForwardToLegal}
                aria-label={t.btnForwardToLegal}
              >
                {isForwarding ? (
                  <>
                    <RefreshCw size={16} className="lv-spin" aria-hidden="true" />
                    <span>{t.forwardingToLegal}</span>
                  </>
                ) : (
                  <>
                    <ArrowRightCircle size={16} aria-hidden="true" />
                    <span>{t.btnForwardToLegal}</span>
                  </>
                )}
              </button>
            )}
            {!canForward && latestVersion?.forwardStatus !== 'FORWARDED' && (
              <span className="lv-forward-helper-text">
                <ShieldAlert size={14} aria-hidden="true" />
                <span>{t.btnForwardHelper}</span>
              </span>
            )}
          </div>
        )}
      </section>

      {/* Action Feedback Banner */}
      {actionSuccess && (
        <div className="lv-form-success-banner" role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          <span>{actionSuccess}</span>
        </div>
      )}

      {actionError && (
        <div className="lv-form-error-banner" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}

      {/* Intake Document Form */}
      {dossier && !dossierNotFound && !isRouteOnHold && (
        <section className="lv-form-card" aria-labelledby="form-heading">
          <div className="lv-form-card__header">
            <h2 id="form-heading">{t.formTitle}</h2>
            <p>{t.formDesc}</p>
          </div>

          <form onSubmit={handleSubmitVersion} noValidate>
            {/* Legal Basis Type */}
            <div className="lv-form-group">
              <label htmlFor={typeId} className="lv-form-label lv-form-label--required">
                {t.legalBasisTypeLabel}
              </label>
              <select
                id={typeId}
                className="lv-form-input"
                value={legalBasisType}
                onChange={(e) => setLegalBasisType(e.target.value)}
                disabled={isSubmitting || isRouteNotarial}
              >
                {isRouteNotarial ? (
                  <option value="NOTARIAL_PARTITION">{t.typeNotarialPartition}</option>
                ) : (
                  <>
                    <option value="COURT_JUDGMENT">{t.typeCourtJudgment}</option>
                    <option value="COURT_DECISION">{t.typeCourtDecision}</option>
                  </>
                )}
              </select>
            </div>

            {/* Issuing Authority */}
            <div className="lv-form-group">
              <label htmlFor={issuerId} className="lv-form-label lv-form-label--required">
                {t.issuerLabel}
              </label>
              <span className="lv-form-hint">{t.issuerHint}</span>
              <input
                id={issuerId}
                type="text"
                className={`lv-form-input ${errors.issuer ? 'lv-form-input--error' : ''}`}
                placeholder={t.issuerPlaceholder}
                value={issuer}
                onChange={(e) => setIssuer(e.target.value)}
                disabled={isSubmitting}
              />
              {errors.issuer && (
                <div className="lv-form-error-msg" role="alert">
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{t[errors.issuer] || errors.issuer}</span>
                </div>
              )}
            </div>

            {/* Document Number & Issuance Date Grid */}
            <div className="lv-form-row-grid">
              <div className="lv-form-group">
                <label htmlFor={docNumId} className="lv-form-label lv-form-label--required">
                  {t.documentNumberLabel}
                </label>
                <input
                  id={docNumId}
                  type="text"
                  className={`lv-form-input ${errors.documentNumber ? 'lv-form-input--error' : ''}`}
                  placeholder={t.documentNumberPlaceholder}
                  value={documentNumber}
                  onChange={(e) => setDocumentNumber(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.documentNumber && (
                  <div className="lv-form-error-msg" role="alert">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>{t[errors.documentNumber] || errors.documentNumber}</span>
                  </div>
                )}
              </div>

              <div className="lv-form-group">
                <label htmlFor={dateId} className="lv-form-label lv-form-label--required">
                  {t.issuanceDateLabel}
                </label>
                <input
                  id={dateId}
                  type="date"
                  className={`lv-form-input ${errors.issuanceDate ? 'lv-form-input--error' : ''}`}
                  value={issuanceDate}
                  onChange={(e) => setIssuanceDate(e.target.value)}
                  disabled={isSubmitting}
                />
                {errors.issuanceDate && (
                  <div className="lv-form-error-msg" role="alert">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>{t[errors.issuanceDate] || errors.issuanceDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Notary details if NOTARIAL_PARTITION */}
            {legalBasisType === 'NOTARIAL_PARTITION' && (
              <div className="lv-notary-subform">
                <h3 className="lv-notary-subform__title">{t.notarySectionTitle}</h3>
                <div className="lv-form-group">
                  <label htmlFor={notaryOrgId} className="lv-form-label lv-form-label--required">
                    {t.notaryAuthorityLabel}
                  </label>
                  <input
                    id={notaryOrgId}
                    type="text"
                    className="lv-form-input"
                    placeholder={t.notaryAuthorityPlaceholder}
                    value={notaryAuthority}
                    onChange={(e) => setNotaryAuthority(e.target.value)}
                    disabled={isSubmitting}
                  />
                </div>

                <div className="lv-form-row-grid">
                  <div className="lv-form-group">
                    <label htmlFor={notaryNumId} className="lv-form-label lv-form-label--required">
                      {t.notarialDocNumberLabel}
                    </label>
                    <input
                      id={notaryNumId}
                      type="text"
                      className="lv-form-input"
                      placeholder={t.notarialDocNumberPlaceholder}
                      value={notarialDocumentNumber}
                      onChange={(e) => setNotarialDocumentNumber(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>

                  <div className="lv-form-group">
                    <label htmlFor={notarizedAtId} className="lv-form-label lv-form-label--required">
                      {t.notarizedAtLabel}
                    </label>
                    <input
                      id={notarizedAtId}
                      type="date"
                      className="lv-form-input"
                      value={notarizedAt}
                      onChange={(e) => setNotarizedAt(e.target.value)}
                      disabled={isSubmitting}
                    />
                  </div>
                </div>

                {errors.notary && (
                  <div className="lv-form-error-msg" role="alert">
                    <AlertTriangle size={13} aria-hidden="true" />
                    <span>{t[errors.notary] || errors.notary}</span>
                  </div>
                )}
              </div>
            )}

            {/* Physical Record Reference & Notes */}
            <div className="lv-form-row-grid">
              <div className="lv-form-group">
                <label htmlFor={evidenceRefId} className="lv-form-label">
                  {t.evidenceReferenceLabel}
                </label>
                <input
                  id={evidenceRefId}
                  type="text"
                  className="lv-form-input"
                  placeholder={t.evidenceReferencePlaceholder}
                  value={evidenceReference}
                  onChange={(e) => setEvidenceReference(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>

              <div className="lv-form-group">
                <label htmlFor={notesId} className="lv-form-label">
                  {t.notesLabel}
                </label>
                <input
                  id={notesId}
                  type="text"
                  className="lv-form-input"
                  placeholder={t.notesPlaceholder}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting}
                />
              </div>
            </div>

            {/* Evidence File Uploader (PS-98 component) */}
            <div className="lv-form-group">
              <EvidenceFileUploader
                file={evidenceFile}
                onFileChange={setEvidenceFile}
                uploadProgress={uploadProgress}
                error={errors.file}
                disabled={isSubmitting}
                lang={lang}
                required={true}
                label={t.fileUploadLabel}
                hint={t.fileUploadHint}
                idPrefix="basis-document-file"
              />
            </div>

            {/* Action Buttons */}
            <div className="lv-form-actions">
              <div className="lv-form-actions__row">
                <button
                  type="submit"
                  className="lv-btn-submit-version"
                  disabled={isSubmitting || !evidenceFile}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={15} className="lv-spin" aria-hidden="true" />
                      <span>{t.submittingVersion}</span>
                    </>
                  ) : (
                    <>
                      <Send size={15} aria-hidden="true" />
                      <span>{t.btnSubmitVersion}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  className="lv-btn-reset"
                  onClick={handleResetForm}
                  disabled={isSubmitting}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>{t.btnResetForm}</span>
                </button>
              </div>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}
