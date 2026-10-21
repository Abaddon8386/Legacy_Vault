import { useState, useId, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Send,
  Scale,
  Plus,
  Trash2,
  FileText,
  Layers,
  Info,
  ArrowLeft,
  ShieldAlert,
} from 'lucide-react';
import EvidenceFileUploader from '../../components/common/EvidenceFileUploader.jsx';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
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
  session = null,
  preview = false,
  isDevPreview = false,
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  caseItem: propCaseItem = null,
  initialDossier = null,
  onCaseChange,
  onNavigateCases,
  onUnauthorized,
}) {
  const t = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;
  const en = lang === 'en';

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  // Active Tab: 'overview' | 'intake' | 'history'
  const [activeTab, setActiveTab] = useState('overview');

  const issuerId = useId();
  const docNumId = useId();
  const dateId = useId();
  const typeId = useId();
  const evidenceRefId = useId();
  const notesId = useId();

  // Case Selection
  const initialCase = propCaseId || '';
  const [selectedCaseId, setSelectedCaseId] = useState(initialCase);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // Unsaved changes protection
  const [pendingCaseSwitchItem, setPendingCaseSwitchItem] = useState(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Dossier State
  const [dossier, setDossier] = useState(initialDossier);
  const [isDossierLoading, setIsDossierLoading] = useState(false);
  const [dossierNotFound, setDossierNotFound] = useState(false);
  const [dossierError, setDossierError] = useState(null);

  // Form State (CHỈ COURT theo quyết định chốt)
  const [legalBasisType, setLegalBasisType] = useState('COURT_JUDGMENT');
  const [issuer, setIssuer] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);

  // Allocations State (Finding B)
  const [allocations, setAllocations] = useState([]);

  // Action / Feedback State
  const [uploadProgress, setUploadProgress] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isForwarding, setIsForwarding] = useState(false);
  const [errors, setErrors] = useState({});
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  // Context binding refs for late response guarding (Finding C & Lỗi B)
  const currentCaseIdRef = useRef(selectedCaseId);
  const currentTokenRef = useRef(effectiveAccessToken);
  const activeDossierControllerRef = useRef(null);
  const mutationControllerRef = useRef(null);
  const activeMutationIdRef = useRef(0);

  const handleResetForm = useCallback(() => {
    setIssuer('');
    setDocumentNumber('');
    setIssuanceDate('');
    setEvidenceReference('');
    setNotes('');
    setEvidenceFile(null);
    setAllocations([]);
    setUploadProgress(null);
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
  }, []);

  // Sync propCaseId when changed from parent / URL
  const [prevPropCaseId, setPrevPropCaseId] = useState(propCaseId);
  if (propCaseId !== prevPropCaseId) {
    setPrevPropCaseId(propCaseId);
    if (propCaseId !== selectedCaseId) {
      setSelectedCaseId(propCaseId || '');
      setDossier(null);
      setIsSubmitting(false);
      setIsForwarding(false);
      setUploadProgress(null);
      setActionError(null);
      setActionSuccess(null);
      setIssuer('');
      setDocumentNumber('');
      setIssuanceDate('');
      setEvidenceReference('');
      setNotes('');
      setEvidenceFile(null);
      setAllocations([]);
      setErrors({});
      setActiveTab('overview');
    }
  }

  // Abort pending mutations when case changes externally
  useEffect(() => {
    mutationControllerRef.current?.abort();
    mutationControllerRef.current = null;
    activeDossierControllerRef.current?.abort();
    activeMutationIdRef.current = 0;
  }, [propCaseId]);

  useEffect(() => {
    currentCaseIdRef.current = selectedCaseId;
    currentTokenRef.current = effectiveAccessToken;
  });

  // Cleanup abort controllers khi unmount
  useEffect(() => {
    return () => {
      mutationControllerRef.current?.abort();
      activeDossierControllerRef.current?.abort();
    };
  }, []);

  // Check if form has unsaved draft changes
  const hasUnsavedDraft = Boolean(
    issuer.trim() ||
    documentNumber.trim() ||
    issuanceDate.trim() ||
    evidenceFile ||
    allocations.length > 0 ||
    notes.trim()
  );

  // Tự động load dossier khi selectedCaseId thay đổi
  useEffect(() => {
    if (activeDossierControllerRef.current) {
      activeDossierControllerRef.current.abort();
    }
    const controller = new AbortController();
    activeDossierControllerRef.current = controller;

    let active = true;

    async function load() {
      if (!selectedCaseId) {
        if (active) {
          setDossier(null);
          setDossierNotFound(false);
          setDossierError(null);
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
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
          signal: controller.signal,
        });

        if (active && currentCaseIdRef.current === selectedCaseId) {
          if (result.notFound || !result.dossier) {
            setDossier(null);
            setDossierNotFound(true);
          } else {
            setDossier(result.dossier);
            setDossierNotFound(false);
            if (result.dossier.route === 'COURT') {
              setLegalBasisType('COURT_JUDGMENT');
            }
          }
        }
      } catch (err) {
        if (active && err.name !== 'AbortError' && currentCaseIdRef.current === selectedCaseId) {
          setDossier(null);
          setDossierError(err.message || (en ? 'Failed to load legal basis dossier.' : 'Không thể tải hồ sơ căn cứ pháp lý.'));
        }
      } finally {
        if (active && currentCaseIdRef.current === selectedCaseId) {
          setIsDossierLoading(false);
        }
      }
    }

    load();

    return () => {
      active = false;
      controller.abort();
    };
  }, [selectedCaseId, effectiveAccessToken, effectiveIsDevPreview, lang, en]);

  // Handle case change request (from Context Bar / Modal)
  const handleRequestCaseChange = (caseItem) => {
    const nextId = typeof caseItem === 'object' && caseItem !== null
      ? (caseItem.caseId || caseItem.id || '')
      : (caseItem || '');

    if (nextId === selectedCaseId) {
      return;
    }

    // Nếu đang có bản nháp chưa lưu, hỏi xác nhận hủy
    if (hasUnsavedDraft) {
      setPendingCaseSwitchItem(caseItem);
      setShowUnsavedModal(true);
      return;
    }

    executeCaseSwitch(caseItem);
  };

  const executeCaseSwitch = (caseItem) => {
    const nextId = typeof caseItem === 'object' && caseItem !== null
      ? (caseItem.caseId || caseItem.id || '')
      : (caseItem || '');

    // Hủy các mutation và load đang chạy của case cũ và giải phóng cờ
    mutationControllerRef.current?.abort();
    mutationControllerRef.current = null;
    activeDossierControllerRef.current?.abort();
    activeMutationIdRef.current = 0;

    setIsSubmitting(false);
    setIsForwarding(false);
    setUploadProgress(null);
    setActionError(null);
    setActionSuccess(null);

    setSelectedCaseId(nextId);
    setDossier(null);
    handleResetForm();
    setActiveTab('overview');

    if (onCaseChange) {
      onCaseChange(caseItem);
    }
  };

  const handleConfirmDiscardDraft = () => {
    setShowUnsavedModal(false);
    if (pendingCaseSwitchItem) {
      executeCaseSwitch(pendingCaseSwitchItem);
      setPendingCaseSwitchItem(null);
    }
  };

  const handleCancelDiscardDraft = () => {
    setShowUnsavedModal(false);
    setPendingCaseSwitchItem(null);
  };

  // Allocations management (Finding B)
  const handleAddAllocation = () => {
    setAllocations((prev) => [
      ...prev,
      {
        id: 'alloc-' + Date.now() + '-' + Math.random().toString(16).slice(2, 6),
        assetId: '',
        beneficiaryId: '',
        description: '',
      },
    ]);
  };

  const handleUpdateAllocation = (index, field, value) => {
    setAllocations((prev) => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: value };
      return next;
    });
  };

  const handleRemoveAllocation = (index) => {
    setAllocations((prev) => prev.filter((_, idx) => idx !== index));
  };

  const latestVersion = dossier?.versions?.[0] || null;
  const isRouteOnHold = dossier?.route === 'ON_HOLD' || dossier?.status === 'ON_HOLD';
  const isRouteNotarial = dossier?.route === 'NOTARIAL';
  const isRouteCourt = dossier?.route === 'COURT';
  const isLatestForwarded = latestVersion?.forwardStatus === 'FORWARDED';
  const isLiveWithoutMetadataSource = Boolean(effectiveAccessToken);

  // Submit phiên bản mới (Finding B & C & Lỗi A/B/C)
  const handleSubmitVersion = async (e) => {
    e.preventDefault();
    if (isSubmitting || isForwarding || isRouteNotarial) return;

    setActionSuccess(null);
    setActionError(null);

    // Phiên thật không có nguồn metadata danh mục tài sản/người nhận: chặn submit
    if (isLiveWithoutMetadataSource && allocations.length === 0) {
      setErrors({ allocations: t.metadataBlockerLiveNotice });
      return;
    }

    const validation = validateStaffLegalDocumentForm({
      issuer,
      documentNumber,
      issuanceDate,
      legalBasisType,
      file: evidenceFile,
    }, { lang, requireFile: true });

    const newErrors = { ...validation.errors };

    // Finding B: Bắt buộc phải có ít nhất 1 dòng phân bổ hợp lệ
    if (allocations.length === 0) {
      newErrors.allocations = isLiveWithoutMetadataSource ? t.metadataBlockerLiveNotice : t.allocationBlockerWarning;
    } else {
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
      const seenPairs = new Set();
      let hasInvalidItem = false;

      for (const item of allocations) {
        const aId = item.assetId?.trim();
        const bId = item.beneficiaryId?.trim();
        if (!aId || !bId || !uuidRegex.test(aId) || !uuidRegex.test(bId)) {
          hasInvalidItem = true;
          break;
        }
        const pair = `${aId}|${bId}`;
        if (seenPairs.has(pair)) {
          hasInvalidItem = true;
          break;
        }
        seenPairs.add(pair);
      }

      if (hasInvalidItem) {
        newErrors.allocations = t.allocationInvalidWarning;
      }
    }

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const formattedAllocations = allocations.map((a) => ({
      assetId: a.assetId.trim(),
      beneficiaryId: a.beneficiaryId.trim(),
      description: a.description?.trim() || '',
    }));

    const metadata = {
      legalBasisType,
      issuingAuthority: issuer.trim(),
      documentNumber: documentNumber.trim(),
      issueDate: issuanceDate,
      evidenceReference: evidenceReference?.trim() || null,
      notes: notes?.trim() || null,
      allocations: formattedAllocations,
    };

    const requestCaseId = selectedCaseId;
    const requestToken = effectiveAccessToken;

    if (mutationControllerRef.current) {
      mutationControllerRef.current.abort();
    }
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    const mutationId = ++activeMutationIdRef.current;

    setIsSubmitting(true);
    try {
      const updatedDossier = await uploadBasisVersion(requestCaseId, {
        metadata,
        file: evidenceFile,
      }, {
        accessToken: requestToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
        signal: controller.signal,
        onProgress: (progress) => {
          if (activeMutationIdRef.current === mutationId && currentCaseIdRef.current === requestCaseId) {
            setUploadProgress(progress);
          }
        },
      });

      // Guard context sau await
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }

      setDossier(updatedDossier);
      setActionSuccess(t.uploadSuccessNotice);
      handleResetForm();
      setActiveTab('overview');
    } catch (err) {
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }
      setActionError(err.message || (en ? 'Document upload failed.' : 'Tải lên văn bản thất bại.'));
    } finally {
      if (activeMutationIdRef.current === mutationId && currentCaseIdRef.current === requestCaseId) {
        setIsSubmitting(false);
      }
    }
  };

  // Forward phiên bản mới nhất cho Ban Pháp lý (Finding C & Lỗi B/C)
  const handleForwardToLegal = async () => {
    if (isForwarding || isSubmitting || isRouteNotarial) return;

    const latestVer = dossier?.versions?.[0];
    if (!latestVer || latestVer.forwardStatus === 'FORWARDED') return;

    const requestCaseId = selectedCaseId;
    const requestToken = effectiveAccessToken;

    if (mutationControllerRef.current) {
      mutationControllerRef.current.abort();
    }
    const controller = new AbortController();
    mutationControllerRef.current = controller;
    const mutationId = ++activeMutationIdRef.current;

    setIsForwarding(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const updatedDossier = await forwardBasisVersion(requestCaseId, latestVer.version, {
        accessToken: requestToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
        signal: controller.signal,
      });

      // Guard context sau await
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }

      setDossier(updatedDossier);
      setActionSuccess(t.forwardSuccessNotice);
    } catch (err) {
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }
      if (err.code === 'BASIS_VERSION_STALE') {
        setActionError(t.versionStaleError);
      } else {
        setActionError(err.message || (en ? 'Failed to forward to Legal.' : 'Không thể chuyển Ban Pháp lý.'));
      }
    } finally {
      if (activeMutationIdRef.current === mutationId && currentCaseIdRef.current === requestCaseId) {
        setIsForwarding(false);
      }
    }
  };

  // Keyboard navigation for tabs (chuyển cả activeTab và focus nút)
  const handleTabKeyDown = (e) => {
    const tabs = ['overview', 'intake', 'history'];
    const tabIds = ['tab-btn-overview', 'tab-btn-intake', 'tab-btn-history'];
    const currentIndex = tabs.indexOf(activeTab);
    let nextIndex = -1;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (e.key === 'Home') {
      e.preventDefault();
      nextIndex = 0;
    } else if (e.key === 'End') {
      e.preventDefault();
      nextIndex = tabs.length - 1;
    }
    if (nextIndex !== -1) {
      setActiveTab(tabs[nextIndex]);
      const btn = document.getElementById(tabIds[nextIndex]);
      btn?.focus();
    }
  };


  return (
    <div className="lv-staff-documents-view">
      {/* Dev Preview Notice */}
      {effectiveIsDevPreview && !effectiveAccessToken && (
        <aside className="lv-staff-preview-banner" role="status">
          <Info size={16} aria-hidden="true" />
          <div>
            <strong>{t.previewBannerLabel}</strong>
            <p>{t.previewBannerDesc}</p>
          </div>
        </aside>
      )}

      {/* Header Area */}
      <div className="lv-staff-title-area">
        <div>
          {onNavigateCases && (
            <button
              type="button"
              className="lv-staff-back-link-btn"
              onClick={onNavigateCases}
            >
              <ArrowLeft size={16} aria-hidden="true" />
              <span>{en ? 'Back to Cases Queue' : 'Quay lại hàng đợi hồ sơ'}</span>
            </button>
          )}
          <h1 className="lv-staff-title">{t.pageTitle}</h1>
          <p className="lv-staff-subtitle">{t.formSubtitle}</p>
        </div>
      </div>

      {/* Unified Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={selectedCaseId}
        caseItem={propCaseItem}
        sessionId={propSessionId}
        onOpenSelector={() => setIsSelectorOpen(true)}
        onChangeCase={() => setIsSelectorOpen(true)}
        lang={lang}
      />

      {/* Feedback Messages */}
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

      {/* Tabs Navigation Bar */}
      {selectedCaseId && (
        <nav
          className="lv-staff-tabs-nav"
          role="tablist"
          aria-label={en ? 'Dossier navigation tabs' : 'Các tab quản lý hồ sơ'}
          onKeyDown={handleTabKeyDown}
        >
          <button
            type="button"
            role="tab"
            id="tab-btn-overview"
            aria-selected={activeTab === 'overview'}
            aria-controls="panel-overview"
            tabIndex={activeTab === 'overview' ? 0 : -1}
            className={`lv-staff-tab-btn ${activeTab === 'overview' ? 'lv-staff-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('overview')}
          >
            <FileText size={16} aria-hidden="true" />
            <span>{t.tabOverview}</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-btn-intake"
            aria-selected={activeTab === 'intake'}
            aria-controls="panel-intake"
            tabIndex={activeTab === 'intake' ? 0 : -1}
            className={`lv-staff-tab-btn ${activeTab === 'intake' ? 'lv-staff-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('intake')}
          >
            <Plus size={16} aria-hidden="true" />
            <span>{t.tabIntake}</span>
          </button>

          <button
            type="button"
            role="tab"
            id="tab-btn-history"
            aria-selected={activeTab === 'history'}
            aria-controls="panel-history"
            tabIndex={activeTab === 'history' ? 0 : -1}
            className={`lv-staff-tab-btn ${activeTab === 'history' ? 'lv-staff-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <Layers size={16} aria-hidden="true" />
            <span>{t.tabHistory}</span>
            {dossier?.versions?.length > 0 && (
              <span className="lv-staff-tab-count">{dossier.versions.length}</span>
            )}
          </button>
        </nav>
      )}

      {/* =========================================================================
          TAB 1: TỔNG QUAN (OVERVIEW)
          ========================================================================= */}
      {selectedCaseId && activeTab === 'overview' && (
        <div id="panel-overview" role="tabpanel" aria-labelledby="tab-btn-overview">
          <section className="lv-dossier-card" aria-labelledby="dossier-overview-heading">
            <div className="lv-dossier-card__header">
              <h2 id="dossier-overview-heading">{t.dossierSectionTitle}</h2>
              {dossier && dossier.status && (
                <span className={`lv-dossier-status-pill lv-dossier-status-pill--${dossier.status.toLowerCase()}`}>
                  {dossier.status === 'LEGAL_BASIS_FORWARDED' ? t.statusForwarded :
                    dossier.status === 'LEGAL_BASIS_PROVIDED' ? t.statusProvided :
                    dossier.status === 'DRAFT' ? t.statusDraft : t.statusOnHold}
                </span>
              )}
            </div>

            {isDossierLoading && (
              <div className="lv-staff-loading-state" role="status">
                <RefreshCw size={24} className="lv-spin" aria-hidden="true" />
                <p>{en ? 'Loading legal dossier...' : 'Đang tải hồ sơ căn cứ pháp lý...'}</p>
              </div>
            )}

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

            {/* Cảnh báo luồng cũ NOTARIAL chỉ đọc */}
            {isRouteNotarial && (
              <div className="lv-legacy-notarial-banner" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <p>{t.legacyNotarialNotice}</p>
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
                      {t.versionText} {latestVersion.version}
                    </span>
                  ) : (
                    <span className="lv-dossier-value-unloaded">{t.dossierVersionUnloaded}</span>
                  )}
                </div>

                <div className="lv-dossier-row">
                  <span className="lv-dossier-label">{t.forwardStatusLabel}</span>
                  <span className={`lv-forward-badge ${isLatestForwarded ? 'lv-forward-badge--forwarded' : 'lv-forward-badge--not-forwarded'}`}>
                    {isLatestForwarded ? t.forwardStatusForwarded : t.forwardStatusNotForwarded}
                  </span>
                </div>

                {latestVersion?.documentNumber && (
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{t.documentNumberLabel}</span>
                    <span className="lv-dossier-value-text">{latestVersion.documentNumber}</span>
                  </div>
                )}

                {latestVersion?.issuingAuthority && (
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{t.issuerLabel}</span>
                    <span className="lv-dossier-value-text">{latestVersion.issuingAuthority}</span>
                  </div>
                )}

                {latestVersion?.notes && (
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{t.notesLabel || (en ? 'Notes:' : 'Ghi chú:')}</span>
                    <span className="lv-dossier-value-text">{latestVersion.notes}</span>
                  </div>
                )}
              </div>
            )}

            {/* Chi tiết kỹ thuật thu gọn (Tránh lộ raw SHA-256 trên giao diện chính) */}
            {latestVersion?.sha256 && (
              <details className="lv-technical-details">
                <summary className="lv-technical-details__summary">
                  <span>{t.technicalDetailsTitle}</span>
                </summary>
                <div className="lv-technical-details__content">
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{t.dossierHashLabel}</span>
                    <code className="lv-hash-code">{latestVersion.sha256}</code>
                  </div>
                  {latestVersion.sizeBytes && (
                    <div className="lv-dossier-row">
                      <span className="lv-dossier-label">{en ? 'File size:' : 'Kích thước tệp:'}</span>
                      <span>{(latestVersion.sizeBytes / 1024).toFixed(1)} KB</span>
                    </div>
                  )}
                </div>
              </details>
            )}

            {/* Action Bar trong Tab Tổng quan */}
            <div className="lv-dossier-overview-actions">
              {latestVersion && !isLatestForwarded && !isRouteOnHold && !isRouteNotarial && (
                <button
                  type="button"
                  className="lv-btn-forward-legal"
                  onClick={handleForwardToLegal}
                  disabled={isForwarding || isSubmitting}
                >
                  {isForwarding ? (
                    <>
                      <RefreshCw size={16} className="lv-spin" aria-hidden="true" />
                      <span>{t.forwardingToLegal}</span>
                    </>
                  ) : (
                    <>
                      <Send size={16} aria-hidden="true" />
                      <span>{t.btnForwardToLegal}</span>
                    </>
                  )}
                </button>
              )}

              <button
                type="button"
                className="lv-btn-go-intake"
                onClick={() => setActiveTab('intake')}
                disabled={isRouteOnHold}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{t.btnGoToIntake}</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {/* =========================================================================
          TAB 2: TIẾP NHẬN VĂN BẢN (INTAKE)
          ========================================================================= */}
      {selectedCaseId && activeTab === 'intake' && (
        <div id="panel-intake" role="tabpanel" aria-labelledby="tab-btn-intake">
          <section className="lv-staff-form-card" aria-labelledby="form-heading">
            <div className="lv-staff-form-card__header">
              <h2 id="form-heading">{t.formTitle}</h2>
              <p>{t.formDesc}</p>
            </div>

            {isRouteNotarial && (
              <div className="lv-dossier-readonly-banner" role="alert" style={{ marginBottom: 20 }}>
                <ShieldAlert size={20} className="lv-dossier-readonly-icon" aria-hidden="true" />
                <div>
                  <strong>{t.notarialReadOnlyBannerTitle}</strong>
                  <p>{t.notarialReadOnlyBannerDesc}</p>
                </div>
              </div>
            )}

            {isRouteOnHold && (
              <div className="lv-dossier-hold-banner" role="alert" style={{ marginBottom: 20 }}>
                <Clock size={20} className="lv-dossier-hold-icon" aria-hidden="true" />
                <div>
                  <strong>{t.dossierOnHoldTitle}</strong>
                  <p>{t.dossierOnHoldDesc}</p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitVersion} noValidate className="lv-intake-form">
              {/* Loại văn bản căn cứ (Chỉ cho phép COURT cho luồng mới) */}
              <div className="lv-form-group">
                <label htmlFor={typeId} className="lv-form-label">
                  {t.legalBasisTypeLabel}
                </label>
                <select
                  id={typeId}
                  className="lv-form-select"
                  value={legalBasisType}
                  onChange={(e) => setLegalBasisType(e.target.value)}
                  disabled={isSubmitting || isRouteOnHold || isRouteNotarial}
                >
                  <option value="COURT_JUDGMENT">{t.typeCourtJudgment}</option>
                  <option value="COURT_DECISION">{t.typeCourtDecision}</option>
                </select>
              </div>

              {/* Grid 2 cột: Cơ quan & Số hiệu */}
              <div className="lv-form-row lv-form-row--2cols">
                <div className="lv-form-group">
                  <label htmlFor={issuerId} className="lv-form-label">
                    {t.issuerLabel}
                  </label>
                  <input
                    id={issuerId}
                    type="text"
                    className={`lv-form-input ${errors.issuer ? 'lv-form-input--error' : ''}`}
                    placeholder={t.issuerPlaceholder}
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    disabled={isSubmitting || isRouteOnHold || isRouteNotarial}
                    maxLength={255}
                  />
                  {errors.issuer ? (
                    <span className="lv-field-error" role="alert">{errors.issuer}</span>
                  ) : (
                    <span className="lv-form-hint">{t.issuerHint}</span>
                  )}
                </div>

                <div className="lv-form-group">
                  <label htmlFor={docNumId} className="lv-form-label">
                    {t.documentNumberLabel}
                  </label>
                  <input
                    id={docNumId}
                    type="text"
                    className={`lv-form-input ${errors.documentNumber ? 'lv-form-input--error' : ''}`}
                    placeholder={t.documentNumberPlaceholder}
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    disabled={isSubmitting || isRouteOnHold}
                    maxLength={100}
                  />
                  {errors.documentNumber ? (
                    <span className="lv-field-error" role="alert">{errors.documentNumber}</span>
                  ) : (
                    <span className="lv-form-hint">{t.documentNumberHint}</span>
                  )}
                </div>
              </div>

              {/* Grid 2 cột: Ngày ban hành & Mã tham chiếu hồ sơ giấy */}
              <div className="lv-form-row lv-form-row--2cols">
                <div className="lv-form-group">
                  <label htmlFor={dateId} className="lv-form-label">
                    {t.issuanceDateLabel}
                  </label>
                  <input
                    id={dateId}
                    type="date"
                    className={`lv-form-input ${errors.issuanceDate ? 'lv-form-input--error' : ''}`}
                    value={issuanceDate}
                    onChange={(e) => setIssuanceDate(e.target.value)}
                    disabled={isSubmitting || isRouteOnHold}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  {errors.issuanceDate ? (
                    <span className="lv-field-error" role="alert">{errors.issuanceDate}</span>
                  ) : (
                    <span className="lv-form-hint">{t.issuanceDateHint}</span>
                  )}
                </div>

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
                    disabled={isSubmitting || isRouteOnHold}
                    maxLength={500}
                  />
                  <span className="lv-form-hint">{t.evidenceReferenceHint}</span>
                </div>
              </div>

              {/* Ghi chú */}
              <div className="lv-form-group">
                <label htmlFor={notesId} className="lv-form-label">
                  {t.notesLabel}
                </label>
                <textarea
                  id={notesId}
                  className="lv-form-textarea"
                  placeholder={t.notesPlaceholder}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  disabled={isSubmitting || isRouteOnHold}
                  rows={2}
                  maxLength={1000}
                />
              </div>

              {/* Tệp số hóa */}
              <div className="lv-form-group">
                <label className="lv-form-label">{t.fileUploadLabel}</label>
                <EvidenceFileUploader
                  file={evidenceFile}
                  onChange={setEvidenceFile}
                  disabled={isSubmitting || isRouteOnHold}
                  lang={lang}
                  accept=".pdf,image/jpeg,image/png"
                  maxSizeBytes={10 * 1024 * 1024}
                  hint={t.fileUploadHint}
                />
                {errors.file && <span className="lv-field-error" role="alert">{errors.file}</span>}
              </div>

              {/* =============================================================
                  PHẠM VI PHÂN BỔ TÀI SẢN (ALLOCATIONS - Finding B)
                  ============================================================= */}
              <div className="lv-allocations-section">
                <div className="lv-allocations-header">
                  <div>
                    <h3 className="lv-allocations-title">{t.allocationsSectionTitle}</h3>
                    <p className="lv-allocations-desc">{t.allocationsSectionDesc}</p>
                  </div>
                  <button
                    type="button"
                    className="lv-btn-add-allocation"
                    onClick={handleAddAllocation}
                    disabled={isSubmitting || isRouteOnHold || isRouteNotarial || isLiveWithoutMetadataSource}
                    title={isLiveWithoutMetadataSource ? t.metadataBlockedTooltip : undefined}
                  >
                    <Plus size={14} aria-hidden="true" />
                    <span>{t.btnAddAllocation}</span>
                  </button>
                </div>

                {errors.allocations && (
                  <div className="lv-allocation-warning-box" role="alert">
                    <AlertTriangle size={18} aria-hidden="true" />
                    <span>{errors.allocations}</span>
                  </div>
                )}

                {allocations.length === 0 ? (
                  <div className="lv-allocations-empty">
                    <Scale size={28} aria-hidden="true" />
                    <p><strong>{t.allocationEmptyTitle}</strong></p>
                    <p className="lv-allocations-blocker-text">
                      {isLiveWithoutMetadataSource ? t.metadataBlockerLiveNotice : t.allocationBlockerWarning}
                    </p>
                    {effectiveIsDevPreview && !effectiveAccessToken && (
                      <button
                        type="button"
                        className="lv-btn-mock-alloc-sample"
                        onClick={() => {
                          setAllocations([
                            {
                              id: 'alloc-sample-1',
                              assetId: '11111111-1111-4111-8111-111111111111',
                              beneficiaryId: '22222222-2222-4222-8222-222222222222',
                              description: en ? 'House and land title' : 'Quyền sử dụng nhà và đất theo bản án',
                            },
                          ]);
                        }}
                      >
                        {en ? '+ Load sample allocation (Test mode)' : '+ Thêm mục phân bổ mẫu (Chế độ thử nghiệm)'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="lv-allocations-table-wrap">
                    <table className="lv-allocations-table">
                      <thead>
                        <tr>
                          <th>{t.allocationAssetId}</th>
                          <th>{t.allocationBeneficiaryId}</th>
                          <th>{t.allocationDescription}</th>
                          <th style={{ width: 60, textAlign: 'center' }}></th>
                        </tr>
                      </thead>
                      <tbody>
                        {allocations.map((item, index) => (
                          <tr key={item.id}>
                            <td>
                              <input
                                type="text"
                                className="lv-alloc-input"
                                placeholder="00000000-0000-0000-0000-000000000000"
                                value={item.assetId}
                                onChange={(e) => handleUpdateAllocation(index, 'assetId', e.target.value)}
                                disabled={isSubmitting || isRouteOnHold}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="lv-alloc-input"
                                placeholder="00000000-0000-0000-0000-000000000000"
                                value={item.beneficiaryId}
                                onChange={(e) => handleUpdateAllocation(index, 'beneficiaryId', e.target.value)}
                                disabled={isSubmitting || isRouteOnHold}
                              />
                            </td>
                            <td>
                              <input
                                type="text"
                                className="lv-alloc-input"
                                placeholder={en ? 'Item description' : 'Mô tả phần phân chia'}
                                value={item.description}
                                onChange={(e) => handleUpdateAllocation(index, 'description', e.target.value)}
                                disabled={isSubmitting || isRouteOnHold}
                              />
                            </td>
                            <td style={{ textAlign: 'center' }}>
                              <button
                                type="button"
                                className="lv-btn-remove-alloc"
                                onClick={() => handleRemoveAllocation(index)}
                                disabled={isSubmitting || isRouteOnHold}
                                title={t.btnRemoveAllocation}
                              >
                                <Trash2 size={16} aria-hidden="true" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Thanh tiến trình upload */}
              {uploadProgress && (
                <div className="lv-upload-progress-card" role="status">
                  <div className="lv-upload-progress-info">
                    <span>
                      {uploadProgress.phase === 'uploading'
                        ? (en ? 'Uploading file…' : 'Đang tải tệp lên…')
                        : uploadProgress.phase === 'processing'
                        ? (en ? 'Computing integrity hash…' : 'Đang xác thực toàn vẹn…')
                        : (en ? 'Complete' : 'Hoàn thành')}
                    </span>
                    <span>{uploadProgress.percent}%</span>
                  </div>
                  <progress
                    className="lv-upload-progress-bar"
                    value={uploadProgress.indeterminate ? undefined : uploadProgress.percent}
                    max={100}
                  />
                </div>
              )}

              {/* Form buttons */}
              <div className="lv-intake-form-actions">
                <button
                  type="submit"
                  className="lv-btn-submit-version"
                  disabled={isSubmitting || isRouteOnHold || isRouteNotarial || allocations.length === 0 || isLiveWithoutMetadataSource}
                  title={isLiveWithoutMetadataSource ? t.metadataBlockerLiveNotice : (allocations.length === 0 ? t.allocationBlockerWarning : undefined)}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="lv-spin" aria-hidden="true" />
                      <span>{t.submittingVersion}</span>
                    </>
                  ) : (
                    <span>{t.btnSubmitVersion}</span>
                  )}
                </button>

                <button
                  type="button"
                  className="lv-btn-reset-form"
                  onClick={handleResetForm}
                  disabled={isSubmitting}
                >
                  {t.btnResetForm}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}

      {/* =========================================================================
          TAB 3: LỊCH SỬ CÁC PHIÊN BẢN (HISTORY)
          ========================================================================= */}
      {selectedCaseId && activeTab === 'history' && (
        <div id="panel-history" role="tabpanel" aria-labelledby="tab-btn-history">
          <section className="lv-dossier-card" aria-labelledby="history-heading">
            <div className="lv-dossier-card__header">
              <h2 id="history-heading">{t.tabHistory}</h2>
            </div>

            {(!dossier?.versions || dossier.versions.length === 0) ? (
              <div className="lv-dossier-unconnected-box" role="status">
                <FileText size={32} className="lv-dossier-unconnected-icon" aria-hidden="true" />
                <h3>{t.dossierVersionUnloaded}</h3>
                <p>{en ? 'No versions have been intaked for this case yet.' : 'Chưa có phiên bản nào được tiếp nhận cho hồ sơ này.'}</p>
              </div>
            ) : (
              <div className="lv-history-table-wrap">
                <table className="lv-history-table">
                  <thead>
                    <tr>
                      <th>{t.dossierVersionLabel}</th>
                      <th>{t.documentNumberLabel}</th>
                      <th>{t.issuerLabel}</th>
                      <th>{t.issuanceDateLabel}</th>
                      <th>{t.forwardStatusLabel}</th>
                      <th>{en ? 'Allocations' : 'Phân bổ'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.versions.map((v) => (
                      <tr key={v.version}>
                        <td>
                          <span className="lv-version-pill">
                            {t.versionText} {v.version}
                          </span>
                        </td>
                        <td>{v.documentNumber || '—'}</td>
                        <td>{v.issuingAuthority || '—'}</td>
                        <td>{v.issueDate || '—'}</td>
                        <td>
                          <span className={`lv-forward-badge ${v.forwardStatus === 'FORWARDED' ? 'lv-forward-badge--forwarded' : 'lv-forward-badge--not-forwarded'}`}>
                            {v.forwardStatus === 'FORWARDED' ? t.forwardStatusForwarded : t.forwardStatusNotForwarded}
                          </span>
                        </td>
                        <td>
                          {Array.isArray(v.allocations) && v.allocations.length > 0 ? (
                            <span className="lv-alloc-count-badge">
                              {v.allocations.length} {en ? 'items' : 'mục'}
                            </span>
                          ) : (
                            <span className="lv-alloc-count-empty">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* Staff Case Selector Modal */}
      <StaffCaseSelectorModal
        isOpen={isSelectorOpen}
        onClose={() => setIsSelectorOpen(false)}
        onSelectCase={handleRequestCaseChange}
        accessToken={effectiveAccessToken}
        isDevPreview={effectiveIsDevPreview}
        lang={lang}
        currentCaseId={selectedCaseId}
        onUnauthorized={onUnauthorized}
      />

      {/* Unsaved Changes Confirmation Modal */}
      {showUnsavedModal && (
        <div className="lv-case-modal-overlay" role="presentation">
          <div
            className="lv-case-modal-card lv-unsaved-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="unsaved-title"
          >
            <div className="lv-unsaved-modal__header">
              <AlertTriangle size={24} className="lv-unsaved-modal__icon" aria-hidden="true" />
              <h2 id="unsaved-title">{t.unsavedChangesTitle}</h2>
            </div>
            <p className="lv-unsaved-modal__body">{t.unsavedChangesDesc}</p>
            <div className="lv-unsaved-modal__footer">
              <button
                type="button"
                className="lv-btn-cancel-discard"
                onClick={handleCancelDiscardDraft}
              >
                {t.btnKeepEditing}
              </button>
              <button
                type="button"
                className="lv-btn-confirm-discard"
                onClick={handleConfirmDiscardDraft}
              >
                {t.btnDiscardAndSwitch}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
