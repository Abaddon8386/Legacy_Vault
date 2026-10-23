import { useState, useId, useEffect, useRef } from 'react';
import {
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  Package,
  Clock,
  Send,
  RefreshCw,
  ArrowLeft,
  User,
  CheckSquare,
  X,
  FileCheck,
} from 'lucide-react';
import {
  filterScopedHandoverItems,
  validateApprovedAllocationScope,
  HANDOVER_STATUS,
} from '../../utils/scopedAssetHandoverValidation.js';
import {
  fetchEligibleAssets,
  deliverAssets,
  isCounterHandoverSimulationPermitted,
} from './handoverSessionService.js';
import { scopedAssetHandoverI18n } from './scopedAssetHandoverI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import { fetchStaffCaseBeneficiaries } from './liveHandoverService.js';
import { fetchStaffAssetCatalog } from './staffLegalDocumentsService.js';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import './ScopedAssetHandoverPage.css';
import { readDeliveryReceiptBatch } from '../../utils/deliveryReceiptValidation.js';

export default function ScopedAssetHandoverPage(props) {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const key = JSON.stringify([
    props.session?.user?.id,
    props.accessToken || props.session?.accessToken,
    props.caseId || props.caseReference || query.get('caseId'),
    props.sessionId || query.get('sessionId'),
  ]);
  return <ScopedAssetHandoverPageContext key={key} {...props} />;
}

function ScopedAssetHandoverPageContext({
  lang = 'vi',
  initialScope = null,
  initialCandidates = null,
  accessToken = null,
  session = null,
  preview = false,
  isDevPreview = false,
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  caseItem: propCaseItem = null,
  onCaseChange = null,
  onUnauthorized = null,
  onNavigateCases = null,
}) {
  const t = scopedAssetHandoverI18n[lang] || scopedAssetHandoverI18n.vi;
  const en = lang === 'en';
  const recipientSelectId = useId();

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  // Đọc params từ URL nếu props không truyền
  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialCase = propCaseId || searchParams?.get('caseId') || (effectiveIsDevPreview ? '6f1a4c2d-0000-4000-8000-000000000001' : '');
  const initialSession = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

  const [caseReference, setCaseReference] = useState(initialCase);
  const displayCaseItem = useStaffCaseMetadata(caseReference, propCaseItem, effectiveAccessToken, lang, effectiveIsDevPreview);
  const [sessionId, setSessionId] = useState(initialSession);
  const [scopeData, setScopeData] = useState(initialScope);
  const [candidates, setCandidates] = useState(initialCandidates);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // Bước 1: Người nhận được chọn
  const [selectedRecipientId, setSelectedRecipientId] = useState('');

  // Bước 2: Danh sách tài sản được chọn trong lần bàn giao này
  const [selectedAssetIds, setSelectedAssetIds] = useState(new Set());

  // Bước 3: Modal kiểm tra và xác nhận bàn giao
  const [showReviewModal, setShowReviewModal] = useState(false);
  const [isDelivering, setIsDelivering] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [refreshTrigger, setRefreshTrigger] = useState(0);

  const abortControllerRef = useRef(null);
  const deliveryControllerRef = useRef(null);
  const activeDeliveryMutationIdRef = useRef(0);

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
      deliveryControllerRef.current?.abort();
    };
  }, []);

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
      setScopeData(null);
      setCandidates(null);
      setSelectedRecipientId('');
      setSelectedAssetIds(new Set());
      setShowReviewModal(false);

      try {
        const options = {
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
          signal: controller.signal,
        };
        const [assets, people, catalog] = await Promise.all([
          fetchEligibleAssets(caseReference, sessionId, options),
          effectiveIsDevPreview ? Promise.resolve([]) : fetchStaffCaseBeneficiaries(caseReference, options).catch(() => []),
          effectiveIsDevPreview ? Promise.resolve([]) : fetchStaffAssetCatalog(caseReference, options).catch(() => []),
        ]);
        if (!Array.isArray(assets)) throw new Error(en ? 'Invalid handover data.' : 'Dữ liệu bàn giao không hợp lệ.');

        if (active && !controller.signal.aborted) {
          // Chuẩn hóa candidates format từ BE EligibleHandoverAssetResponse
          const formattedCandidates = assets.map((a) => {
            const isDelivered = a.deliveryStatus === 'DELIVERED' || a.status === 'DELIVERED';
            return {
              assetId: a.assetId,
              assetName: catalog.find(item => item.assetId === a.assetId)?.name || a.assetName || a.name || null,
              description: a.description || '',
              beneficiaryId: a.recipientId || a.beneficiaryId,
              beneficiaryName: people.find(item => item.beneficiaryId === (a.recipientId || a.beneficiaryId))?.fullName || a.recipientName || a.beneficiaryName || null,
              handoverStatus: isDelivered ? HANDOVER_STATUS.DELIVERED : HANDOVER_STATUS.PENDING,
            };
          });

          // Endpoint này chỉ trả các tài sản thuộc phạm vi Legal đã phê duyệt
          const generatedScope = {
            isApproved: true,
            allocations: (Array.isArray(assets) ? assets : []).map((a) => ({
              assetId: a.assetId,
              beneficiaryId: a.recipientId || a.beneficiaryId,
            })),
          };

          setCandidates(formattedCandidates);
          setScopeData(generatedScope);

          const recIds = Array.from(
            new Set(formattedCandidates.map((c) => c.beneficiaryId).filter(Boolean))
          );
          if (recIds.length === 1) {
            setSelectedRecipientId(recIds[0]);
          }
        }
      } catch (err) {
        if (active && err.name !== 'AbortError') {
          setLoadError(err.status === 409
            ? (en ? 'This session no longer allows asset delivery. Return to the session to view its status.' : 'Phiên này không còn cho phép bàn giao tài sản. Quay lại phiên bàn giao để xem trạng thái.')
            : (en ? 'Unable to load assets. Check the selected case and retry.' : 'Chưa tải được tài sản. Vui lòng kiểm tra hồ sơ đã chọn và thử lại.'));
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
  }, [caseReference, sessionId, effectiveAccessToken, effectiveIsDevPreview, lang, en, refreshTrigger]);

  // Gom danh sách người nhận duy nhất từ danh sách tài sản đã duyệt
  const uniqueRecipients = Array.from(
    new Map(
      (eligible || [])
        .filter((c) => c.beneficiaryId)
        .map((c) => [
          c.beneficiaryId,
          {
            id: c.beneficiaryId,
            name: c.beneficiaryName || null,
          },
        ])
    ).values()
  );

  // Khi đổi người nhận: xóa selection tài sản, đóng modal review nếu đang mở
  const handleSelectRecipient = (recipientId) => {
    setSelectedRecipientId(recipientId);
    setSelectedAssetIds(new Set());
    setShowReviewModal(false);
    setActionSuccess(null);
    setActionError(null);
  };

  // Lọc tài sản thuộc về người nhận đang chọn
  const recipientAssets = (eligible || []).filter(
    (c) => c.beneficiaryId === selectedRecipientId
  );

  // Danh sách tài sản chưa giao của người nhận đang chọn
  const undeliveredAssets = recipientAssets.filter(
    (c) => c.handoverStatus !== HANDOVER_STATUS.DELIVERED
  );

  const isAllSelected =
    undeliveredAssets.length > 0 &&
    undeliveredAssets.every((c) => selectedAssetIds.has(c.assetId));

  // Toggle Chọn tất cả tài sản chưa giao
  const handleToggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedAssetIds(new Set());
    } else {
      setSelectedAssetIds(new Set(undeliveredAssets.map((c) => c.assetId)));
    }
  };

  // Toggle từng tài sản
  const handleToggleAsset = (assetId) => {
    setSelectedAssetIds((prev) => {
      const next = new Set(prev);
      if (next.has(assetId)) {
        next.delete(assetId);
      } else {
        next.add(assetId);
      }
      return next;
    });
  };

  // Mở modal kiểm tra bàn giao (ZERO POST)
  const handleOpenReviewModal = () => {
    if (selectedAssetIds.size === 0 || !selectedRecipientId || isDelivering) return;
    setActionError(null);
    setShowReviewModal(true);
  };

  // Đóng modal kiểm tra bàn giao
  const handleCloseReviewModal = () => {
    setShowReviewModal(false);
  };

  // Thực thi mutation ghi nhận bàn giao danh sách tài sản cho 1 người nhận
  const executeDelivery = async (targetRecipientId, assetIdsToDeliver) => {
    if (isDelivering || !targetRecipientId || !assetIdsToDeliver || assetIdsToDeliver.length === 0) return;

    const currentMutationId = ++activeDeliveryMutationIdRef.current;
    if (deliveryControllerRef.current) {
      deliveryControllerRef.current.abort();
    }
    const controller = new AbortController();
    deliveryControllerRef.current = controller;

    setIsDelivering(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const deliveryResult = await deliverAssets(caseReference, sessionId, {
        recipientId: targetRecipientId,
        assetIds: assetIdsToDeliver,
      }, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
        signal: controller.signal,
      });

      if (controller.signal.aborted || activeDeliveryMutationIdRef.current !== currentMutationId) {
        return;
      }

      // Đọc và đối chiếu nghiêm ngặt theo DTO HandoverItemResponse của BE
      // { itemId, sessionId, assetId, recipientId, status: 'DELIVERED', deliveredAt, staffId }
      const confirmedDeliveredAssetIds = readDeliveryReceiptBatch(deliveryResult, {
        sessionId, recipientId: targetRecipientId, assetIds: assetIdsToDeliver,
      }, {
        // Preserve the explicitly labelled anonymous DEV demo; authenticated/production paths stay strict.
        allowSyntheticIds: isCounterHandoverSimulationPermitted({
          accessToken: effectiveAccessToken, isDevPreview: effectiveIsDevPreview,
        }),
      });

      // Nếu không có bất kỳ biên nhận DELIVERED hợp lệ nào được server xác nhận:
      if (!confirmedDeliveredAssetIds) {
        setShowReviewModal(false);
        setActionError(
          en
            ? 'No valid delivery receipts confirmed by server. Please verify session status.'
            : 'Máy chủ không trả về biên nhận bàn giao hợp lệ. Vui lòng đối soát lại trạng thái.'
        );
        // Tải lại dữ liệu chính thống từ server để đồng bộ
        setRefreshTrigger((r) => r + 1);
        return;
      }

      // Cập nhật trạng thái chỉ cho đúng các cặp (targetRecipientId, aid) được server xác nhận
      setCandidates((prev) =>
        (prev || []).map((c) =>
          c.beneficiaryId === targetRecipientId && confirmedDeliveredAssetIds.has(c.assetId)
            ? { ...c, handoverStatus: HANDOVER_STATUS.DELIVERED }
            : c
        )
      );

      setSelectedAssetIds((prev) => {
        const next = new Set(prev);
        confirmedDeliveredAssetIds.forEach((id) => next.delete(id));
        return next;
      });
      setShowReviewModal(false);

      if (confirmedDeliveredAssetIds.size === assetIdsToDeliver.length) {
        setActionSuccess(
          (t.deliverySuccessBatch || 'Đã ghi nhận bàn giao thành công {count} tài sản cho người nhận.').replace(
            '{count}',
            String(confirmedDeliveredAssetIds.size)
          )
        );
      } else {
        setActionError(
          en
            ? `Server only confirmed ${confirmedDeliveredAssetIds.size}/${assetIdsToDeliver.length} items. Syncing latest state...`
            : `Máy chủ chỉ xác nhận ${confirmedDeliveredAssetIds.size}/${assetIdsToDeliver.length} tài sản. Đang đồng bộ trạng thái mới nhất...`
        );
        setRefreshTrigger((r) => r + 1);
      }
    } catch (err) {
      if (controller.signal.aborted || activeDeliveryMutationIdRef.current !== currentMutationId) {
        return;
      }
      setShowReviewModal(false);
      const isConflict = err.status === 409 || err.code === 'CONFLICT' || String(err.message).includes('409');
      if (isConflict) {
        setActionError(
          en
            ? 'Handover session or approval scope has changed (409 Conflict). Reloading authoritative state...'
            : 'Dữ liệu phiên bàn giao hoặc phạm vi đã thay đổi (409 Conflict). Đang tải lại dữ liệu mới nhất...'
        );
        setRefreshTrigger((r) => r + 1);
      } else {
        setActionError(
          err.message || (en ? 'Asset delivery failed.' : 'Ghi nhận bàn giao tài sản thất bại.')
        );
      }
    } finally {
      if (activeDeliveryMutationIdRef.current === currentMutationId) {
        setIsDelivering(false);
        deliveryControllerRef.current = null;
      }
    }
  };

  // Xác nhận ghi nhận bàn giao đợt tài sản đã chọn cho người nhận từ modal review
  const handleConfirmDeliverBatch = () => {
    if (!selectedRecipientId || selectedAssetIds.size === 0) return;
    executeDelivery(selectedRecipientId, Array.from(selectedAssetIds));
  };

  // Mở modal kiểm tra bàn giao cho 1 tài sản trên dòng (ZERO POST)
  const handleOpenReviewForSingleItem = (item) => {
    if (isDelivering) return;
    const targetRecipientId = item.beneficiaryId || selectedRecipientId;
    if (targetRecipientId) {
      setSelectedRecipientId(targetRecipientId);
    }
    setSelectedAssetIds(new Set([item.assetId]));
    setActionError(null);
    setShowReviewModal(true);
  };

  const selectedRecipientObj = uniqueRecipients.find((r) => r.id === selectedRecipientId);
  const selectedRecipientDisplayName = selectedRecipientObj?.name
    ? selectedRecipientObj.name
    : selectedRecipientId
    ? `${en ? 'Recipient' : 'Người nhận'} (${selectedRecipientId.substring(0, 8)}...)`
    : '';

  return (
    <div className="lv-asset-handover-view">
      {/* Context navigation back link */}
      {caseReference && sessionId && (
        <div className="lv-handover-nav-back">
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId)}`}
            className="lv-btn-back-link"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{en ? 'Back to Handover Session' : 'Quay lại Phiên bàn giao tại quầy'}</span>
          </a>
        </div>
      )}

      {/* Page Title & Context Header */}
      <div className="lv-handover-header">
        <h1 className="lv-handover-title">{t.pageTitle}</h1>
      </div>

      {/* Staff Case Context Bar (Nguồn chọn case duy nhất) */}
      <StaffCaseContextBar
        caseId={caseReference}
        caseItem={displayCaseItem}
        sessionId={sessionId}
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
          deliveryControllerRef.current?.abort();
          deliveryControllerRef.current = null;
          setIsDelivering(false);
          setCaseReference(newId);
          setSessionId('');
          setScopeData(null);
          setCandidates(null);
          setSelectedRecipientId('');
          setSelectedAssetIds(new Set());
          setShowReviewModal(false);
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

      {/* =========================================================================
          BƯỚC 1: CHỌN NGƯỜI NHẬN TẠI QUẦY
          ========================================================================= */}
      {!loadError && <><section className="lv-handover-card lv-staff-glow" aria-labelledby="step1-heading">
        <div className="lv-handover-card__header">
          <div className="lv-handover-step-indicator">
            <span className="lv-handover-step-badge">1</span>
            <div>
              <h2 id="step1-heading" className="lv-handover-card__title">
                {t.step1Title}
              </h2>
            </div>
          </div>
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

        {(!isLoading && !scopeValidation.isValid) ? (
          <div className="lv-handover-scope-empty" role="status">
            <Package size={32} className="lv-handover-scope-empty__icon" aria-hidden="true" />
            <h3>{t.scopeMissingTitle}</h3>
            <p>{t.scopeMissingDesc}</p>
            {onNavigateCases && (
              <div style={{ marginTop: '16px' }}>
                <button
                  type="button"
                  onClick={onNavigateCases}
                  className="lv-btn-navigate-cases"
                >
                  <span>{en ? 'Back to Cases Dashboard' : 'Về danh sách ca xác minh'}</span>
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="lv-recipient-selector-wrap">
            <label htmlFor={recipientSelectId} className="lv-handover-label">
              <User size={15} aria-hidden="true" />
              <span>{t.recipientLabel}</span>
            </label>
            <select
              id={recipientSelectId}
              className="lv-handover-recipient-select"
              value={selectedRecipientId}
              onChange={(e) => handleSelectRecipient(e.target.value)}
              disabled={isLoading || isDelivering || uniqueRecipients.length === 0}
            >
              <option value="">{t.selectRecipientPlaceholder}</option>
              {uniqueRecipients.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name || `${en ? 'Recipient' : 'Người nhận'} — ${t.recipientMetadataPending}`}
                </option>
              ))}
            </select>
          </div>
        )}
      </section>

      {/* =========================================================================
          BƯỚC 2: CHỌN TÀI SẢN GIAO TRONG LẦN NÀY
          ========================================================================= */}
      <section className="lv-handover-card lv-staff-glow" aria-labelledby="step2-heading">
        <div className="lv-handover-card__header">
          <div className="lv-handover-step-indicator">
            <span className="lv-handover-step-badge">2</span>
            <div>
              <h2 id="step2-heading" className="lv-handover-card__title">
                {t.step2Title}
              </h2>
            </div>
          </div>
          {isLoading && (
            <span className="lv-loading-indicator">
              <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
              <span>{en ? 'Loading assets...' : 'Đang tải danh sách tài sản...'}</span>
            </span>
          )}
        </div>

        {!selectedRecipientId ? (
          <div className="lv-handover-scope-empty" role="status">
            <User size={32} className="lv-handover-scope-empty__icon" aria-hidden="true" />
            <p>{t.step2Prompt}</p>
          </div>
        ) : recipientAssets.length === 0 ? (
          <div className="lv-handover-scope-empty" role="status">
            <Package size={32} className="lv-handover-scope-empty__icon" aria-hidden="true" />
            <p>{t.emptyAssets}</p>
          </div>
        ) : (
          <div className="lv-handover-table-wrapper">
            <table className="lv-handover-table">
              <thead>
                <tr>
                  <th style={{ width: 44, textAlign: 'center' }}>
                    <input
                      type="checkbox"
                      className="lv-handover-table-checkbox"
                      aria-label={t.selectAll}
                      checked={isAllSelected}
                      onChange={handleToggleSelectAll}
                      disabled={undeliveredAssets.length === 0 || isDelivering}
                    />
                  </th>
                  <th>{t.assetNameCol}</th>
                  <th>{t.scopeStatusCol}</th>
                  <th>{t.handoverStatusCol}</th>
                  <th style={{ textAlign: 'right' }}>{en ? 'Action' : 'Thao tác'}</th>
                </tr>
              </thead>
              <tbody>
                {recipientAssets.map((item) => {
                  const isDelivered = item.handoverStatus === HANDOVER_STATUS.DELIVERED;
                  const isChecked = selectedAssetIds.has(item.assetId);

                  return (
                    <tr
                      key={`${item.assetId}:${item.beneficiaryId}`}
                      className={isChecked ? 'lv-handover-row--selected' : ''}
                    >
                      <td style={{ textAlign: 'center' }}>
                        <input
                          type="checkbox"
                          className="lv-handover-table-checkbox"
                          aria-label={`Chọn tài sản ${item.assetName || item.description || item.assetId}`}
                          checked={isChecked}
                          onChange={() => handleToggleAsset(item.assetId)}
                          disabled={isDelivered || isDelivering}
                        />
                      </td>
                      <td>
                        <div className="lv-asset-item-info">
                          <strong>
                            {item.assetName
                              ? item.assetName
                              : item.description
                              ? item.description
                              : `${en ? 'Asset' : 'Tài sản'} (${item.assetId.substring(0, 8)}...)`}
                          </strong>
                          {item.assetName && item.description && (
                            <span className="lv-asset-item-desc">{item.description}</span>
                          )}
                        </div>
                      </td>
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
                      <td style={{ textAlign: 'right' }}>
                        {isDelivered ? (
                          <button
                            type="button"
                            className="lv-btn-record-handover"
                            disabled={true}
                          >
                            {t.btnDeliveredDisabled}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="lv-btn-record-handover"
                            disabled={isDelivering}
                            onClick={() => handleOpenReviewForSingleItem(item)}
                          >
                            <Send size={13} aria-hidden="true" />
                            <span>{t.btnRecordHandover}</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Thanh đếm & nút chuyển sang Bước 3 */}
        {selectedRecipientId && recipientAssets.length > 0 && (
          <div className="lv-handover-action-bar">
            <span className="lv-selected-count-text">
              {undeliveredAssets.length === 0
                ? t.noUndeliveredAssetsForRecipient
                : (t.selectedCount || 'Đã chọn {count} tài sản').replace(
                    '{count}',
                    String(selectedAssetIds.size)
                  )}
            </span>
            <button
              type="button"
              className="lv-btn-review-handover"
              disabled={selectedAssetIds.size === 0 || isDelivering}
              onClick={handleOpenReviewModal}
            >
              <FileCheck size={16} aria-hidden="true" />
              <span>{t.btnReviewHandover}</span>
            </button>
          </div>
        )}
      </section>

      </>}
      {/* =========================================================================
          BƯỚC 3: DIALOG TÓM TẮT & XÁC NHẬN BÀN GIAO
          ========================================================================= */}
      {showReviewModal && (
        <div
          className="lv-handover-modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-labelledby="review-modal-title"
        >
          <div className="lv-handover-modal-dialog">
            <div className="lv-handover-modal-header">
              <h2 id="review-modal-title" className="lv-handover-modal-title">
                {t.reviewModalTitle}
              </h2>
              <button
                type="button"
                className="lv-btn-modal-close"
                onClick={handleCloseReviewModal}
                disabled={isDelivering}
                aria-label={en ? 'Close dialog' : 'Đóng hộp thoại'}
              >
                <X size={18} aria-hidden="true" />
              </button>
            </div>

            <div className="lv-handover-modal-body">
              {/* Tóm tắt phiên và người nhận */}
              <div className="lv-review-meta-grid">
                <div className="lv-review-meta-item">
                  <span className="lv-review-meta-label">{t.reviewModalCase}</span>
                  <span className="lv-review-meta-value">{caseReference}</span>
                </div>
                <div className="lv-review-meta-item">
                  <span className="lv-review-meta-label">{t.reviewModalSession}</span>
                  <span className="lv-review-meta-value">{sessionId}</span>
                </div>
                <div className="lv-review-meta-item lv-review-meta-item--full">
                  <span className="lv-review-meta-label">{t.reviewModalRecipient}</span>
                  <strong className="lv-review-meta-value">{selectedRecipientDisplayName}</strong>
                </div>
              </div>

              {/* Danh sách tài sản sẽ bàn giao */}
              <div className="lv-review-assets-section">
                <h3 className="lv-review-section-heading">{t.reviewModalAssetsList}</h3>
                <ul className="lv-review-assets-list">
                  {Array.from(selectedAssetIds).map((aid) => {
                    const item = recipientAssets.find((a) => a.assetId === aid);
                    return (
                      <li key={aid} className="lv-review-asset-item">
                        <CheckSquare size={16} className="lv-review-check-icon" aria-hidden="true" />
                        <div>
                          <strong>
                            {item?.assetName || item?.description || `${en ? 'Asset' : 'Tài sản'} (${aid.substring(0, 8)}...)`}
                          </strong>
                          {item?.assetName && item?.description && (
                            <p className="lv-review-item-desc">{item.description}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>

              {/* Cảnh báo quy tắc nghiệp vụ */}
              <div className="lv-review-warning-box" role="alert">
                <ShieldAlert size={18} className="lv-review-warning-icon" aria-hidden="true" />
                <p>{t.reviewModalNotice}</p>
              </div>
            </div>

            <div className="lv-handover-modal-actions">
              <button
                type="button"
                className="lv-btn-cancel-review"
                onClick={handleCloseReviewModal}
                disabled={isDelivering}
              >
                {t.btnCancelReview}
              </button>
              <button
                type="button"
                className="lv-btn-confirm-deliver"
                onClick={handleConfirmDeliverBatch}
                disabled={isDelivering}
              >
                {isDelivering ? (
                  <>
                    <RefreshCw size={15} className="lv-spin" aria-hidden="true" />
                    <span>{t.delivering}</span>
                  </>
                ) : (
                  <>
                    <Send size={15} aria-hidden="true" />
                    <span>{t.btnConfirmDelivery}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
