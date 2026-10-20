import { useState, useId, useRef, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
  HelpCircle,
  Award,
  ArrowLeft,
} from 'lucide-react';
import {
  evaluateCompletionProgress,
  COMPLETION_PROGRESS_STATUS,
} from '../../utils/completionProgressValidation.js';
import {
  fetchCompletionProgress,
} from './handoverSessionService.js';
import { completionProgressI18n } from './completionProgressI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './CompletionProgressPage.css';

export default function CompletionProgressPage({
  lang = 'vi',
  caseId: propCaseId,
  caseReference: propCaseReference,
  caseItem: propCaseItem = null,
  initialCaseId = '',
  initialCaseReference = '',
  initialAssetData = null,
  initialBeneficiaryData = null,
  assetData: propAssetData,
  beneficiaryData: propBeneficiaryData,
  onFetchProgress,
  loadProgress,
  onCaseChange,
  accessToken = null,
  session = null,
  preview = false,
  isDevPreview = false,
  sessionId: propSessionId = '',
  onUnauthorized = null,
  onNavigateCases = null,
}) {
  const t = completionProgressI18n[lang] || completionProgressI18n.vi;
  const caseInputId = useId();
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const effectiveSessionId = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

  const initialEffectiveCase =
    propCaseId !== undefined
      ? (propCaseId || '')
      : propCaseReference !== undefined
        ? (propCaseReference || '')
        : (initialCaseId || initialCaseReference || searchParams?.get('caseId') || (effectiveIsDevPreview ? 'CASE-2026-0001' : ''));

  const initialEffectiveTrimmed = initialEffectiveCase.trim();
  const hasInitialData =
    Boolean(initialEffectiveTrimmed) &&
    (initialAssetData !== null ||
      initialBeneficiaryData !== null ||
      propAssetData !== undefined ||
      propBeneficiaryData !== undefined);

  // State
  const [caseReference, setCaseReference] = useState(initialEffectiveCase);
  const [loadedCaseId, setLoadedCaseId] = useState(
    hasInitialData ? initialEffectiveTrimmed : ''
  );
  const [assetData, setAssetData] = useState(
    propAssetData !== undefined ? propAssetData : initialAssetData
  );
  const [beneficiaryData, setBeneficiaryData] = useState(
    propBeneficiaryData !== undefined ? propBeneficiaryData : initialBeneficiaryData
  );

  // Stale response guard
  const activeCaseRef = useRef(initialEffectiveTrimmed);

  // Sync state during render when props change (React 19 recommended pattern)
  const effectivePropCase =
    propCaseId !== undefined
      ? propCaseId
      : propCaseReference !== undefined
        ? propCaseReference
        : null;

  const [prevPropCase, setPrevPropCase] = useState(effectivePropCase);
  if (effectivePropCase !== null && effectivePropCase !== prevPropCase) {
    setPrevPropCase(effectivePropCase);
    const trimmed = (effectivePropCase || '').trim();
    setCaseReference(effectivePropCase || '');
    if (
      trimmed &&
      (propAssetData !== undefined || propBeneficiaryData !== undefined)
    ) {
      setLoadedCaseId(trimmed);
      setAssetData(propAssetData ?? null);
      setBeneficiaryData(propBeneficiaryData ?? null);
    } else {
      setLoadedCaseId('');
      setAssetData(null);
      setBeneficiaryData(null);
    }
  }

  const [prevPropAssetData, setPrevPropAssetData] = useState(propAssetData);
  const [prevPropBeneficiaryData, setPrevPropBeneficiaryData] = useState(propBeneficiaryData);
  if (
    propAssetData !== prevPropAssetData ||
    propBeneficiaryData !== prevPropBeneficiaryData
  ) {
    setPrevPropAssetData(propAssetData);
    setPrevPropBeneficiaryData(propBeneficiaryData);
    if (propAssetData !== undefined) setAssetData(propAssetData ?? null);
    if (propBeneficiaryData !== undefined) setBeneficiaryData(propBeneficiaryData ?? null);
    if (effectivePropCase && (propAssetData !== undefined || propBeneficiaryData !== undefined)) {
      setLoadedCaseId((effectivePropCase || '').trim());
    }
  }

  // Update activeCaseRef in effect
  useEffect(() => {
    activeCaseRef.current = caseReference.trim();
  }, [caseReference]);

  // Handle case change via input or UI
  const handleCaseChange = (newRef) => {
    const trimmed = (newRef || '').trim();
    setCaseReference(newRef);
    activeCaseRef.current = trimmed;

    // Immediately isolate state: clear prior case data to prevent stale display
    setAssetData(null);
    setBeneficiaryData(null);
    setLoadedCaseId('');

    if (typeof onCaseChange === 'function') {
      onCaseChange(newRef);
    }

    const fetcher = onFetchProgress || loadProgress;
    if (typeof fetcher === 'function' && trimmed) {
      Promise.resolve(fetcher(trimmed))
        .then((res) => {
          if (activeCaseRef.current !== trimmed) return;
          if (res) {
            setAssetData(res.assetData ?? null);
            setBeneficiaryData(res.beneficiaryData ?? null);
            setLoadedCaseId(trimmed);
          } else {
            setAssetData(null);
            setBeneficiaryData(null);
            setLoadedCaseId(trimmed);
          }
        })
        .catch(() => {
          if (activeCaseRef.current !== trimmed) return;
          setAssetData(null);
          setBeneficiaryData(null);
          setLoadedCaseId(trimmed);
        });
    }
  };

  const handleReset = () => {
    setCaseReference('');
    activeCaseRef.current = '';
    setLoadedCaseId('');
    setAssetData(null);
    setBeneficiaryData(null);
  };

  // Asynchronously fetch progress if fetcher is provided and case is not yet loaded
  useEffect(() => {
    const trimmed = caseReference.trim();
    const fetcher = onFetchProgress || loadProgress;
    if (trimmed && loadedCaseId !== trimmed) {
      if (typeof fetcher === 'function') {
        Promise.resolve(fetcher(trimmed))
          .then((res) => {
            if (activeCaseRef.current !== trimmed) return;
            if (res) {
              setAssetData(res.assetData ?? null);
              setBeneficiaryData(res.beneficiaryData ?? null);
              setLoadedCaseId(trimmed);
            } else {
              setAssetData(null);
              setBeneficiaryData(null);
              setLoadedCaseId(trimmed);
            }
          })
          .catch(() => {
            if (activeCaseRef.current !== trimmed) return;
            setAssetData(null);
            setBeneficiaryData(null);
            setLoadedCaseId(trimmed);
          });
      } else if (effectiveSessionId) {
        // Calling real backend / simulated completion progress API
        fetchCompletionProgress(trimmed, effectiveSessionId, {
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
        })
          .then((res) => {
            if (activeCaseRef.current !== trimmed) return;
            if (res) {
              const mappedAsset = res.assets
                ? { totalCount: res.assets.total, deliveredCount: res.assets.completed, isComplete: res.assets.complete }
                : (res.assetCompletion ?? null);
              const mappedBeneficiary = res.beneficiaries
                ? { totalCount: res.beneficiaries.total, confirmedCount: res.beneficiaries.completed, isComplete: res.beneficiaries.complete }
                : (res.beneficiaryCompletion ?? null);
              setAssetData(mappedAsset);
              setBeneficiaryData(mappedBeneficiary);
              setLoadedCaseId(trimmed);
            }
          })
          .catch(() => {
            if (activeCaseRef.current !== trimmed) return;
            setAssetData(null);
            setBeneficiaryData(null);
            setLoadedCaseId(trimmed);
          });
      }
    }
  }, [caseReference, loadedCaseId, onFetchProgress, loadProgress, lang, effectiveSessionId, effectiveAccessToken, effectiveIsDevPreview]);

  // Evaluate metrics strictly for the active case
  const activeTrimmed = caseReference.trim();
  const hasValidCaseData = Boolean(activeTrimmed && loadedCaseId === activeTrimmed);
  const effectiveAssetData = hasValidCaseData ? assetData : null;
  const effectiveBeneficiaryData = hasValidCaseData ? beneficiaryData : null;

  const evaluation = evaluateCompletionProgress(
    effectiveAssetData,
    effectiveBeneficiaryData
  );
  const { overallStatus, assetMetric, beneficiaryMetric, missingConditions } = evaluation;

  return (
    <div className="lv-completion-progress-view">
      {/* Context navigation back */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {activeTrimmed && effectiveSessionId && (
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(activeTrimmed)}&sessionId=${encodeURIComponent(effectiveSessionId)}${effectiveIsDevPreview ? '&preview=true' : ''}`}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#164639',
              textDecoration: 'none',
            }}
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{lang === 'en' ? 'Back to Handover Session' : 'Quay lại Phiên bàn giao tại quầy'}</span>
          </a>
        )}
        {onNavigateCases && (
          <button
            type="button"
            onClick={onNavigateCases}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: '#6b7280',
              padding: 0,
            }}
          >
            <span>{lang === 'en' ? 'Staff Cases' : 'Danh sách ca xác minh'}</span>
          </button>
        )}
      </div>

      {/* Warning when context is missing in real mode */}
      {!activeTrimmed && !effectiveIsDevPreview && (
        <section className="lv-progress-card" style={{ marginBottom: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: '#92400e' }}>
                {lang === 'en' ? 'No Handover Case Selected' : 'Chưa chọn ca bàn giao'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                {lang === 'en'
                  ? 'Please select a verification case and open a counter handover session to track completion progress.'
                  : 'Vui lòng chọn hồ sơ xác minh và mở phiên bàn giao tại quầy để theo dõi tiến độ hai cổng hoàn tất.'}
              </p>
              {onNavigateCases && (
                <button
                  type="button"
                  className="lv-btn lv-btn-primary"
                  onClick={onNavigateCases}
                  style={{ marginTop: '12px', padding: '6px 14px', fontSize: '13px' }}
                >
                  {lang === 'en' ? 'Go to Verification Cases' : 'Về danh sách ca xác minh'}
                </button>
              )}
            </div>
          </div>
        </section>
      )}

      {/* Header */}
      <div className="lv-progress-header">
        <h1 className="lv-progress-title">{t.pageTitle}</h1>
        <p className="lv-progress-subtitle">{t.pageSubtitle}</p>
      </div>

      {/* Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={caseReference}
        caseItem={propCaseItem}
        sessionId={propSessionId}
        onOpenSelector={() => setIsSelectorOpen(true)}
        onChangeCase={() => setIsSelectorOpen(true)}
        lang={lang}
      />

      {/* Staff Case Selector Modal */}
      <StaffCaseSelectorModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        onSelectCase={(item) => {
          const newId = item.caseId || item.id;
          setCaseReference(newId);
          setAssetData(null);
          setBeneficiaryData(null);
          if (typeof window !== 'undefined') {
            const url = new URL(window.location.href);
            url.searchParams.set('caseId', newId);
            url.searchParams.delete('sessionId');
            window.history.replaceState({}, '', url.pathname + url.search);
          }
          onCaseChange?.(newId, item);
        }}
        accessToken={effectiveAccessToken}
        isDevPreview={effectiveIsDevPreview}
        lang={lang}
        currentCaseId={caseReference}
        onUnauthorized={onUnauthorized}
      />

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
            className="lv-progress-btn-select-case"
            onClick={() => setIsSelectorOpen(true)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              border: '1px solid #164639',
              backgroundColor: '#164639',
              color: '#ffffff',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {lang === 'en' ? 'Select from queue' : 'Chọn từ danh sách'}
          </button>
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
