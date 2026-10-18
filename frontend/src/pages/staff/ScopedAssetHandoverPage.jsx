import { useState, useId } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Package,
  Clock,
  RotateCcw,
  Info,
} from 'lucide-react';
import {
  filterScopedHandoverItems,
  validateApprovedAllocationScope,
  HANDOVER_STATUS,
} from '../../utils/scopedAssetHandoverValidation.js';
import { scopedAssetHandoverI18n } from './scopedAssetHandoverI18n.js';
import './ScopedAssetHandoverPage.css';

export default function ScopedAssetHandoverPage({
  lang = 'vi',
  initialScope = null,
  initialCandidates = null,
}) {
  const t = scopedAssetHandoverI18n[lang] || scopedAssetHandoverI18n.vi;
  const caseInputId = useId();

  const [caseReference, setCaseReference] = useState('');
  const [scopeData, setScopeData] = useState(initialScope);
  const [candidates, setCandidates] = useState(initialCandidates);

  // Validate scope
  const scopeValidation = validateApprovedAllocationScope(scopeData);
  const { eligible, blocked } = filterScopedHandoverItems(candidates, scopeData);

  // Switching case resets input and all prior responses to avoid cross-context overwrite
  const handleCaseChange = (newRef) => {
    setCaseReference(newRef);
    // When changing case, if it does not match current scope, clear scope data
    if (newRef !== caseReference) {
      setScopeData(null);
      setCandidates(null);
    }
  };

  const handleReset = () => {
    setCaseReference('');
    setScopeData(null);
    setCandidates(null);
  };

  return (
    <div className="lv-asset-handover-view">
      {/* Page Title & Context Header */}
      <div className="lv-handover-header">
        <h1 className="lv-handover-title">{t.pageTitle}</h1>
        <p className="lv-handover-subtitle">{t.pageSubtitle}</p>
      </div>

      {/* Critical Business Rule Banner */}
      <section className="lv-handover-notice-banner" role="alert" aria-labelledby="handover-rule-title">
        <ShieldAlert size={22} className="lv-handover-notice-banner__icon" aria-hidden="true" />
        <div className="lv-handover-notice-banner__body">
          <h2 id="handover-rule-title" className="lv-handover-notice-banner__title">
            {t.noticeTitle}
          </h2>
          <p>{t.noticeBody}</p>
        </div>
      </section>

      {/* Case Selection & Scope Status Card */}
      <section className="lv-handover-card" aria-labelledby="scope-card-title">
        <div className="lv-handover-card__header">
          <h2 id="scope-card-title" className="lv-handover-card__title">
            {t.scopeCardTitle}
          </h2>
          {scopeValidation.isApproved ? (
            <span className="lv-scope-badge lv-scope-badge--approved">
              <CheckCircle2 size={13} aria-hidden="true" />
              <span>{t.scopeApprovedBadge}</span>
            </span>
          ) : (
            <span className="lv-scope-badge lv-scope-badge--unapproved">
              <Clock size={13} aria-hidden="true" />
              <span>{scopeData ? t.scopeUnapprovedBadge : t.informationUnavailable}</span>
            </span>
          )}
        </div>

        <div className="lv-handover-case-bar">
          <div className="lv-handover-input-group">
            <label htmlFor={caseInputId} className="lv-handover-label">
              {t.caseSelectLabel}
            </label>
            <input
              id={caseInputId}
              type="text"
              className="lv-handover-input"
              placeholder={t.caseSelectPlaceholder}
              value={caseReference}
              onChange={(e) => handleCaseChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="lv-handover-btn-reset"
            onClick={handleReset}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t.btnResetCase}</span>
          </button>
        </div>

        {/* If scope is missing or unapproved, show truthful blocker notification */}
        {!scopeValidation.isValid && (
          <div className="lv-handover-scope-empty" role="status">
            <Package size={32} className="lv-handover-scope-empty__icon" aria-hidden="true" />
            <h3>{t.scopeMissingTitle}</h3>
            <p>{t.scopeMissingDesc}</p>
          </div>
        )}
      </section>

      {/* Eligible Scoped Assets Table Section */}
      {(
        <section className="lv-handover-card" aria-labelledby="table-heading">
          <div className="lv-handover-card__header">
            <h2 id="table-heading" className="lv-handover-card__title">
              {t.assetTableTitle}
            </h2>
          </div>

          {/* Truthful Server Mutation Notice */}
          <div className="lv-api-status-banner" role="status">
            <Info size={16} className="lv-api-status-banner__icon" aria-hidden="true" />
            <span>{t.apiPendingNotice}</span>
          </div>

          <div className="lv-handover-table-wrapper">
            <table className="lv-handover-table">
              <thead>
                <tr>
                  <th>{t.assetNameCol}</th>
                  <th>{t.beneficiaryCol}</th>
                  <th>{t.scopeStatusCol}</th>
                  <th>{t.handoverStatusCol}</th>
                  <th>{t.actionCol}</th>
                </tr>
              </thead>
              <tbody>
                {!scopeValidation.isValid || !Array.isArray(candidates) || eligible.length === 0 ? (
                  <tr>
                    <td colSpan="5">
                      <div className="lv-handover-scope-empty" role="status">
                        <p>{!scopeValidation.isValid || !Array.isArray(candidates) ? t.informationUnavailable : t.emptyAssets}</p>
                        <button type="button" className="lv-btn-handover-action" disabled title={t.apiPendingNotice}>{t.btnRecordHandover}</button>
                      </div>
                    </td>
                  </tr>
                ) : (
                  eligible.map((item) => {
                    const isDelivered = item.handoverStatus === HANDOVER_STATUS.DELIVERED;
                    return (
                      <tr key={item.assetId}>
                        <td>
                          <strong>{item.assetName || t.informationUnavailable}</strong>
                        </td>
                        <td>{item.beneficiaryName || t.informationUnavailable}</td>
                        <td>
                          <span className="lv-scope-badge lv-scope-badge--approved">
                            {t.statusInScope}
                          </span>
                        </td>
                        <td>
                          {isDelivered ? (
                            <span className="lv-status-pill lv-status-pill--delivered">
                              <CheckCircle2 size={12} aria-hidden="true" />
                              <span>{t.statusDelivered}</span>
                            </span>
                          ) : item.handoverStatus === HANDOVER_STATUS.PENDING ? (
                            <span className="lv-status-pill lv-status-pill--pending">
                              <Clock size={12} aria-hidden="true" />
                              <span>{t.statusPending}</span>
                            </span>
                          ) : <span>{t.informationUnavailable}</span>}
                        </td>
                        <td>
                          <button
                            type="button"
                            className="lv-btn-handover-action"
                            disabled={true} // Mutation action disabled pending server endpoint
                            title={t.apiPendingNotice}
                            aria-label={`${t.btnRecordHandover}: ${item.assetName || item.assetId}`}
                          >
                            <span>
                              {isDelivered ? t.btnDeliveredDisabled : t.btnRecordHandover}
                            </span>
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Blocked Out-of-Scope Banner (if any candidate was blocked) */}
      {blocked.length > 0 && scopeValidation.isValid && (
        <section className="lv-handover-notice-banner" role="alert">
          <AlertTriangle size={20} className="lv-handover-notice-banner__icon" aria-hidden="true" />
          <div className="lv-handover-notice-banner__body">
            <h2 className="lv-handover-notice-banner__title">{t.blockedBannerTitle}</h2>
            <p>{t.blockedBannerDesc} ({blocked.length} {lang === 'en' ? 'items blocked' : 'mục bị chặn'})</p>
          </div>
        </section>
      )}
    </div>
  );
}
