import { useState, useEffect, useRef } from 'react';
import { Scale, ShieldCheck, Globe, RefreshCw, LogOut, Sparkles, FileText, Hash, AlertTriangle, CheckCircle2, AlertCircle, Eye, Layers, Info } from 'lucide-react';
import { Button } from '../../components/common/Button.jsx';
import { useModalFocus } from '../../components/common/useModalFocus.js';
import { getLegalApprovalTranslations } from './legalApprovalI18n.js';
import {
  LEGAL_APPROVAL_DECISIONS,
  SYNTHETIC_APPROVAL_DOSSIERS,
  fetchDossierForApproval,
  submitLegalApproval,
  validateApprovalForm,
  validateApprovalReceipt,
  assessApprovalFreshness,
} from './legalApprovalService.js';
import './LegalApprovalReviewPage.css';

/**
 * LegalApprovalReviewPage — Màn hình Phê duyệt Pháp lý Hồ sơ Di sản (PS-49)
 *
 * YÊU CẦU NGHIỆP VỤ & PHÁP LÝ (LV-DEATH-002 & PS-49):
 * 1. Phê duyệt pháp lý gắn chặt với version, mã băm SHA-256 và allocation scope cụ thể.
 * 2. Thay đổi bất kỳ thuộc tính nào hoặc phát sinh tranh chấp mới khiến phê duyệt cũ bị STALE.
 * 3. Phê duyệt KHÔNG đồng nghĩa Vault đã UNLOCKED, không tự giải mã hoặc bàn giao tài sản.
 * 4. Không tự ý bịa version 1 hoặc hash nếu dữ liệu bị thiếu.
 */
export default function LegalApprovalReviewPage(props) {
  const [selectedScenario, setSelectedScenario] = useState(() => {
    if (props.dossierId) return props.dossierId;
    if (typeof window !== 'undefined') {
      try {
        const params = new URLSearchParams(window.location.search);
        const scenario = params.get('scenario') || params.get('dossier') || params.get('case');
        if (scenario && (SYNTHETIC_APPROVAL_DOSSIERS[scenario] || ['loading', 'error', 'not_found'].includes(scenario))) {
          return scenario;
        }
      } catch {
        // Fallback
      }
    }
    return 'dossier-001';
  });

  const handleSelectScenario = (val) => {
    setSelectedScenario(val);
    if (typeof window !== 'undefined' && window.history?.replaceState) {
      const url = new URL(window.location.href);
      url.searchParams.set('scenario', val);
      window.history.replaceState({}, '', url.toString());
    }
  };

  const scope = JSON.stringify([
    props.dossierId,
    selectedScenario,
    props.accessToken,
    Boolean(props.isDevPreview),
  ]);
  return (
    <ApprovalReviewContent
      key={scope}
      {...props}
      selectedScenario={selectedScenario}
      onSelectScenario={handleSelectScenario}
    />
  );
}

function ApprovalReviewContent({
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  onToggleLang,
  onLogout,
  onUnauthorized,
  onRefresh,
  isRefreshing = false,
  selectedScenario = 'dossier-001',
  onSelectScenario,
  loadDossier = fetchDossierForApproval,
  onSubmitApproval = submitLegalApproval,
}) {
  const t = getLegalApprovalTranslations(lang);

  // Data & Async States
  const [dossier, setDossier] = useState(null);
  const [freshness, setFreshness] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [retryCount, setRetryCount] = useState(0);

  // Form State (Không chọn sẵn quyết định!)
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Submission States
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successReceipt, setSuccessReceipt] = useState(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const confirmModalRef = useModalFocus(showConfirmModal, () => setShowConfirmModal(false), isSubmitting);

  // Refs for race-condition prevention
  const activeScenarioRef = useRef(selectedScenario);
  const loadAbortRef = useRef(null);
  const submitAbortRef = useRef(null);
  const isSubmittingRef = useRef(false);

  // Helper định dạng ngày giờ theo locale
  const formatDateTime = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  // Tải dữ liệu hồ sơ theo kịch bản / ID
  useEffect(() => {
    activeScenarioRef.current = selectedScenario;

    if (loadAbortRef.current) {
      loadAbortRef.current.abort();
    }
    const controller = new AbortController();
    loadAbortRef.current = controller;

    // Xử lý mô phỏng loading vô hạn nếu kịch bản là 'loading'
    if (selectedScenario === 'loading' && isDevPreview) {
      return () => controller.abort();
    }

    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setIsLoading(true);
      setLoadError(null);

      return loadDossier(selectedScenario, {
        accessToken,
        isDevPreview,
        lang,
        signal: controller.signal,
      });
    })
      .then((res) => {
        if (controller.signal.aborted || activeScenarioRef.current !== selectedScenario) return;
        setDossier(res.dossier);
        setFreshness(res.freshness || assessApprovalFreshness(res.dossier));
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (controller.signal.aborted || activeScenarioRef.current !== selectedScenario) return;
        if (err?.status === 401) {
          (onUnauthorized || onLogout)?.();
          return;
        }
        setLoadError(err);
        setDossier(null);
        setFreshness(null);
      })
      .finally(() => {
        if (!controller.signal.aborted && activeScenarioRef.current === selectedScenario) {
          setIsLoading(false);
          loadAbortRef.current = null;
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedScenario, accessToken, isDevPreview, retryCount, loadDossier, lang, onUnauthorized, onLogout]);

  // Clean up submit on unmount
  useEffect(() => {
    return () => {
      if (submitAbortRef.current) submitAbortRef.current.abort();
    };
  }, []);

  // Handlers
  const handleResetScenario = () => {
    submitAbortRef.current?.abort();
    loadAbortRef.current?.abort();
    isSubmittingRef.current = false;
    setIsSubmitting(false);
    setDecision('');
    setReason('');
    setFieldErrors({});
    setSuccessReceipt(null);
    setSubmitError(null);
    setShowConfirmModal(false);
    setRetryCount((c) => c + 1);
  };

  const handleSelectScenario = (e) => {
    onSelectScenario?.(e.target.value);
  };

  const handleSelectDecision = (val) => {
    setDecision(val);
    if (fieldErrors.decision) {
      setFieldErrors((prev) => ({ ...prev, decision: undefined }));
    }
  };

  const handleChangeReason = (e) => {
    setReason(e.target.value);
    if (fieldErrors.reason) {
      setFieldErrors((prev) => ({ ...prev, reason: undefined }));
    }
  };

  const handleOpenConfirmModal = (e) => {
    e?.preventDefault();
    const validation = validateApprovalForm({ decision, reason }, lang);
    if (!validation.isValid) {
      setFieldErrors(validation.errors);
      return;
    }
    setFieldErrors({});
    setShowConfirmModal(true);
  };

  const handleCloseConfirmModal = () => {
    setShowConfirmModal(false);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);

    // Chống gửi lặp đồng bộ
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
    }
    const controller = new AbortController();
    submitAbortRef.current = controller;

    try {
      const targetDossierId = dossier?.id || selectedScenario;
      const rawReceipt = await onSubmitApproval(
        targetDossierId,
        { decision, reason },
        {
          accessToken,
          isDevPreview,
          lang,
          currentVersion: dossier?.documentVersion,
          currentHash: dossier?.documentHash,
          scopeFingerprint: dossier?.scopeFingerprint,
          signal: controller.signal,
        }
      );

      // Validate receipt view model
      const validated = validateApprovalReceipt(rawReceipt, targetDossierId, {
        expectedDecision: decision,
        expectedVersion: dossier?.documentVersion,
        expectedHash: dossier?.documentHash,
        expectedScope: dossier?.scopeFingerprint,
        isDevPreview,
      });

      if (activeScenarioRef.current === selectedScenario && !controller.signal.aborted) {
        setSuccessReceipt(validated);
        // Reset form inputs sau khi duyệt thành công
        setDecision('');
        setReason('');
      }
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (activeScenarioRef.current === selectedScenario) {
        if (err?.status === 401) {
          (onUnauthorized || onLogout)?.();
          return;
        }
        // Giữ nguyên form để thử lại
        setSubmitError(err);
      }
    } finally {
      isSubmittingRef.current = false;
      setIsSubmitting(false);
      submitAbortRef.current = null;
    }
  };

  const isLiveNotReady = loadError?.code === 'BACKEND_NOT_READY' || loadError?.status === 503;

  return (
    <div className="lv-legal-approval-root">
      {/* Top Header */}
      <header className="lv-legal-approval-header" role="banner">
        <div className="lv-legal-approval-header__inner">
          <div className="lv-legal-approval-header__brand-group">
            <div className="lv-legal-approval-header__logo-wrap" aria-hidden="true">
              <Scale size={20} />
            </div>
            <div className="lv-legal-approval-header__titles">
              <div className="lv-legal-approval-header__brand-name">
                <span>LegacyVault</span>
                {isDevPreview && (
                  <span className="lv-legal-approval-tag" title="DEV Preview">
                    <Sparkles size={11} aria-hidden="true" />
                    <span>{t.previewTag}</span>
                  </span>
                )}
              </div>
              <div className="lv-legal-approval-header__portal-title">
                {t.portalTitle}
              </div>
            </div>
          </div>

          <div className="lv-legal-approval-header__actions">
            <div className="lv-legal-approval-header__role-pill" title={t.roleBadge}>
              <ShieldCheck size={14} aria-hidden="true" />
              <span>{t.roleBadge}</span>
            </div>

            <button
              type="button"
              className="lv-legal-approval-btn"
              onClick={() => onToggleLang?.(lang === 'vi' ? 'en' : 'vi')}
              aria-label={lang === 'vi' ? 'Switch to English' : 'Chuyển sang Tiếng Việt'}
              title={lang === 'vi' ? 'English' : 'Tiếng Việt'}
            >
              <Globe size={15} aria-hidden="true" />
              <span>{lang.toUpperCase()}</span>
            </button>

            {onRefresh && (
              <button
                type="button"
                className={`lv-legal-approval-btn ${isRefreshing ? 'lv-legal-approval-btn--spinning' : ''}`}
                onClick={onRefresh}
                disabled={isRefreshing}
                aria-label={isRefreshing ? t.refreshingBtn : t.refreshBtn}
                title={t.refreshBtn}
              >
                <RefreshCw size={15} aria-hidden="true" />
              </button>
            )}

            {onLogout && (
              <button
                type="button"
                className="lv-legal-approval-btn lv-legal-approval-btn--logout"
                onClick={onLogout}
                aria-label={t.logoutBtn}
                title={t.logoutBtn}
              >
                <LogOut size={15} aria-hidden="true" />
                <span>{t.logoutBtn}</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container */}
      <main className="lv-legal-approval-main" id="legal-approval-content">
        <div className="lv-legal-approval-container">
          {/* Page Titles */}
          <div className="lv-legal-approval-title-wrap">
            <h1 className="lv-legal-approval-title">{t.pageTitle}</h1>
            <p className="lv-legal-approval-subtitle">{t.pageSubtitle}</p>
          </div>

          {/* Scenario Selector in DEV Preview */}
          {isDevPreview && (
            <div className="lv-legal-approval-scenario-bar" role="region" aria-label={t.scenarioBar.label}>
              <span className="lv-legal-approval-scenario-label">
                <Sparkles size={14} aria-hidden="true" />
                <span>{t.scenarioBar.label}</span>
              </span>
              <select
                className="lv-legal-approval-scenario-select"
                value={selectedScenario}
                onChange={handleSelectScenario}
                aria-label={t.scenarioBar.label}
              >
                <option value="dossier-001">{t.scenarioBar.complete}</option>
                <option value="dossier-002">{t.scenarioBar.stale}</option>
                <option value="dossier-003">{t.scenarioBar.disputed}</option>
                <option value="dossier-004">{t.scenarioBar.missingScope}</option>
                <option value="loading">{lang === 'en' ? 'Loading state' : 'Đang tải'}</option>
                <option value="error">{lang === 'en' ? 'Load error' : 'Lỗi tải dữ liệu'}</option>
                <option value="not_found">{lang === 'en' ? 'Not found' : 'Không tìm thấy'}</option>
              </select>
              <button
                type="button"
                className="lv-legal-approval-reset-btn"
                onClick={handleResetScenario}
                title={t.scenarioBar.resetBtn}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '6px',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  border: '1px solid #cbd5e1',
                  background: '#ffffff',
                  color: '#334155',
                  fontSize: '13px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                <RefreshCw size={13} aria-hidden="true" />
                <span>{t.scenarioBar.resetBtn}</span>
              </button>
              <div className="lv-legal-approval-state-pills" style={{ display: 'flex', gap: '8px', marginLeft: 'auto', alignItems: 'center' }}>
                <span className="lv-state-pill lv-state-pill--initial" style={{ fontSize: '11px', background: '#f1f5f9', padding: '3px 8px', borderRadius: '4px', color: '#475569' }}>
                  {lang === 'en' ? 'Initial:' : 'Khởi đầu:'} <strong>{dossier?.status || selectedScenario}</strong>
                </span>
                <span className="lv-state-pill lv-state-pill--current" style={{ fontSize: '11px', background: successReceipt ? '#ecfdf5' : '#eff6ff', color: successReceipt ? '#065f46' : '#1e40af', padding: '3px 8px', borderRadius: '4px' }}>
                  {lang === 'en' ? 'Current:' : 'Hiện tại:'} <strong>{successReceipt ? (successReceipt.decision === 'APPROVE' ? 'APPROVED' : 'REJECTED') : (dossier?.status || 'READY')}</strong>
                </span>
              </div>
            </div>
          )}

          {/* Collapsible Legal Authority Boundary Guidance */}
          <details className="lv-legal-approval-boundary lv-legal-approval-boundary--collapsible" role="note" aria-label={t.boundary.title} style={{ marginBottom: '20px' }}>
            <summary style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', listStyle: 'none' }}>
              <Scale size={18} className="lv-legal-approval-boundary__icon" aria-hidden="true" />
              <span style={{ fontWeight: 600, fontSize: '14px', color: '#164639' }}>{t.boundary.title}</span>
              <span style={{ fontSize: '12px', color: '#6b726b', marginLeft: 'auto' }}>
                {lang === 'en' ? '(Click to view guidance)' : '(Bấm để mở trợ giúp)'}
              </span>
            </summary>
            <div className="lv-legal-approval-boundary__body" style={{ marginTop: '12px' }}>
              <ul className="lv-legal-approval-boundary__list">
                <li>{t.boundary.notice1}</li>
                <li>{t.boundary.notice2}</li>
                <li>{t.boundary.notice3}</li>
              </ul>
            </div>
          </details>

          {/* Async Loading / Error / Not Ready Views */}
          {isLoading ? (
            <div className="lv-legal-approval-card" style={{ padding: '48px', textAlign: 'center', color: '#6b726b' }}>
              <RefreshCw size={24} className="lv-legal-approval-btn--spinning" aria-hidden="true" style={{ margin: '0 auto 12px' }} />
              <p>{t.refreshingBtn}</p>
            </div>
          ) : isLiveNotReady ? (
            <div className="lv-legal-approval-card" role="status" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <Scale size={32} color="#c5a059" aria-hidden="true" style={{ margin: '0 auto 12px' }} />
              <h2 style={{ fontFamily: "'Playfair Display', Georgia, serif", color: '#164639', margin: '0 0 8px' }}>
                {t.liveNotReady.title}
              </h2>
              <p style={{ color: '#6b726b', maxWidth: '520px', margin: '0 auto' }}>
                {t.liveNotReady.desc}
              </p>
            </div>
          ) : loadError?.status === 403 ? (
            <div className="lv-legal-approval-card" role="alert" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <ShieldCheck size={32} color="#a83232" aria-hidden="true" style={{ margin: '0 auto 12px' }} />
              <h2 style={{ color: '#a83232', margin: '0 0 8px' }}>{t.forbiddenState?.title || 'Không có quyền truy cập'}</h2>
              <p style={{ color: '#6b726b', marginBottom: '16px' }}>{t.forbiddenState?.desc || loadError.message}</p>
            </div>
          ) : loadError ? (
            <div className="lv-legal-approval-card" role="alert" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <AlertCircle size={32} color="#a83232" aria-hidden="true" style={{ margin: '0 auto 12px' }} />
              <h2 style={{ color: '#a83232', margin: '0 0 8px' }}>{t.errorState.title}</h2>
              <p style={{ color: '#6b726b', marginBottom: '16px' }}>{loadError.message}</p>
              <Button variant="secondary" onClick={() => setRetryCount((c) => c + 1)}>
                {t.errorState.btnRetry}
              </Button>
            </div>
          ) : !dossier ? (
            <div className="lv-legal-approval-card" role="status" style={{ textAlign: 'center', padding: '48px 24px' }}>
              <FileText size={32} color="#6b726b" aria-hidden="true" style={{ margin: '0 auto 12px' }} />
              <h2 style={{ color: '#164639', margin: '0 0 8px' }}>{t.notFoundState.title}</h2>
              <p style={{ color: '#6b726b' }}>{t.notFoundState.desc}</p>
            </div>
          ) : (
            <>
              {/* Success Receipt Banner */}
              {successReceipt && (
                <section className="lv-legal-approval-receipt" role="status" aria-label={t.receiptCard.title}>
                  <div className="lv-legal-approval-receipt__top">
                    <h2 className="lv-legal-approval-receipt__title">
                      <CheckCircle2 size={22} color="#164639" aria-hidden="true" />
                      <span>{t.receiptCard.title}</span>
                      <span className="lv-legal-approval-tag">
                        <Sparkles size={11} aria-hidden="true" />
                        <span>{t.receiptCard.simulationTag}</span>
                      </span>
                    </h2>
                    <Button variant="ghost" size="sm" onClick={() => setSuccessReceipt(null)}>
                      {t.receiptCard.btnCloseReceipt}
                    </Button>
                  </div>

                  <div className="lv-legal-approval-receipt__grid">
                    <div className="lv-legal-approval-meta-item">
                      <span className="lv-legal-approval-meta-item__label">{t.receiptCard.receiptId}</span>
                      <span className="lv-legal-approval-meta-item__val">{successReceipt.id}</span>
                    </div>
                    <div className="lv-legal-approval-meta-item">
                      <span className="lv-legal-approval-meta-item__label">{t.receiptCard.decisionLabel}</span>
                      <span className="lv-legal-approval-meta-item__val">
                        <span className={`lv-legal-approval-badge ${successReceipt.decision === 'APPROVE' ? 'lv-legal-approval-badge--fresh' : 'lv-legal-approval-badge--disputed'}`}>
                          {successReceipt.decision === 'APPROVE' ? t.decisionSection.approveOption : t.decisionSection.rejectOption}
                        </span>
                      </span>
                    </div>
                    <div className="lv-legal-approval-meta-item">
                      <span className="lv-legal-approval-meta-item__label">{t.receiptCard.approvedVersion}</span>
                      <span className="lv-legal-approval-meta-item__val">v{successReceipt.approvedVersion}</span>
                    </div>
                    <div className="lv-legal-approval-meta-item">
                      <span className="lv-legal-approval-meta-item__label">{t.receiptCard.recordedAt}</span>
                      <span className="lv-legal-approval-meta-item__val">{formatDateTime(successReceipt.recordedAt)}</span>
                    </div>
                  </div>

                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.confirmModal.reasonLabel}</span>
                    <p style={{ margin: 0, fontSize: '13.5px', color: '#1f2421' }}>{successReceipt.reason}</p>
                  </div>
                </section>
              )}

              {/* Submit Error Callout */}
              {submitError && (
                <div className="lv-legal-approval-callout lv-legal-approval-callout--disputed" role="alert">
                  <AlertCircle size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '12px', flexWrap: 'wrap' }}>
                    <span>{submitError.message || t.errorState.title}</span>
                    <Button variant="danger" size="sm" onClick={handleConfirmSubmit} isLoading={isSubmitting}>
                      {t.errorState.btnRetry}
                    </Button>
                  </div>
                </div>
              )}

              {/* 1. Thông tin Tham chiếu Hồ sơ Di sản */}
              <section className="lv-legal-approval-card" aria-label={t.dossierSection.title}>
                <div className="lv-legal-approval-card__header">
                  <h2 className="lv-legal-approval-card__title">
                    <FileText size={18} className="lv-legal-approval-card__title-icon" aria-hidden="true" />
                    <span>{t.dossierSection.title}</span>
                  </h2>
                  <span className="lv-legal-approval-badge lv-legal-approval-badge--warning">
                    {dossier.status}
                  </span>
                </div>

                <div className="lv-legal-approval-meta-grid">
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.dossierSection.dossierId}</span>
                    <span className="lv-legal-approval-meta-item__val">{dossier.dossierId || t.dossierSection.unspecified}</span>
                  </div>
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.dossierSection.ownerName}</span>
                    <span className="lv-legal-approval-meta-item__val">{dossier.ownerName || t.dossierSection.unspecified}</span>
                  </div>
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.dossierSection.vaultName}</span>
                    <span className="lv-legal-approval-meta-item__val">{dossier.vaultName || t.dossierSection.unspecified}</span>
                    {dossier.vaultId && <span className="lv-legal-approval-meta-item__sub">{dossier.vaultId}</span>}
                  </div>
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.dossierSection.createdAt}</span>
                    <span className="lv-legal-approval-meta-item__val">{formatDateTime(dossier.createdAt)}</span>
                  </div>
                </div>
              </section>

              {/* 2. Phiên bản Văn bản Di chúc & Mã băm Toàn vẹn (SHA-256) */}
              <section className="lv-legal-approval-card" aria-label={t.integritySection.title}>
                <div className="lv-legal-approval-card__header">
                  <h2 className="lv-legal-approval-card__title">
                    <Hash size={18} className="lv-legal-approval-card__title-icon" aria-hidden="true" />
                    <span>{t.integritySection.title}</span>
                  </h2>
                  {dossier.documentHash ? (
                    <span className="lv-legal-approval-badge lv-legal-approval-badge--fresh">
                      <CheckCircle2 size={12} aria-hidden="true" />
                      <span>{t.integritySection.hashMatchBadge}</span>
                    </span>
                  ) : (
                    <span className="lv-legal-approval-badge lv-legal-approval-badge--disputed">
                      <AlertTriangle size={12} aria-hidden="true" />
                      <span>{t.integritySection.hashUnspecifiedBadge}</span>
                    </span>
                  )}
                </div>

                <div className="lv-legal-approval-meta-grid">
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.integritySection.versionLabel}</span>
                    <span className="lv-legal-approval-meta-item__val">
                      {dossier.documentVersion ? `Version ${dossier.documentVersion}` : t.dossierSection.unspecified}
                    </span>
                  </div>
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.integritySection.fileNameLabel}</span>
                    <span className="lv-legal-approval-meta-item__val">{dossier.fileName || t.dossierSection.unspecified}</span>
                    {dossier.fileSizeFormatted && <span className="lv-legal-approval-meta-item__sub">{dossier.fileSizeFormatted}</span>}
                  </div>
                  <div className="lv-legal-approval-meta-item">
                    <span className="lv-legal-approval-meta-item__label">{t.integritySection.uploadedAtLabel}</span>
                    <span className="lv-legal-approval-meta-item__val">{formatDateTime(dossier.uploadedAt)}</span>
                  </div>
                </div>

                <div style={{ marginTop: '16px' }} className="lv-legal-approval-meta-item">
                  <span className="lv-legal-approval-meta-item__label">{t.integritySection.hashLabel}</span>
                  <div className="lv-legal-approval-meta-item__hash">
                    {dossier.documentHash || t.dossierSection.unspecified}
                  </div>
                  <span className="lv-legal-approval-hint" style={{ marginTop: '6px' }}>
                    {t.integritySection.hashHint}
                  </span>
                </div>
              </section>

              {/* 3. Phạm vi Phân bổ Tài sản & Người Thụ hưởng (Allocation Scope) */}
              <section className="lv-legal-approval-card" aria-label={t.scopeSection.title}>
                <div className="lv-legal-approval-card__header">
                  <h2 className="lv-legal-approval-card__title">
                    <Layers size={18} className="lv-legal-approval-card__title-icon" aria-hidden="true" />
                    <span>{t.scopeSection.title}</span>
                  </h2>
                  {dossier.scopeFingerprint && (
                    <span className="lv-legal-approval-tag">
                      <span>{dossier.scopeFingerprint}</span>
                    </span>
                  )}
                </div>

                {dossier.allocationScope && dossier.allocationScope.length > 0 ? (
                  <div className="lv-legal-approval-table-responsive">
                    <table className="lv-legal-approval-table" aria-label={t.scopeSection.title}>
                      <thead>
                        <tr>
                          <th scope="col">{t.scopeSection.tableAsset}</th>
                          <th scope="col">{t.scopeSection.tableCategory}</th>
                          <th scope="col">{t.scopeSection.tableBeneficiary}</th>
                          <th scope="col">{t.scopeSection.tableShare}</th>
                          <th scope="col">{t.scopeSection.tableConditions}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {dossier.allocationScope.map((alloc) => (
                          <tr key={alloc.id}>
                            <td style={{ fontWeight: 600 }}>{alloc.assetName}</td>
                            <td>{alloc.category}</td>
                            <td>
                              <div>
                                <span style={{ fontWeight: 600 }}>{alloc.beneficiaryName}</span>
                                {alloc.relationship && (
                                  <span style={{ display: 'block', fontSize: '12px', color: '#6b726b' }}>
                                    ({alloc.relationship})
                                  </span>
                                )}
                              </div>
                            </td>
                            <td style={{ fontWeight: 700, color: '#164639' }}>{alloc.share}</td>
                            <td style={{ fontSize: '12.5px', color: alloc.conditions ? '#1f2421' : '#6b726b' }}>
                              {alloc.conditions || t.scopeSection.noConditions}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="lv-legal-approval-callout lv-legal-approval-callout--warning" role="alert">
                    <AlertTriangle size={20} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <div>
                      <h3 style={{ margin: '0 0 4px', fontSize: '14.5px', fontWeight: 700 }}>
                        {t.scopeSection.emptyScopeTitle}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13px' }}>{t.scopeSection.emptyScopeDesc}</p>
                    </div>
                  </div>
                )}
              </section>

              {/* 4. Tình trạng Hiệu lực Phê duyệt & Tranh chấp */}
              <section className="lv-legal-approval-card" aria-label={t.approvalStatusSection.title}>
                <div className="lv-legal-approval-card__header">
                  <h2 className="lv-legal-approval-card__title">
                    <ShieldCheck size={18} className="lv-legal-approval-card__title-icon" aria-hidden="true" />
                    <span>{t.approvalStatusSection.title}</span>
                  </h2>
                  <span
                    className={`lv-legal-approval-badge ${
                      freshness?.status === 'FRESH' || freshness?.status === 'PENDING_INITIAL_APPROVAL'
                        ? 'lv-legal-approval-badge--fresh'
                        : freshness?.status === 'STALE'
                        ? 'lv-legal-approval-badge--stale'
                        : 'lv-legal-approval-badge--disputed'
                    }`}
                  >
                    {freshness?.status || 'UNKNOWN'}
                  </span>
                </div>

                {freshness?.status === 'DISPUTED' ? (
                  <div className="lv-legal-approval-callout lv-legal-approval-callout--disputed" role="alert">
                    <AlertTriangle size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <div>
                      <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700 }}>
                        {t.approvalStatusSection.disputedTitle}
                      </h3>
                      <p style={{ margin: '0 0 8px', fontSize: '13.5px' }}>{t.approvalStatusSection.disputedDesc}</p>
                      {freshness.disputeDetails && (
                        <div style={{ backgroundColor: '#ffffff', padding: '10px 14px', borderRadius: '6px', fontSize: '13px', border: '1px solid #fecaca' }}>
                          <strong>{t.approvalStatusSection.disputeDetails}</strong> {freshness.disputeDetails}
                        </div>
                      )}
                    </div>
                  </div>
                ) : freshness?.status === 'STALE' ? (
                  <div className="lv-legal-approval-callout lv-legal-approval-callout--stale" role="alert">
                    <AlertTriangle size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <div>
                      <h3 style={{ margin: '0 0 6px', fontSize: '15px', fontWeight: 700 }}>
                        {t.approvalStatusSection.staleTitle}
                      </h3>
                      <p style={{ margin: '0 0 8px', fontSize: '13.5px' }}>{t.approvalStatusSection.staleDesc}</p>
                      {freshness.previousApproval && (
                        <p style={{ margin: 0, fontSize: '12.5px', color: '#78350f' }}>
                          {lang === 'en' ? 'Previous approval: Version' : 'Lần duyệt trước: Phiên bản'} v{freshness.previousApproval.approvedVersion} {lang === 'en' ? 'by' : 'bởi'} {freshness.previousApproval.approvedBy} ({formatDateTime(freshness.previousApproval.approvedAt)}).
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="lv-legal-approval-callout lv-legal-approval-callout--fresh" role="status">
                    <CheckCircle2 size={22} aria-hidden="true" style={{ flexShrink: 0 }} />
                    <div>
                      <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 700 }}>
                        {t.approvalStatusSection.freshTitle}
                      </h3>
                      <p style={{ margin: 0, fontSize: '13.5px' }}>{t.approvalStatusSection.freshDesc}</p>
                    </div>
                  </div>
                )}
              </section>

              {/* 5. Biểu mẫu Quyết định Thẩm định Pháp lý */}
              <section className="lv-legal-approval-card" aria-label={t.decisionSection.title}>
                <div className="lv-legal-approval-card__header">
                  <h2 className="lv-legal-approval-card__title">
                    <Scale size={18} className="lv-legal-approval-card__title-icon" aria-hidden="true" />
                    <span>{t.decisionSection.title}</span>
                  </h2>
                </div>

                <form onSubmit={handleOpenConfirmModal} noValidate>
                  {/* Radio Cards: APPROVE or REJECT (KHÔNG chọn sẵn!) */}
                  <div className="lv-legal-approval-prompt">
                    <span>{t.decisionSection.prompt}</span>
                    <span className="lv-legal-approval-required">*</span>
                  </div>

                  <div className="lv-legal-approval-decision-grid" role="radiogroup" aria-label={t.decisionSection.prompt}>
                    {/* APPROVE Option */}
                    <label
                      className={`lv-legal-approval-decision-card lv-legal-approval-decision-card--approve ${
                        decision === LEGAL_APPROVAL_DECISIONS.APPROVE ? 'lv-legal-approval-decision-card--selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="legalApprovalDecision"
                        value={LEGAL_APPROVAL_DECISIONS.APPROVE}
                        checked={decision === LEGAL_APPROVAL_DECISIONS.APPROVE}
                        onChange={() => handleSelectDecision(LEGAL_APPROVAL_DECISIONS.APPROVE)}
                        aria-describedby="desc-approve-opt"
                      />
                      <div className="lv-legal-approval-decision-card__header">
                        <div className="lv-legal-approval-decision-card__indicator" aria-hidden="true">
                          <div className="lv-legal-approval-decision-card__indicator-inner" />
                        </div>
                        <h3 className="lv-legal-approval-decision-card__title">
                          {t.decisionSection.approveOption}
                        </h3>
                      </div>
                      <p id="desc-approve-opt" className="lv-legal-approval-decision-card__desc">
                        {t.decisionSection.approveDesc}
                      </p>
                    </label>

                    {/* REJECT Option */}
                    <label
                      className={`lv-legal-approval-decision-card lv-legal-approval-decision-card--reject ${
                        decision === LEGAL_APPROVAL_DECISIONS.REJECT ? 'lv-legal-approval-decision-card--selected' : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name="legalApprovalDecision"
                        value={LEGAL_APPROVAL_DECISIONS.REJECT}
                        checked={decision === LEGAL_APPROVAL_DECISIONS.REJECT}
                        onChange={() => handleSelectDecision(LEGAL_APPROVAL_DECISIONS.REJECT)}
                        aria-describedby="desc-reject-opt"
                      />
                      <div className="lv-legal-approval-decision-card__header">
                        <div className="lv-legal-approval-decision-card__indicator" aria-hidden="true">
                          <div className="lv-legal-approval-decision-card__indicator-inner" />
                        </div>
                        <h3 className="lv-legal-approval-decision-card__title">
                          {t.decisionSection.rejectOption}
                        </h3>
                      </div>
                      <p id="desc-reject-opt" className="lv-legal-approval-decision-card__desc">
                        {t.decisionSection.rejectDesc}
                      </p>
                    </label>
                  </div>

                  {fieldErrors.decision && (
                    <div className="lv-legal-approval-field-error" role="alert" style={{ marginBottom: '16px' }}>
                      <AlertCircle size={14} aria-hidden="true" />
                      <span>{fieldErrors.decision}</span>
                    </div>
                  )}

                  {/* Lý do quyết định bắt buộc */}
                  <div className="lv-legal-approval-form-group">
                    <label htmlFor="legal-approval-reason" className="lv-legal-approval-label">
                      <span>{t.decisionSection.reasonLabel}</span>
                      <span className="lv-legal-approval-required">*</span>
                    </label>

                    <textarea
                      id="legal-approval-reason"
                      className={`lv-legal-approval-textarea ${fieldErrors.reason ? 'lv-legal-approval-textarea--error' : ''}`}
                      value={reason}
                      onChange={handleChangeReason}
                      onInput={handleChangeReason}
                      placeholder={t.decisionSection.reasonPlaceholder}
                      rows={4}
                      aria-required="true"
                      aria-invalid={Boolean(fieldErrors.reason)}
                      aria-describedby={fieldErrors.reason ? 'approval-reason-err' : 'approval-reason-hint'}
                    />

                    {fieldErrors.reason ? (
                      <div id="approval-reason-err" className="lv-legal-approval-field-error" role="alert">
                        <AlertCircle size={14} aria-hidden="true" />
                        <span>{fieldErrors.reason}</span>
                      </div>
                    ) : (
                      <span id="approval-reason-hint" className="lv-legal-approval-hint">
                        {t.decisionSection.reasonHint}
                      </span>
                    )}
                  </div>

                  {/* Disabled Notes if conditions violated */}
                  {freshness?.status === 'DISPUTED' && (
                    <p style={{ color: '#a83232', fontSize: '13px', fontWeight: 600 }}>
                      ⚠️ {t.decisionSection.disabledDisputeNote}
                    </p>
                  )}
                  {freshness?.status === 'MISSING_SCOPE' && (
                    <p style={{ color: '#8c6820', fontSize: '13px', fontWeight: 600 }}>
                      ⚠️ {t.decisionSection.disabledMissingScopeNote}
                    </p>
                  )}

                  {/* Nút Xem lại quyết định */}
                  <div className="lv-legal-approval-form-actions">
                    <Button
                      type="submit"
                      variant="primary"
                      size="lg"
                      disabled={isSubmitting || !freshness?.canApprove}
                    >
                      <Eye size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                      <span>{t.decisionSection.btnReview}</span>
                    </Button>
                  </div>
                </form>
              </section>
            </>
          )}

          {/* Confirmation Dialog / Modal */}
          {showConfirmModal && (
            <div
              className="lv-legal-approval-modal-backdrop"
              role="dialog"
              aria-modal="true"
              aria-labelledby="confirm-modal-title"
              onClick={(e) => {
                if (e.target === e.currentTarget && !isSubmitting) {
                  handleCloseConfirmModal();
                }
              }}
            >
              <div className="lv-legal-approval-modal" ref={confirmModalRef} tabIndex="-1">
                <div className="lv-legal-approval-modal__header">
                  <h2 id="confirm-modal-title" className="lv-legal-approval-modal__title">
                    {t.confirmModal.title}
                  </h2>
                  <p className="lv-legal-approval-modal__desc">{t.confirmModal.subtitle}</p>
                </div>

                <div className="lv-legal-approval-modal__body">
                  <div className="lv-legal-approval-modal__row">
                    <span className="lv-legal-approval-modal__label">{t.confirmModal.dossierLabel}</span>
                    <span className="lv-legal-approval-modal__val">{dossier?.dossierId || dossier?.id}</span>
                  </div>

                  <div className="lv-legal-approval-modal__row">
                    <span className="lv-legal-approval-modal__label">{t.confirmModal.versionLabel}</span>
                    <span className="lv-legal-approval-modal__val">Version {dossier?.documentVersion}</span>
                  </div>

                  <div className="lv-legal-approval-modal__row">
                    <span className="lv-legal-approval-modal__label">{t.confirmModal.decisionLabel}</span>
                    <span className="lv-legal-approval-modal__val">
                      <span className={`lv-legal-approval-badge ${decision === 'APPROVE' ? 'lv-legal-approval-badge--fresh' : 'lv-legal-approval-badge--disputed'}`}>
                        {decision === 'APPROVE' ? t.decisionSection.approveOption : t.decisionSection.rejectOption}
                      </span>
                    </span>
                  </div>

                  <div>
                    <span className="lv-legal-approval-modal__label" style={{ display: 'block', marginBottom: '6px' }}>
                      {t.confirmModal.reasonLabel}
                    </span>
                    <div className="lv-legal-approval-modal__reason-box">{reason}</div>
                  </div>

                  <div className="lv-legal-approval-callout lv-legal-approval-callout--warning" style={{ margin: 0, padding: '10px 14px' }}>
                    <Info size={16} aria-hidden="true" style={{ flexShrink: 0, color: '#8c6820' }} />
                    <span style={{ fontSize: '12px', color: '#594511' }}>{t.confirmModal.warningAudit}</span>
                  </div>
                </div>

                <div className="lv-legal-approval-modal__footer">
                  <Button variant="ghost" onClick={handleCloseConfirmModal} disabled={isSubmitting}>
                    {t.confirmModal.btnCancel}
                  </Button>
                  <Button variant="primary" onClick={handleConfirmSubmit} isLoading={isSubmitting}>
                    <ShieldCheck size={16} aria-hidden="true" style={{ marginRight: '6px' }} />
                    <span>{isSubmitting ? t.decisionSection.btnSubmitting : t.confirmModal.btnConfirm}</span>
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="lv-legal-approval-footer" role="contentinfo">
        <div className="lv-legal-approval-footer__inner">
          <p style={{ margin: 0 }}>
            © {new Date().getFullYear()} LegacyVault. {lang === 'en' ? 'Dossier approval.' : 'Phê duyệt hồ sơ.'}
          </p>
          <p style={{ margin: 0, fontWeight: 500, color: '#164639' }}>
            {lang === 'en' ? 'Confidential — For Authorized Legal Verifiers Only.' : 'Bảo mật — Chỉ dành cho Cán bộ Pháp lý được phân quyền.'}
          </p>
        </div>
      </footer>
    </div>
  );
}
