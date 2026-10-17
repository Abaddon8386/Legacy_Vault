import {
  Archive,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  ShieldCheck,
  FileText,
  Lock,
} from 'lucide-react';
import {
  evaluateCloseArchivePreconditions,
  isCaseArchived,
  CLOSE_ARCHIVE_ELIGIBILITY_STATUS,
} from '../../utils/closeAndArchiveValidation.js';
import { closeAndArchiveI18n } from './closeAndArchiveI18n.js';
import './CloseAndArchivePage.css';

export default function CloseAndArchivePage({
  lang = 'vi',
  sessionStatus = 'ACTIVE',
  vaultStatus = 'OPEN',
  caseStatus = 'IN_PROGRESS',
  assetData = null,
  beneficiaryData = null,
  receipts = [],
}) {
  const t = closeAndArchiveI18n[lang] || closeAndArchiveI18n.vi;

  const isArchived = isCaseArchived(vaultStatus, caseStatus);
  const evaluation = evaluateCloseArchivePreconditions(assetData || {}, beneficiaryData || {});
  const { eligibilityStatus, isAssetComplete, isBeneficiaryComplete, unmetConditions } = evaluation;

  // Resolve status label from server status code
  const resolveSessionLabel = (status) => {
    if (status === 'COMPLETED') return t.statusSessionCompleted;
    if (status === 'ACTIVE') return t.statusSessionActive;
    return t.statusUnknown;
  };

  const resolveVaultLabel = (status) => {
    if (status === 'ARCHIVED') return t.statusVaultArchived;
    if (status === 'LOCKED') return t.statusVaultLocked;
    if (status === 'OPEN') return t.statusVaultOpen;
    return t.statusUnknown;
  };

  const resolveCaseLabel = (status) => {
    if (status === 'CLOSED') return t.statusCaseClosed;
    if (status === 'IN_PROGRESS') return t.statusCaseInProgress;
    return t.statusUnknown;
  };

  return (
    <div className="lv-close-archive-view">
      {/* Header */}
      <header className="lv-ca-header">
        <h1 className="lv-ca-title">{t.pageTitle}</h1>
        <p className="lv-ca-subtitle">{t.pageSubtitle}</p>
      </header>

      {/* Read-Only Banner when Archived */}
      {isArchived && (
        <section className="lv-ca-archive-banner" role="status" aria-labelledby="archive-banner-heading">
          <Lock size={22} className="lv-ca-archive-banner__icon" aria-hidden="true" />
          <div>
            <h2 id="archive-banner-heading" className="lv-ca-archive-banner__title">
              {t.readOnlyBannerTitle}
            </h2>
            <p>{t.readOnlyBannerBody}</p>
          </div>
        </section>
      )}

      {/* 1. Server Status Dashboard */}
      <section className="lv-ca-card" aria-labelledby="server-status-heading">
        <h2 id="server-status-heading" className="lv-ca-card__title">
          {t.serverStatusHeading}
        </h2>
        <div className="lv-ca-server-grid">
          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.sessionStatusLabel}</span>
            <span
              className={`lv-ca-status-box__value ${
                sessionStatus === 'COMPLETED'
                  ? 'lv-ca-status-box__value--completed'
                  : sessionStatus === 'ACTIVE'
                  ? 'lv-ca-status-box__value--active'
                  : 'lv-ca-status-box__value--unknown'
              }`}
            >
              {sessionStatus === 'COMPLETED' ? (
                <CheckCircle2 size={14} aria-hidden="true" />
              ) : (
                <Clock size={14} aria-hidden="true" />
              )}
              <span>{resolveSessionLabel(sessionStatus)}</span>
            </span>
          </div>

          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.vaultStatusLabel}</span>
            <span
              className={`lv-ca-status-box__value ${
                vaultStatus === 'ARCHIVED'
                  ? 'lv-ca-status-box__value--archived'
                  : vaultStatus === 'OPEN'
                  ? 'lv-ca-status-box__value--open'
                  : 'lv-ca-status-box__value--unknown'
              }`}
            >
              {vaultStatus === 'ARCHIVED' ? (
                <Archive size={14} aria-hidden="true" />
              ) : (
                <Clock size={14} aria-hidden="true" />
              )}
              <span>{resolveVaultLabel(vaultStatus)}</span>
            </span>
          </div>

          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.caseStatusLabel}</span>
            <span
              className={`lv-ca-status-box__value ${
                caseStatus === 'CLOSED'
                  ? 'lv-ca-status-box__value--closed'
                  : caseStatus === 'IN_PROGRESS'
                  ? 'lv-ca-status-box__value--in-progress'
                  : 'lv-ca-status-box__value--unknown'
              }`}
            >
              {caseStatus === 'CLOSED' ? (
                <ShieldCheck size={14} aria-hidden="true" />
              ) : (
                <Clock size={14} aria-hidden="true" />
              )}
              <span>{resolveCaseLabel(caseStatus)}</span>
            </span>
          </div>
        </div>
      </section>

      {/* 2. Preconditions Evaluation */}
      <section className="lv-ca-card" aria-labelledby="preconditions-heading">
        <h2 id="preconditions-heading" className="lv-ca-card__title">
          {t.preconditionsHeading}
        </h2>
        <p className="lv-ca-card__desc">{t.preconditionsDesc}</p>

        {/* Criteria Checklist */}
        <ul className="lv-ca-criteria-list" aria-label={t.preconditionsHeading}>
          <li
            className={`lv-ca-criterion-item ${
              isAssetComplete
                ? 'lv-ca-criterion-item--complete'
                : evaluation.isAssetValid
                ? 'lv-ca-criterion-item--incomplete'
                : 'lv-ca-criterion-item--invalid'
            }`}
          >
            {isAssetComplete ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : evaluation.isAssetValid ? (
              <Clock size={16} aria-hidden="true" />
            ) : (
              <HelpCircle size={16} aria-hidden="true" />
            )}
            <span>{t.assetDeliveryCondition}</span>
          </li>

          <li
            className={`lv-ca-criterion-item ${
              isBeneficiaryComplete
                ? 'lv-ca-criterion-item--complete'
                : evaluation.isBeneficiaryValid
                ? 'lv-ca-criterion-item--incomplete'
                : 'lv-ca-criterion-item--invalid'
            }`}
          >
            {isBeneficiaryComplete ? (
              <CheckCircle2 size={16} aria-hidden="true" />
            ) : evaluation.isBeneficiaryValid ? (
              <Clock size={16} aria-hidden="true" />
            ) : (
              <HelpCircle size={16} aria-hidden="true" />
            )}
            <span>{t.beneficiaryConfirmationCondition}</span>
          </li>
        </ul>

        {/* Overall Precondition Banner */}
        {eligibilityStatus === CLOSE_ARCHIVE_ELIGIBILITY_STATUS.ELIGIBLE && (
          <div className="lv-ca-eval-banner lv-ca-eval-banner--eligible" role="status">
            <CheckCircle2 size={24} className="lv-ca-eval-banner__icon" aria-hidden="true" />
            <div>
              <h3 className="lv-ca-eval-banner__title">{t.statusEligibleTitle}</h3>
              <p>{t.statusEligibleDesc}</p>
            </div>
          </div>
        )}

        {eligibilityStatus === CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INELIGIBLE && (
          <div className="lv-ca-eval-banner lv-ca-eval-banner--ineligible" role="alert">
            <AlertTriangle size={24} className="lv-ca-eval-banner__icon" aria-hidden="true" />
            <div>
              <h3 className="lv-ca-eval-banner__title">{t.statusIneligibleTitle}</h3>
              <p>{t.statusIneligibleDesc}</p>
              {unmetConditions.length > 0 && (
                <ul className="lv-ca-unmet-list">
                  {unmetConditions.map((cond) => (
                    <li key={cond}>{t[cond] || cond}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {eligibilityStatus === CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE && (
          <div className="lv-ca-eval-banner lv-ca-eval-banner--indeterminate" role="status">
            <HelpCircle size={24} className="lv-ca-eval-banner__icon" aria-hidden="true" />
            <div>
              <h3 className="lv-ca-eval-banner__title">{t.statusIndeterminateTitle}</h3>
              <p>{t.statusIndeterminateDesc}</p>
              {unmetConditions.length > 0 && (
                <ul className="lv-ca-unmet-list">
                  {unmetConditions.map((cond) => (
                    <li key={cond}>{t[cond] || cond}</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>

      {/* 3. Receipt Summary Section */}
      <section className="lv-ca-card" aria-labelledby="receipt-summary-heading">
        <h2 id="receipt-summary-heading" className="lv-ca-card__title">
          {t.receiptSummaryHeading}
        </h2>
        <p className="lv-ca-card__desc">{t.receiptSummaryDesc}</p>

        {Array.isArray(receipts) && receipts.length > 0 ? (
          <div className="lv-ca-table-wrapper">
            <table className="lv-ca-table">
              <thead>
                <tr>
                  <th scope="col">{t.thReceiptCode}</th>
                  <th scope="col">{t.thType}</th>
                  <th scope="col">{t.thRecipient}</th>
                  <th scope="col">{t.thIssuedDate}</th>
                  <th scope="col">{t.thStatus}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((rc) => (
                  <tr key={rc.id || rc.code}>
                    <td>
                      <span className="lv-ca-code-badge">{rc.code}</span>
                    </td>
                    <td>
                      {rc.type === 'ASSET_HANDOVER'
                        ? t.typeAssetHandover
                        : rc.type === 'BENEFICIARY_CONFIRM'
                        ? t.typeBeneficiaryConfirm
                        : rc.type || '-'}
                    </td>
                    <td>{rc.recipient || '-'}</td>
                    <td>{rc.issuedAt || '-'}</td>
                    <td>
                      <span className="lv-ca-tag">
                        {rc.status === 'VERIFIED'
                          ? t.receiptVerified
                          : rc.status === 'ISSUED'
                          ? t.receiptIssued
                          : rc.status || '-'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="lv-ca-empty-box" role="status">
            <FileText size={32} aria-hidden="true" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3>{t.receiptEmptyTitle}</h3>
            <p>{t.receiptEmptyDesc}</p>
          </div>
        )}
      </section>

      {/* 4. Action Section (Disabled write action without API) */}
      <section className="lv-ca-card" aria-labelledby="action-heading">
        <h2 id="action-heading" className="lv-ca-card__title">
          {t.actionHeading}
        </h2>

        <div className="lv-ca-action-box">
          <button
            type="button"
            className="lv-ca-btn-primary"
            disabled={true}
            aria-disabled="true"
            title={t.functionUnavailableNotice}
          >
            <Archive size={16} aria-hidden="true" />
            <span>{t.btnExecuteCloseArchive}</span>
          </button>

          <div className="lv-ca-unavailable-callout" role="note">
            <AlertTriangle size={15} aria-hidden="true" />
            <span>{t.functionUnavailableNotice}</span>
          </div>

          <p className="lv-ca-disabled-note">{t.actionDisabledExpl}</p>
        </div>
      </section>
    </div>
  );
}
