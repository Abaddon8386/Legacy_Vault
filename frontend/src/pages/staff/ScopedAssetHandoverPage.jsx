import { useState, useId, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Package,
  Clock,
  RotateCcw,
  Send,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import {
  filterScopedHandoverItems,
  validateApprovedAllocationScope,
  HANDOVER_STATUS,
} from '../../utils/scopedAssetHandoverValidation.js';
import {
  fetchEligibleAssets,
  deliverAssets,
} from './handoverSessionService.js';
import { scopedAssetHandoverI18n } from './scopedAssetHandoverI18n.js';
import './ScopedAssetHandoverPage.css';

export default function ScopedAssetHandoverPage({
  lang = 'vi',
  initialScope = null,
  initialCandidates = null,
  accessToken = null,
  session = null,
  preview = false,
  isDevPreview = false,
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  onNavigateCases = null,
}) {
  const t = scopedAssetHandoverI18n[lang] || scopedAssetHandoverI18n.vi;
  const caseInputId = useId();

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  // Đọc params từ URL nếu props không truyền
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialCase = propCaseId || searchParams?.get('caseId') || (effectiveIsDevPreview ? '6f1a4c2d-0000-4000-8000-000000000001' : '');
  const initialSession = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

  const [caseReference, setCaseReference] = useState(initialCase);
  const [sessionId, setSessionId] = useState(initialSession);
  const [scopeData, setScopeData] = useState(initialScope);
  const [candidates, setCandidates] = useState(initialCandidates);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [deliveringAssetId, setDeliveringAssetId] = useState(null);

  const abortControllerRef = useRef(null);

  // Validate scope
  const scopeValidation = validateApprovedAllocationScope(scopeData);
  const { eligible } = filterScopedHandoverItems(candidates, scopeData);

  // Tự động tải danh sách eligible assets từ server
  useEffect(() => {
    if (!caseReference || !sessionId) {
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    let active = true;

    async function load() {
      setIsLoading(true);
      setLoadError(null);
      setActionSuccess(null);
      setActionError(null);

      try {
        const assets = await fetchEligibleAssets(caseReference, sessionId, {
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
          signal: controller.signal,
        });

        if (active) {
          // Normalize thành candidates format từ BE EligibleHandoverAssetResponse
          const formattedCandidates = (Array.isArray(assets) ? assets : []).map((a) => {
            const isDelivered = a.deliveryStatus === 'DELIVERED' || a.status === 'DELIVERED';
            return {
              assetId: a.assetId,
              assetName: a.assetName || a.description || a.name || 'Tài sản',
              beneficiaryId: a.recipientId,
              beneficiaryName: a.recipientName || (a.recipientId ? `Người nhận (${a.recipientId.substring(0, 8)})` : 'Chưa chỉ định'),
              handoverStatus: isDelivered ? HANDOVER_STATUS.DELIVERED : HANDOVER_STATUS.PENDING,
            };
          });

          // Mock scope data tương ứng
          const generatedScope = {
            isApproved: true,
            allocations: (Array.isArray(assets) ? assets : []).map((a) => ({
              assetId: a.assetId,
              beneficiaryId: a.recipientId,
            })),
          };

          setCandidates(formattedCandidates);
          setScopeData(generatedScope);
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') {
          setLoadError(err.message || 'Không thể tải danh sách tài sản đủ điều kiện.');
        }
      } finally {
        if (active) {
          setIsLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [caseReference, sessionId, effectiveAccessToken, effectiveIsDevPreview, lang]);

  const handleCaseChange = (newRef) => {
    setCaseReference(newRef);
    if (newRef !== caseReference) {
      setScopeData(null);
      setCandidates(null);
    }
  };

  const handleReset = () => {
    setCaseReference('');
    setSessionId('');
    setScopeData(null);
    setCandidates(null);
    setActionSuccess(null);
    setActionError(null);
  };

  // Thực hiện bàn giao tài sản thật qua API
  const handleDeliverAsset = async (item) => {
    if (deliveringAssetId || item.handoverStatus === HANDOVER_STATUS.DELIVERED) return;

    setDeliveringAssetId(item.assetId);
    setActionSuccess(null);
    setActionError(null);

    try {
      await deliverAssets(caseReference, sessionId, {
        recipientId: item.beneficiaryId,
        assetIds: [item.assetId],
      }, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
      });

      // Cập nhật trạng thái dòng tài sản thành DELIVERED
      setCandidates((prev) =>
        prev.map((c) => (c.assetId === item.assetId ? { ...c, handoverStatus: HANDOVER_STATUS.DELIVERED } : c))
      );
      setActionSuccess(lang === 'en' ? `Asset "${item.assetName}" successfully delivered.` : `Tài sản "${item.assetName}" đã được ghi nhận bàn giao thành công.`);
    } catch (err) {
      setActionError(err.message || (lang === 'en' ? 'Asset delivery failed.' : 'Ghi nhận bàn giao tài sản thất bại.'));
    } finally {
      setDeliveringAssetId(null);
    }
  };

  return (
    <div className="lv-asset-handover-view">
      {/* Context navigation bar */}
      {caseReference && sessionId && (
        <div className="lv-handover-nav-back">
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId)}`}
            className="lv-btn-back-link"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{lang === 'en' ? 'Back to Handover Session' : 'Quay lại Phiên bàn giao tại quầy'}</span>
          </a>
        </div>
      )}

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

      {/* Action Success / Error Feedback Banners */}
      {actionSuccess && (
        <div className="lv-api-status-banner lv-api-status-banner--success" role="status">
          <CheckCircle2 size={16} aria-hidden="true" />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="lv-api-status-banner lv-api-status-banner--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{actionError}</span>
        </div>
      )}
      {loadError && (
        <div className="lv-api-status-banner lv-api-status-banner--error" role="alert">
          <AlertTriangle size={16} aria-hidden="true" />
          <span>{loadError}</span>
        </div>
      )}

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

        {!isLoading && !scopeValidation.isValid && (
          <div className="lv-handover-scope-empty" role="status">
            <Package size={32} className="lv-handover-scope-empty__icon" aria-hidden="true" />
            <h3>{t.scopeMissingTitle}</h3>
            <p>{t.scopeMissingDesc}</p>
            {onNavigateCases && (
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={onNavigateCases}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '6px',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    backgroundColor: '#164639',
                    color: '#ffffff',
                    border: 'none',
                    fontWeight: 600,
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  <span>{lang === 'en' ? 'Back to Cases Dashboard' : 'Về danh sách ca xác minh'}</span>
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* Eligible Scoped Assets Table Section */}
      <section className="lv-handover-card" aria-labelledby="table-heading">
        <div className="lv-handover-card__header">
          <h2 id="table-heading" className="lv-handover-card__title">
            {t.assetTableTitle}
          </h2>
          {isLoading && (
            <span className="lv-loading-indicator">
              <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
              <span>{lang === 'en' ? 'Loading assets...' : 'Đang tải danh sách tài sản...'}</span>
            </span>
          )}
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
                  const isDelivering = deliveringAssetId === item.assetId;

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
                        ) : (
                          <span className="lv-status-pill lv-status-pill--pending">
                            <Clock size={12} aria-hidden="true" />
                            <span>{t.statusPending}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        <button
                          type="button"
                          className={`lv-btn-handover-action ${isDelivered ? 'lv-btn-handover-action--delivered' : 'lv-btn-handover-action--eligible'}`}
                          disabled={isDelivered || isDelivering || Boolean(deliveringAssetId)}
                          onClick={() => handleDeliverAsset(item)}
                          aria-label={`${t.btnRecordHandover}: ${item.assetName}`}
                        >
                          {isDelivering ? (
                            <>
                              <RefreshCw size={13} className="lv-spin" aria-hidden="true" />
                              <span>{lang === 'en' ? 'Recording...' : 'Đang ghi nhận...'}</span>
                            </>
                          ) : isDelivered ? (
                            <>
                              <CheckCircle2 size={13} aria-hidden="true" />
                              <span>{lang === 'en' ? 'Handed Over' : 'Đã giao'}</span>
                            </>
                          ) : (
                            <>
                              <Send size={13} aria-hidden="true" />
                              <span>{t.btnRecordHandover}</span>
                            </>
                          )}
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
    </div>
  );
}
