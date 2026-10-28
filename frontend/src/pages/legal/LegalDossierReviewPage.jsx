import { useState, useId, useMemo } from 'react';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  PauseCircle,
  RotateCcw,
  FileText,
  Clock,
} from 'lucide-react';
import {
  validateLegalDossierReviewForm,
  checkDossierReviewStatus,
  isValidDossierVersion,
  formatDossierVersion,
} from '../../utils/legalDossierReviewValidation.js';
import { legalDossierReviewI18n } from './legalDossierReviewI18n.js';
import './LegalDossierReviewPage.css';

export default function LegalDossierReviewPage({
  lang = 'vi',
  initialDossier = null,
  initialHistory = null,
}) {
  const t = legalDossierReviewI18n[lang] || legalDossierReviewI18n.vi;
  const notesId = useId();

  // Form states
  const [decision, setDecision] = useState('');
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});

  // Reset decision and notes whenever dossier identity, version, or content hash changes
  const dossierIdentityKey = initialDossier
    ? `${initialDossier.id || ''}_${initialDossier.version || ''}_${initialDossier.sha256 || ''}`
    : '';

  const [prevDossierKey, setPrevDossierKey] = useState(dossierIdentityKey);
  if (dossierIdentityKey !== prevDossierKey) {
    setPrevDossierKey(dossierIdentityKey);
    setDecision('');
    setNote('');
    setErrors({});
  }

  // Stale review detection: alerts reviewer when current dossier differs from past review record
  // NOTE: A false result for isStale does NOT mean the review is FRESH (it may be INDETERMINATE or MISMATCH)
  const isStale = useMemo(() => {
    if (!initialDossier || !initialHistory || initialHistory.length === 0) {
      return false;
    }
    const lastRecord = initialHistory[0];
    return checkDossierReviewStatus(initialDossier, lastRecord) === 'STALE';
  }, [initialDossier, initialHistory]);

  const handleDecisionSelect = (selectedDecision) => {
    setDecision(selectedDecision);
    if (errors.decision) {
      const res = validateLegalDossierReviewForm({
        decision: selectedDecision,
        note,
      });
      setErrors(res.errors);
    }
  };

  const handleNoteChange = (val) => {
    setNote(val);
  };

  const decisionOptions = [
    {
      id: 'APPROVE',
      label: t.decisionApprove,
      icon: CheckCircle2,
      variant: 'approve',
    },
    {
      id: 'REJECT',
      label: t.decisionReject,
      icon: XCircle,
      variant: 'reject',
    },
    {
      id: 'HOLD',
      label: t.decisionHold,
      icon: PauseCircle,
      variant: 'hold',
    },
    {
      id: 'RE_REVIEW',
      label: t.decisionReReview,
      icon: RotateCcw,
      variant: 'rereview',
    },
  ];

  return (
    <div className="lv-legal-dossier-review-view">
      {/* Page Header */}
      <header className="lv-review-header">
        <h1 className="lv-review-title">{t.pageTitle}</h1>
      </header>

      {/* Concise Regulatory Notice */}
      <section className="lv-review-notice" aria-labelledby="review-notice-title">
        <div className="lv-review-notice__icon-wrap" aria-hidden="true">
          <ShieldAlert size={20} />
        </div>
        <div className="lv-review-notice__body">
          <h2 id="review-notice-title" className="lv-review-notice__heading">
            {t.noticeTitle}
          </h2>
          <p>{t.noticeBody}</p>
        </div>
      </section>

      {/* Stale Dossier Alert — Prompt reviewer when dossier has updated */}
      {isStale && (
        <section
          className="lv-stale-alert"
          role="alert"
          aria-labelledby="stale-alert-title"
        >
          <div className="lv-stale-alert__icon-wrap" aria-hidden="true">
            <AlertTriangle size={20} />
          </div>
          <div className="lv-stale-alert__body">
            <h2 id="stale-alert-title" className="lv-stale-alert__heading">
              {t.staleNoticeTitle}
            </h2>
            <p>{t.staleNoticeBody}</p>
          </div>
        </section>
      )}

      {/* Stored Dossier Information Section */}
      <section className="lv-dossier-card lv-surface-card" aria-labelledby="dossier-heading">
        <div className="lv-dossier-card__header">
          <h2 id="dossier-heading">{t.dossierSectionTitle}</h2>
        </div>

        {!isValidDossierVersion(initialDossier?.version) && (
          <div className="lv-dossier-unconnected-box">
            <FileText size={28} className="lv-dossier-unconnected-icon" aria-hidden="true" />
            <h3>{t.dossierUnloaded}</h3>
            <p>{t.dossierUnloadedDesc}</p>
          </div>
        )}

        <div className="lv-dossier-specs-grid">
          <div className="lv-dossier-row">
            <span className="lv-dossier-label">{t.versionLabel}:</span>
            {isValidDossierVersion(initialDossier?.version) ? (
              <span className="lv-dossier-value-badge">
                {lang === 'en' ? `Version ${initialDossier.version}` : `Phiên bản ${initialDossier.version}`}
              </span>
            ) : (
              <span className="lv-dossier-value-unloaded">{t.versionUnloaded}</span>
            )}
          </div>

          {initialDossier?.issuer && (
            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.issuerLabel}</span>
              <span className="lv-dossier-text">{initialDossier.issuer}</span>
            </div>
          )}

          {initialDossier?.documentNumber && (
            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.docNumberLabel}</span>
              <span className="lv-dossier-text">{initialDossier.documentNumber}</span>
            </div>
          )}

          {initialDossier?.issuanceDate && (
            <div className="lv-dossier-row">
              <span className="lv-dossier-label">{t.issuanceDateLabel}</span>
              <span className="lv-dossier-text">{initialDossier.issuanceDate}</span>
            </div>
          )}
        </div>
      </section>

      {/* Review Decision Form */}
      <section className="lv-form-card lv-surface-card" aria-labelledby="decision-form-heading">
        <div className="lv-form-card__header">
          <h2 id="decision-form-heading">{t.decisionSectionTitle}</h2>
        </div>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {/* Decision Radio Grid (4 choices without repetitive descriptions) */}
          <div
            className="lv-decision-grid"
            role="radiogroup"
            aria-label={t.decisionSectionTitle}
          >
            {decisionOptions.map((opt) => {
              const Icon = opt.icon;
              const isSelected = decision === opt.id;
              return (
                <button
                  type="button"
                  key={opt.id}
                  className={`lv-decision-card lv-decision-card--${opt.variant} ${
                    isSelected ? 'is-selected' : ''
                  }`}
                  onClick={() => handleDecisionSelect(opt.id)}
                  role="radio"
                  aria-checked={isSelected}
                >
                  <div className="lv-decision-card__header">
                    <Icon size={18} className="lv-decision-card__icon" aria-hidden="true" />
                    <span className="lv-decision-card__label">{opt.label}</span>
                  </div>
                </button>
              );
            })}
          </div>

          {errors.decision && (
            <div className="lv-form-error-msg" role="alert">
              <AlertTriangle size={13} aria-hidden="true" />
              <span>{t[errors.decision] || t.decisionInvalid}</span>
            </div>
          )}

          {/* Notes Textarea (Concise) */}
          <div className="lv-form-group" style={{ marginTop: '20px' }}>
            <label htmlFor={notesId} className="lv-form-label">
              {t.notesLabel}
            </label>
            <textarea
              id={notesId}
              rows={3}
              className="lv-form-textarea"
              value={note}
              onChange={(e) => handleNoteChange(e.target.value)}
            />
          </div>

          {/* Action Buttons */}
          <div className="lv-form-actions">
            <div className="lv-form-actions__row">
              <button
                type="button"
                className="lv-btn-submit-disabled"
                disabled={true}
                title={t.btnSubmitDisabledHelper}
                aria-label={t.btnSubmitDecision}
                aria-disabled="true"
              >
                <CheckCircle2 size={16} aria-hidden="true" />
                <span>{t.btnSubmitDecision}</span>
              </button>
            </div>

            <div className="lv-action-helper-notice" role="status">
              <ShieldAlert size={15} flexShrink={0} aria-hidden="true" />
              <span>{t.btnSubmitDisabledHelper}</span>
            </div>
          </div>
        </form>
      </section>

      {/* Review History Section */}
      <section className="lv-history-card lv-surface-card" aria-labelledby="history-heading">
        <div className="lv-history-card__header">
          <Clock size={18} aria-hidden="true" />
          <h2 id="history-heading">{t.historySectionTitle}</h2>
        </div>

        {(!initialHistory || initialHistory.length === 0) ? (
          <div className="lv-history-unloaded-box">
            <h3>{t.historyUnloaded}</h3>
            <p>{t.historyUnloadedDesc}</p>
          </div>
        ) : (
          <div className="lv-history-table-wrapper">
            <table className="lv-history-table">
              <thead>
                <tr>
                  <th>{t.historyVersionCol}</th>
                  <th>{t.historyDecisionCol}</th>
                  <th>{t.historyTimeCol}</th>
                  <th>{t.historyNotesCol}</th>
                </tr>
              </thead>
              <tbody>
                {initialHistory.map((item, index) => (
                  <tr key={item.id || index}>
                    <td>
                      <span className="lv-history-ver-badge">
                        {formatDossierVersion(item.version, lang)}
                      </span>
                    </td>
                    <td>
                      <span className={`lv-history-decision lv-history-decision--${item.decision?.toLowerCase()}`}>
                        {item.decision}
                      </span>
                    </td>
                    <td>{item.createdAt || item.timestamp || '—'}</td>
                    <td>{item.note || item.notes || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
