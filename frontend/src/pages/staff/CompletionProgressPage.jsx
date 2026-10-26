import { useState, useId, useRef, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  Award,
  ArrowLeft,
  AlertCircle,
  RotateCw,
  ExternalLink,
} from 'lucide-react';
import {
  evaluateCompletionProgress,
  COMPLETION_PROGRESS_STATUS,
} from '../../utils/completionProgressValidation.js';
import {
  fetchCompletionProgress,
} from './handoverSessionService.js';
import { listLiveSessions } from './liveHandoverService.js';
import { completionProgressI18n } from './completionProgressI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './CompletionProgressPage.css';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import { formatStaffSession } from '../../utils/caseReference.js';
import StaffWorkflowGuide from '../../components/staff/StaffWorkflowGuide.jsx';

export default function CompletionProgressPage(props) {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const context = [props.session?.user?.id, props.accessToken || props.session?.accessToken,
    props.caseId ?? props.caseReference ?? props.initialCaseId ?? props.initialCaseReference ?? query.get('caseId'),
    props.sessionId || query.get('sessionId')];
  return <CompletionProgressContext key={JSON.stringify(context)} {...props} />;
}

function CompletionProgressContext({
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
  onSessionChange,
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
  const initialEffectiveSession = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

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
  const [selectedSessionId, setSelectedSessionId] = useState(initialEffectiveSession);
  const [selectedCaseItem, setSelectedCaseItem] = useState(null);
  const [loadedCaseId, setLoadedCaseId] = useState(
    hasInitialData ? initialEffectiveTrimmed : ''
  );
  const [assetData, setAssetData] = useState(
    propAssetData !== undefined ? propAssetData : initialAssetData
  );
  const [beneficiaryData, setBeneficiaryData] = useState(
    propBeneficiaryData !== undefined ? propBeneficiaryData : initialBeneficiaryData
  );

  const [sessions, setSessions] = useState([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [sessionLoadError, setSessionLoadError] = useState(null);
  const [sessionRevision, setSessionRevision] = useState(0);

  // Stale response guards
  const activeCaseRef = useRef(initialEffectiveTrimmed);
  const activeSessionRef = useRef(initialEffectiveSession);

  // Invalidate the loaded snapshot before rendering a different session.
  const [previousSessionProp, setPreviousSessionProp] = useState(propSessionId);
  if (previousSessionProp !== propSessionId) {
    setPreviousSessionProp(propSessionId);
    setSelectedSessionId(propSessionId || '');
    setLoadedCaseId('');
    setAssetData(null);
    setBeneficiaryData(null);
    setLoadError(null);
    setLoading(false);
  }

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
    setLoadError(null);
    setSessions([]);
    setSessionLoadError(null);
    setLoading(false);
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
      setLoadError(null);
    }
  }

  // Update activeCaseRef in effect
  useEffect(() => {
    activeCaseRef.current = caseReference.trim();
  }, [caseReference]);

  // Handle case change via input or UI
  const handleCaseChange = (newRef, item = null) => {
    const trimmed = (newRef || '').trim();
    setCaseReference(newRef);
    activeCaseRef.current = trimmed;
    activeSessionRef.current = '';
    setSelectedSessionId('');
    setSessions([]);
    setSelectedCaseItem(item);
    setSessionRevision(value => value + 1);
    setLoadError(null);
    setSessionLoadError(null);
    setLoading(false);

    // Immediately isolate state: clear prior case data to prevent stale display
    setAssetData(null);
    setBeneficiaryData(null);
    setLoadedCaseId('');

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (trimmed) url.searchParams.set('caseId', trimmed);
      else url.searchParams.delete('caseId');
      url.searchParams.delete('sessionId');
      window.history.replaceState({}, '', url.pathname + url.search);
    }

    if (typeof onCaseChange === 'function') {
      onCaseChange(item || newRef);
    }

  };

  const handleSessionChange = (newSessionId) => {
    setSelectedSessionId(newSessionId);
    activeSessionRef.current = newSessionId;
    setLoadedCaseId('');
    setLoadError(null);
    setAssetData(null);
    setBeneficiaryData(null);
    setLoading(false);

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (newSessionId) url.searchParams.set('sessionId', newSessionId);
      else url.searchParams.delete('sessionId');
      window.history.replaceState({}, '', url.pathname + url.search);
    }

    onSessionChange?.(newSessionId);
  };

  const handleReload = () => {
    setLoadedCaseId('');
    setLoadError(null);
  };

  // Fetch available sessions when caseReference is present and no custom fetcher is used
  useEffect(() => {
    const trimmed = caseReference.trim();
    if (!trimmed || !effectiveAccessToken || onFetchProgress || loadProgress || effectiveIsDevPreview) return;
    const c = new AbortController();
    Promise.resolve().then(() => {
      if (c.signal.aborted) return [];
      setLoadingSessions(true);
      setSessionLoadError(null);
      return listLiveSessions(trimmed, { accessToken: effectiveAccessToken, signal: c.signal });
    })
      .then((items) => {
        if (!c.signal.aborted && activeCaseRef.current === trimmed) {
          const validList = Array.isArray(items) ? items : [];
          setSessions(validList);
          // Auto-select OPEN session if none currently selected
          if (!activeSessionRef.current && validList.length > 0) {
            const openSession = validList.find((s) => s.status === 'OPEN') || validList[0];
            if (openSession?.sessionId) {
              setSelectedSessionId(openSession.sessionId);
              activeSessionRef.current = openSession.sessionId;
              if (typeof window !== 'undefined') {
                const url = new URL(window.location.href);
                url.searchParams.set('sessionId', openSession.sessionId);
                window.history.replaceState({}, '', url.pathname + url.search);
              }
            }
          }
        }
      })
      .catch((error) => {
        if (!c.signal.aborted && activeCaseRef.current === trimmed) {
          setSessions([]);
          setSessionLoadError(error);
          if (error.status === 401) onUnauthorized?.();
        }
      })
      .finally(() => {
        if (!c.signal.aborted) setLoadingSessions(false);
      });

    return () => c.abort();
  }, [caseReference, effectiveAccessToken, onFetchProgress, loadProgress, effectiveIsDevPreview, lang, sessionRevision, onUnauthorized]);

  // Asynchronously fetch progress if fetcher is provided and case is not yet loaded, or on reload
  useEffect(() => {
    const trimmed = caseReference.trim();
    const fetcher = onFetchProgress || loadProgress;
    activeSessionRef.current = selectedSessionId;

    if (trimmed && loadedCaseId !== trimmed) {
      if (typeof fetcher === 'function') {
        const c = new AbortController();
        Promise.resolve().then(() => c.signal.aborted ? null : fetcher(trimmed))
          .then((res) => {
            if (c.signal.aborted || activeCaseRef.current !== trimmed || activeSessionRef.current !== selectedSessionId) return;
            if (res) {
              setAssetData(res.assetData ?? null);
              setBeneficiaryData(res.beneficiaryData ?? null);
              setLoadedCaseId(trimmed);
              setLoadError(null);
            } else {
              setAssetData(null);
              setBeneficiaryData(null);
              setLoadedCaseId(trimmed);
              setLoadError(null);
            }
          })
          .catch((err) => {
            if (c.signal.aborted || activeCaseRef.current !== trimmed || activeSessionRef.current !== selectedSessionId) return;
            setLoadError(err);
            setAssetData(null);
            setBeneficiaryData(null);
            setLoadedCaseId(trimmed);
          });
        return () => c.abort();
      } else if (selectedSessionId) {
        const c = new AbortController();
        Promise.resolve().then(() => {
          if (c.signal.aborted) return null;
          setLoading(true);
          return fetchCompletionProgress(trimmed, selectedSessionId, {
            accessToken: effectiveAccessToken,
            isDevPreview: effectiveIsDevPreview,
            lang,
            signal: c.signal,
          });
        })
          .then((res) => {
            if (activeCaseRef.current !== trimmed || activeSessionRef.current !== selectedSessionId || c.signal.aborted) return;
            if (res) {
              const mappedAsset = res.assets
                ? { total: res.assets.total, delivered: res.assets.completed }
                : (res.assetCompletion ?? null);
              const mappedBeneficiary = res.beneficiaries
                ? { total: res.beneficiaries.total, confirmed: res.beneficiaries.completed }
                : (res.beneficiaryCompletion ?? null);
              setAssetData(mappedAsset);
              setBeneficiaryData(mappedBeneficiary);
              setLoading(false);
              setLoadedCaseId(trimmed);
              setLoadError(null);
            }
          })
          .catch((err) => {
            if (activeCaseRef.current !== trimmed || activeSessionRef.current !== selectedSessionId || c.signal.aborted) return;
            setLoadError(err);
            setAssetData(null);
            setBeneficiaryData(null);
            setLoading(false);
            setLoadedCaseId(trimmed);
            if (err.status === 401) onUnauthorized?.();
          })
          .finally(() => {
            if (!c.signal.aborted) setLoading(false);
          });

        return () => c.abort();
      }
    }
  }, [caseReference, loadedCaseId, selectedSessionId, onFetchProgress, loadProgress, lang, effectiveAccessToken, effectiveIsDevPreview, onUnauthorized]);

  // Evaluate metrics strictly for the active case (only valid when no API error occurred)
  const activeTrimmed = caseReference.trim();
  const hasValidCaseData = Boolean(activeTrimmed && loadedCaseId === activeTrimmed && !loadError);
  const isStateError = loadError?.status === 409 || loadError?.code === 'BASIS_DOSSIER_INVALID_STATE';
  const currentCaseItem = useStaffCaseMetadata(activeTrimmed,
    selectedCaseItem?.caseId === activeTrimmed ? selectedCaseItem : propCaseItem,
    effectiveAccessToken, lang, effectiveIsDevPreview);
  const isClosedCaseError = isStateError && (currentCaseItem?.status === 'CLOSED' || currentCaseItem?.vaultStatus === 'ARCHIVED');
  const effectiveAssetData = hasValidCaseData ? assetData : null;
  const effectiveBeneficiaryData = hasValidCaseData ? beneficiaryData : null;

  const evaluation = evaluateCompletionProgress(
    effectiveAssetData,
    effectiveBeneficiaryData
  );
  const { overallStatus, assetMetric, beneficiaryMetric, missingConditions } = evaluation;

  return (
    <div className="lv-completion-progress-view">
      <StaffWorkflowGuide current="confirmation" caseId={activeTrimmed} sessionId={selectedSessionId} lang={lang}
        caseStatus={currentCaseItem?.status} vaultStatus={currentCaseItem?.vaultStatus} preview={effectiveIsDevPreview && !effectiveAccessToken}
        assets={effectiveAssetData} beneficiaries={effectiveBeneficiaryData} loading={loading || loadingSessions} error={loadError} />
      {/* Context navigation back */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {activeTrimmed && selectedSessionId && (
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(activeTrimmed)}&sessionId=${encodeURIComponent(selectedSessionId)}${effectiveIsDevPreview ? '&preview=true' : ''}`}
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
                  className="lv-progress-btn-primary"
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
      <div className="lv-progress-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 className="lv-progress-title">{t.pageTitle}</h1>
        </div>
        {activeTrimmed && selectedSessionId && !isClosedCaseError && (
          <button
            type="button"
            className="lv-progress-btn-reload"
            onClick={handleReload}
            disabled={loading}
          >
            <RotateCw size={14} className={loading ? 'lv-spin' : ''} aria-hidden="true" />
            <span>{loading ? t.reloadingBtn : t.reloadBtn}</span>
          </button>
        )}
      </div>

      {/* Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={caseReference}
        caseItem={currentCaseItem}
        sessionId={selectedSessionId}
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
          handleCaseChange(newId, item);
        }}
        accessToken={effectiveAccessToken}
        isDevPreview={effectiveIsDevPreview}
        lang={lang}
        currentCaseId={caseReference}
        onUnauthorized={onUnauthorized}
      />

      {/* Case Selector Card */}
      <details className="lv-progress-technical"><summary>{lang === 'en' ? 'Technical case reference' : 'Mã kỹ thuật hồ sơ'}</summary>
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
        </div>
      </section>

      </details>
      {/* Session Switcher Bar (when multiple sessions exist) */}
      {activeTrimmed && selectedSessionId && sessions.length > 1 && (
        <div className="lv-progress-session-bar">
          <span style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
            {t.sessionLabel}:
          </span>
          <select
            className="lv-progress-session-select"
            value={selectedSessionId}
            onChange={(e) => handleSessionChange(e.target.value)}
          >
            {sessions.map((s) => (
              <option key={s.sessionId} value={s.sessionId}>
                {formatStaffSession(s, lang)}
              </option>
            ))}
          </select>
        </div>
      )}

      {sessionLoadError && (
        <section className="lv-progress-card" role="alert">
          <h3>{t.sessionLoadFailed}</h3>
          <p>{sessionLoadError.status === 403
            ? (lang === 'en' ? 'You do not have access to the sessions for this case.' : 'Bạn không có quyền xem các phiên của hồ sơ này.')
            : sessionLoadError.status === 404 ? t.errorNotFoundDesc : t.sessionLoadFailed}</p>
          <button type="button" className="lv-progress-btn-reload" disabled={loadingSessions}
            onClick={() => setSessionRevision(value => value + 1)}>{t.retryBtn}</button>
        </section>
      )}

      {/* Warning/Prompt when Case is selected but Session is missing */}
      {activeTrimmed && !selectedSessionId && (
        <section className="lv-progress-card" style={{ borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <Clock size={22} style={{ color: '#d97706', flexShrink: 0, marginTop: '2px' }} aria-hidden="true" />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', width: '100%' }}>
              <h3 style={{ margin: 0, fontSize: '15px', fontWeight: 600, color: '#92400e' }}>
                {t.noSessionPrompt}
              </h3>
              <p style={{ margin: 0, fontSize: '13.5px', color: '#78350f' }}>
                {t.noSessionDesc}
              </p>
              {sessions.length > 0 ? (
                <div style={{ marginTop: '8px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                  <label htmlFor="session-picker-select" style={{ fontSize: '13px', fontWeight: 600, color: '#334155' }}>
                    {t.sessionLabel}:
                  </label>
                  <select
                    id="session-picker-select"
                    className="lv-progress-session-select"
                    value={selectedSessionId}
                    onChange={(e) => handleSessionChange(e.target.value)}
                  >
                    <option value="">-- {t.selectSessionPrompt} --</option>
                    {sessions.map((s) => (
                      <option key={s.sessionId} value={s.sessionId}>
                        {formatStaffSession(s, lang)}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <div style={{ marginTop: '8px' }}>
                  <p style={{ margin: '0 0 10px', fontSize: '13px', color: '#64748b' }}>
                    {loadingSessions ? (lang === 'en' ? 'Loading sessions…' : 'Đang tải danh sách phiên…') : sessionLoadError ? t.sessionLoadFailed : t.noSessionsFound}
                  </p>
                  <a
                    href={`/staff/handover?caseId=${encodeURIComponent(activeTrimmed)}`}
                    className="lv-progress-btn-primary"
                  >
                    {t.openSessionAction} →
                  </a>
                </div>
              )}
            </div>
          </div>
        </section>
      )}

      {/* API Error Context Banner */}
      {loadError && (
        <section
          className={`lv-progress-error-banner ${
            isClosedCaseError
              ? 'lv-progress-error-banner--closed'
              : ''
          }`}
          role="alert"
          aria-labelledby="api-error-heading"
        >
          <AlertCircle size={24} className="lv-progress-error-banner__icon" aria-hidden="true" />
          <div className="lv-progress-error-banner__body">
            <h2 id="api-error-heading" className="lv-progress-error-banner__title">
              {isClosedCaseError
                ? t.errorClosedCaseTitle
                : isStateError ? t.errorStateTitle
                : loadError.status === 404 || loadError.code === 'RESOURCE_NOT_FOUND'
                ? t.errorNotFoundTitle
                : (lang === 'en' ? 'Unable to load completion progress' : 'Chưa tải được tiến độ hoàn tất')}
            </h2>
            <p>
              {isClosedCaseError
                ? t.errorClosedCaseDesc
                : isStateError ? (loadError.message || t.errorStateDesc)
                : loadError.status === 404 || loadError.code === 'RESOURCE_NOT_FOUND'
                ? t.errorNotFoundDesc
                : loadError.message || (lang === 'en' ? 'Network or server error. Please try again.' : 'Lỗi kết nối hoặc máy chủ. Vui lòng thử lại.')}
            </p>
            <div style={{ marginTop: '10px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
              {isClosedCaseError && (
                <a
                  href={`/staff/close-and-archive?caseId=${encodeURIComponent(activeTrimmed)}&sessionId=${encodeURIComponent(selectedSessionId)}`}
                  className="lv-progress-btn-primary"
                >
                  <span>{t.errorClosedCaseAction}</span>
                  <ExternalLink size={14} aria-hidden="true" />
                </a>
              )}
              {!isClosedCaseError && <button
                type="button"
                className="lv-progress-btn-reload"
                onClick={handleReload}
                disabled={loading}
              >
                <RotateCw size={14} className={loading ? 'lv-spin' : ''} aria-hidden="true" />
                <span>{loading ? t.reloadingBtn : t.retryBtn}</span>
              </button>}
            </div>
          </div>
        </section>
      )}

      {/* Overall Completion Evaluation Banner (Only when NO API Error) */}
      {!loadError && overallStatus === COMPLETION_PROGRESS_STATUS.COMPLETED && (
        <section className="lv-overall-banner lv-overall-banner--completed" role="status" aria-labelledby="complete-banner-heading">
          <Award size={28} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="complete-banner-heading" className="lv-overall-banner__title">{t.overallCompletedTitle}</h2>
          </div>
        </section>
      )}

      {!loadError && overallStatus === COMPLETION_PROGRESS_STATUS.INCOMPLETE && (
        <section className="lv-overall-banner lv-overall-banner--incomplete" role="alert" aria-labelledby="incomplete-banner-heading">
          <AlertTriangle size={26} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="incomplete-banner-heading" className="lv-overall-banner__title">{t.overallIncompleteTitle}</h2>
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

      {!loadError && overallStatus === COMPLETION_PROGRESS_STATUS.INDETERMINATE && (
        <section className="lv-overall-banner lv-overall-banner--awaiting" role="status" aria-labelledby="awaiting-banner-heading">
          <HelpCircle size={26} className="lv-overall-banner__icon" aria-hidden="true" />
          <div className="lv-overall-banner__body">
            <h2 id="awaiting-banner-heading" className="lv-overall-banner__title">{t.overallAwaitingTitle}</h2>
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
      {!loadError && (assetMetric.isVerified || beneficiaryMetric.isVerified) && <div className="lv-dual-metrics-grid">
        {/* Metric 1: Asset Delivery Progress */}
        <section className="lv-metric-card lv-staff-glow" aria-labelledby="asset-metric-heading">
          <div className="lv-metric-card__header">
            <div>
              <h2 id="asset-metric-heading" className="lv-metric-card__title">{t.assetProgressCardTitle}</h2>
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
        <section className="lv-metric-card lv-staff-glow" aria-labelledby="ben-metric-heading">
          <div className="lv-metric-card__header">
            <div>
              <h2 id="ben-metric-heading" className="lv-metric-card__title">{t.benProgressCardTitle}</h2>
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
      </div>}
    </div>
  );
}
