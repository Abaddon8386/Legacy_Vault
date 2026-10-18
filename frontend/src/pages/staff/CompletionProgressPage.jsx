import { useState, useId } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Award,
} from 'lucide-react';
import {
  evaluateCompletionProgress,
  COMPLETION_PROGRESS_STATUS,
} from '../../utils/completionProgressValidation.js';
import { completionProgressI18n } from './completionProgressI18n.js';
import './CompletionProgressPage.css';

export default function CompletionProgressPage({
  lang = 'vi',
  initialAssetData = null,
  initialBeneficiaryData = null,
}) {
  const t = completionProgressI18n[lang] || completionProgressI18n.vi;
  const caseInputId = useId();

  // State
  const [caseReference, setCaseReference] = useState('');
  const [assetData, setAssetData] = useState(initialAssetData);
  const [beneficiaryData, setBeneficiaryData] = useState(initialBeneficiaryData);

  // Switching case resets data to avoid cross-context overwrite
  const handleCaseChange = (newRef) => {
    setCaseReference(newRef);
    if (!newRef.trim()) {
      setAssetData(null);
      setBeneficiaryData(null);
    }
  };

  const handleReset = () => {
    setCaseReference('');
    setAssetData(initialAssetData);
    setBeneficiaryData(initialBeneficiaryData);
  };

  const evaluation = evaluateCompletionProgress(assetData || {}, beneficiaryData || {});
  const { overallStatus, assetMetric, beneficiaryMetric, missingConditions } = evaluation;

  return (
    <div className="lv-completion-progress-view">
      {/* Header */}
      <div className="lv-progress-header">
        <h1 className="lv-progress-title">{t.pageTitle}</h1>
        <p className="lv-progress-subtitle">{t.pageSubtitle}</p>
      </div>

      {/* Critical Rule Banner */}
      <section className="lv-progress-notice-banner" role="alert" aria-labelledby="rule-notice-heading">
        <ShieldAlert size={22} className="lv-progress-notice-banner__icon" aria-hidden="true" />
        <div className="lv-progress-notice-banner__body">
          <h2 id="rule-notice-heading" className="lv-progress-notice-banner__title">
            {t.ruleNoticeTitle}
          </h2>
          <p>{t.ruleNoticeBody}</p>
        </div>
      </section>

      {/* Case Selector Card */}
      <section className="lv-progress-card" aria-labelledby="case-select-heading">
        <div className="lv-progress-case-bar">
          <div className="lv-progress-input-group">
            <label htmlFor={caseInputId} className="lv-progress-label" id="case-select-heading">
              {t.caseSelectLabel}
            </label>
            <input
              id={caseInputId}
              type="text"
              className="lv-progress-input"
              placeholder={t.caseSelectPlaceholder}
              value={caseReference}
              onChange={(e) => handleCaseChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="lv-progress-btn-reset"
            onClick={handleReset}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t.btnReset}</span>
          </button>
        </div>
      </section>

      {/* Overall Completion Evaluation Banner */}
      {overallStatus === COMPLETION_PROGRESS_STATUS.COMPLETED && (
        <section className="lv-overall-banner lv-overall-banner--completed" role="status" aria-labelledby="complete-banner-heading">
          <Award size={28} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="complete-banner-heading" className="lv-overall-banner__title">{t.overallCompletedTitle}</h2>
            <p>{t.overallCompletedDesc}</p>
          </div>
        </section>
      )}

      {overallStatus === COMPLETION_PROGRESS_STATUS.INCOMPLETE && (
        <section className="lv-overall-banner lv-overall-banner--incomplete" role="alert" aria-labelledby="incomplete-banner-heading">
          <AlertTriangle size={26} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="incomplete-banner-heading" className="lv-overall-banner__title">{t.overallIncompleteTitle}</h2>
            <p>{t.overallIncompleteDesc}</p>
            {missingConditions.length > 0 && (
              <ul className="lv-overall-missing-list">
                {missingConditions.map((cond) => (
                  <li key={cond}>{t[cond] || cond}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {overallStatus === COMPLETION_PROGRESS_STATUS.INDETERMINATE && (
        <section className="lv-overall-banner lv-overall-banner--awaiting" role="status" aria-labelledby="awaiting-banner-heading">
          <HelpCircle size={26} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="awaiting-banner-heading" className="lv-overall-banner__title">{t.overallAwaitingTitle}</h2>
            <p>{t.overallAwaitingDesc}</p>
            {missingConditions.length > 0 && (
              <ul className="lv-overall-missing-list">
                {missingConditions.map((cond) => (
                  <li key={cond}>{t[cond] || cond}</li>
                ))}
              </ul>
            )}
          </div>
        </section>
      )}

      {/* Dual Independent Metrics Grid */}
      <div className="lv-dual-metrics-grid">
        {/* Metric 1: Asset Delivery Progress */}
        <section className="lv-metric-card" aria-labelledby="asset-metric-heading">
          <div className="lv-metric-card__header">
            <div>
              <h2 id="asset-metric-heading" className="lv-metric-card__title">{t.assetProgressCardTitle}</h2>
              <p className="lv-metric-card__desc">{t.assetProgressCardDesc}</p>
            </div>
            {assetMetric.is100 ? (
              <span className="lv-metric-badge lv-metric-badge--complete">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>{t.statusComplete100}</span>
              </span>
            ) : assetMetric.isVerified ? (
              <span className="lv-metric-badge lv-metric-badge--incomplete">
                <Clock size={13} aria-hidden="true" />
                <span>{t.statusIncomplete}</span>
              </span>
            ) : (
              <span className="lv-metric-badge lv-metric-badge--awaiting">
                <HelpCircle size={13} aria-hidden="true" />
                <span>{t.statusAwaitingData}</span>
              </span>
            )}
          </div>

          {assetMetric.isVerified ? (
            <>
              <div className="lv-metric-numbers">
                <span className="lv-metric-ratio">
                  {assetMetric.delivered} / {assetMetric.total}
                </span>
                <span className="lv-metric-percentage">
                  {assetMetric.percentage}%
                </span>
              </div>
              <div className="lv-progress-track" role="progressbar" aria-valuenow={assetMetric.percentage} aria-valuemin="0" aria-valuemax="100">
                <div
                  className={`lv-progress-fill ${assetMetric.is100 ? 'lv-progress-fill--complete' : ''}`}
                  style={{ width: `${assetMetric.percentage}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="lv-metric-numbers">
                <span className="lv-metric-ratio lv-metric-ratio--unverified">
                  — / —
                </span>
                <span className="lv-metric-percentage lv-metric-percentage--unverified">
                  —
                </span>
              </div>
              <div
                className="lv-progress-track lv-progress-track--indeterminate"
                role="progressbar"
                aria-label={t.unverifiedNotice}
                aria-valuetext={t.unverifiedNotice}
              >
                <div className="lv-progress-fill lv-progress-fill--indeterminate" style={{ width: '0%' }} />
              </div>
              <div className="lv-unverified-notice" role="status">
                <HelpCircle size={15} aria-hidden="true" />
                <span>{t.unverifiedNotice}</span>
              </div>
            </>
          )}
        </section>

        {/* Metric 2: Beneficiary Confirmation Progress */}
        <section className="lv-metric-card" aria-labelledby="ben-metric-heading">
          <div className="lv-metric-card__header">
            <div>
              <h2 id="ben-metric-heading" className="lv-metric-card__title">{t.benProgressCardTitle}</h2>
              <p className="lv-metric-card__desc">{t.benProgressCardDesc}</p>
            </div>
            {beneficiaryMetric.is100 ? (
              <span className="lv-metric-badge lv-metric-badge--complete">
                <CheckCircle2 size={13} aria-hidden="true" />
                <span>{t.statusComplete100}</span>
              </span>
            ) : beneficiaryMetric.isVerified ? (
              <span className="lv-metric-badge lv-metric-badge--incomplete">
                <Clock size={13} aria-hidden="true" />
                <span>{t.statusIncomplete}</span>
              </span>
            ) : (
              <span className="lv-metric-badge lv-metric-badge--awaiting">
                <HelpCircle size={13} aria-hidden="true" />
                <span>{t.statusAwaitingData}</span>
              </span>
            )}
          </div>

          {beneficiaryMetric.isVerified ? (
            <>
              <div className="lv-metric-numbers">
                <span className="lv-metric-ratio">
                  {beneficiaryMetric.confirmed} / {beneficiaryMetric.total}
                </span>
                <span className="lv-metric-percentage">
                  {beneficiaryMetric.percentage}%
                </span>
              </div>
              <div className="lv-progress-track" role="progressbar" aria-valuenow={beneficiaryMetric.percentage} aria-valuemin="0" aria-valuemax="100">
                <div
                  className={`lv-progress-fill ${beneficiaryMetric.is100 ? 'lv-progress-fill--complete' : ''}`}
                  style={{ width: `${beneficiaryMetric.percentage}%` }}
                />
              </div>
            </>
          ) : (
            <>
              <div className="lv-metric-numbers">
                <span className="lv-metric-ratio lv-metric-ratio--unverified">
                  — / —
                </span>
                <span className="lv-metric-percentage lv-metric-percentage--unverified">
                  —
                </span>
              </div>
              <div
                className="lv-progress-track lv-progress-track--indeterminate"
                role="progressbar"
                aria-label={t.unverifiedNotice}
                aria-valuetext={t.unverifiedNotice}
              >
                <div className="lv-progress-fill lv-progress-fill--indeterminate" style={{ width: '0%' }} />
              </div>
              <div className="lv-unverified-notice" role="status">
                <HelpCircle size={15} aria-hidden="true" />
                <span>{t.unverifiedNotice}</span>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
