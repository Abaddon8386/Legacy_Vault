import { workflowNotificationFeedback } from '../../utils/workflowNotificationFeedback.js';
import CourtAllocationEditor from '../../components/staff/CourtAllocationEditor.jsx';
import { buildCourtAllocations, courtAllocationError } from '../../utils/courtAllocationModel.js';
import { useState, useId, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Send,
  Scale,
  Plus,
  FileText,
  Layers,
  Info,
  ArrowLeft,
} from 'lucide-react';
import EvidenceFileUploader from '../../components/common/EvidenceFileUploader.jsx';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import StaffWorkflowGuide from '../../components/staff/StaffWorkflowGuide.jsx';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import {
  validateStaffLegalDocumentForm,
  getStaffLegalDocumentErrorMessage,
} from '../../utils/staffLegalDocumentsValidation.js';
import {
  fetchBasisDossier,
  receiveAndForwardBasisVersion,
  forwardBasisVersion,
  readBasisVersionContent,
  fetchStaffAssetCatalog,
  fetchStaffCaseBeneficiaries,
} from './staffLegalDocumentsService.js';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';
import { listLiveSessions } from './liveHandoverService.js';
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
  const displayCaseItem = useStaffCaseMetadata(selectedCaseId, propCaseItem, effectiveAccessToken, lang, effectiveIsDevPreview);
  const caseStatus = displayCaseItem?.status;
  const vaultStatus = displayCaseItem?.vaultStatus;
  const isCaseMetadataReady = Boolean(displayCaseItem);

  // Preserve or discover historical handover session for closed/archived cases, scoped strictly to (selectedCaseId, effectiveAccessToken)
  const [discoveredSessionState, setDiscoveredSessionState] = useState({
    caseId: null,
    accessToken: null,
    sessionId: null,
    sessions: [],
    status: 'idle', // 'idle' | 'loading' | 'success' | 'empty' | 'error' | 'ambiguous'
    userSelection: 'UNTOUCHED', // 'UNTOUCHED' | 'SELECTED' | 'CLEARED'
    selectedSessionId: null,
  });

  // Verify scope strictly in render before using discovered session
  const isDiscoveredScopeMatching = Boolean(
    selectedCaseId &&
    effectiveAccessToken &&
    discoveredSessionState.caseId === selectedCaseId &&
    discoveredSessionState.accessToken === effectiveAccessToken
  );

  let activeDiscoveredSessionId = '';
  if (isDiscoveredScopeMatching) {
    if (discoveredSessionState.userSelection === 'CLEARED') {
      // User explicitly cleared selection: NEVER fallback to default session!
      activeDiscoveredSessionId = '';
    } else if (discoveredSessionState.userSelection === 'SELECTED') {
      // User explicitly selected a session: verify it belongs to current sessions
      const isValid = Boolean(
        discoveredSessionState.selectedSessionId &&
        discoveredSessionState.sessions?.some(s => s.sessionId === discoveredSessionState.selectedSessionId)
      );
      activeDiscoveredSessionId = isValid ? (discoveredSessionState.selectedSessionId || '') : '';
    } else {
      // userSelection === 'UNTOUCHED' (Initial state before user interaction)
      if (discoveredSessionState.status === 'ambiguous') {
        activeDiscoveredSessionId = '';
      } else if (discoveredSessionState.status === 'success') {
        activeDiscoveredSessionId = discoveredSessionState.sessionId || '';
      }
    }
  }

  const effectiveSessionId = propSessionId || activeDiscoveredSessionId || '';

  useEffect(() => {
    if (propSessionId || !selectedCaseId || !effectiveAccessToken || effectiveIsDevPreview) return;
    const isClosed = ['CLOSED', 'CANCELLED'].includes(caseStatus) || vaultStatus === 'ARCHIVED';
    if (!isClosed) return;

    const targetCaseId = selectedCaseId;
    const targetAccessToken = effectiveAccessToken;
    const controller = new AbortController();

    listLiveSessions(targetCaseId, { accessToken: targetAccessToken, lang, signal: controller.signal })
      .then(sessions => {
        if (controller.signal.aborted) return;
        if (!Array.isArray(sessions) || sessions.length === 0) {
          setDiscoveredSessionState({
            caseId: targetCaseId,
            accessToken: targetAccessToken,
            sessionId: null,
            sessions: [],
            status: 'empty',
            userSelection: 'UNTOUCHED',
            selectedSessionId: null,
          });
          return;
        }

        const completed = sessions.filter(s => s.status === 'COMPLETED');
        let pickedId = null;
        let status = 'success';

        if (completed.length === 1) {
          pickedId = completed[0].sessionId;
        } else if (completed.length === 0 && sessions.length === 1) {
          pickedId = sessions[0].sessionId;
        } else {
          // Nhiều phiên hợp lệ hoặc nhiều phiên không xác định duy nhất:
          // Không tự chọn phiên theo thời gian, vị trí mảng hay ID
          status = 'ambiguous';
        }

        setDiscoveredSessionState(prev => {
          const isSameScope = prev.caseId === targetCaseId && prev.accessToken === targetAccessToken;
          const userSelection = (isSameScope && prev.userSelection && prev.userSelection !== 'UNTOUCHED')
            ? prev.userSelection
            : 'UNTOUCHED';
          const selectedSessionId = (isSameScope && userSelection === 'SELECTED')
            ? prev.selectedSessionId
            : null;

          return {
            caseId: targetCaseId,
            accessToken: targetAccessToken,
            sessionId: pickedId,
            sessions,
            status,
            userSelection,
            selectedSessionId,
          };
        });
      })
      .catch(() => {
        if (controller.signal.aborted) return;
        setDiscoveredSessionState({
          caseId: targetCaseId,
          accessToken: targetAccessToken,
          sessionId: null,
          sessions: [],
          status: 'error',
          userSelection: 'UNTOUCHED',
          selectedSessionId: null,
        });
      });

    return () => controller.abort();
  }, [selectedCaseId, propSessionId, effectiveAccessToken, effectiveIsDevPreview, lang, caseStatus, vaultStatus]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);

  // Unsaved changes protection
  const [pendingCaseSwitchItem, setPendingCaseSwitchItem] = useState(null);
  const [showUnsavedModal, setShowUnsavedModal] = useState(false);

  // Dossier State
  const [previewDoc, setPreviewDoc] = useState(null);
  const [isPreviewLoading, setIsPreviewLoading] = useState(false);
  const previewController = useRef(null);
  const previewScope = `${selectedCaseId}:${effectiveAccessToken}`;
  const [lastPreviewScope, setLastPreviewScope] = useState(previewScope);
  if (lastPreviewScope !== previewScope) {
    setLastPreviewScope(previewScope);
    setPreviewDoc(null);
    setIsPreviewLoading(false);
  }
  useEffect(() => () => previewController.current?.abort(), [selectedCaseId, effectiveAccessToken]);
  const [dossier, setDossier] = useState(initialDossier);
  const [isDossierLoading, setIsDossierLoading] = useState(false);
  const [dossierNotFound, setDossierNotFound] = useState(false);
  const [dossierError, setDossierError] = useState(null);

  // Form State (CHỈ COURT theo quyết định chốt)
  const [legalBasisType, setLegalBasisType] = useState('NOTARIAL_PARTITION');
  const [issuer, setIssuer] = useState('');
  const [documentNumber, setDocumentNumber] = useState('');
  const [issuanceDate, setIssuanceDate] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [notes, setNotes] = useState('');
  const [evidenceFile, setEvidenceFile] = useState(null);

  // Allocations State (Finding B)
  const [allocations, setAllocations] = useState([]);
  const [availableAssets, setAvailableAssets] = useState([]);
  const [availableBeneficiaries, setAvailableBeneficiaries] = useState([]);

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
      setAvailableAssets([]); setAvailableBeneficiaries([]);
      setDossierError(null);
      setDossierNotFound(false);
      setActionSuccess(null);
      setActionError(null);

      try {
        const isClosedCase = ['CLOSED', 'CANCELLED'].includes(caseStatus) || vaultStatus === 'ARCHIVED';

        // Load basis dossier for history view
        const dossierPromise = fetchBasisDossier(selectedCaseId, {
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
          signal: controller.signal,
        });

        // Chỉ gọi API assets & beneficiaries khi hồ sơ đang OPEN để lập phân bổ
        // Các hồ sơ đã đóng/lưu trữ ở chế độ xem lịch sử, không gọi API chỉ dành cho ca OPEN (tránh 404)
        let assets = [];
        let beneficiaries = [];

        const isCaseMetadataLoading = !effectiveIsDevPreview && Boolean(effectiveAccessToken) && !isCaseMetadataReady;
        if (!isClosedCase && !isCaseMetadataLoading) {
          try {
            const [fetchedAssets, fetchedBeneficiaries] = await Promise.all([
              fetchStaffAssetCatalog(selectedCaseId, {
                accessToken: effectiveAccessToken,
                isDevPreview: effectiveIsDevPreview,
                lang,
                signal: controller.signal,
              }),
              fetchStaffCaseBeneficiaries(selectedCaseId, {
                accessToken: effectiveAccessToken,
                isDevPreview: effectiveIsDevPreview,
                lang,
                signal: controller.signal,
              }),
            ]);
            assets = fetchedAssets || [];
            beneficiaries = fetchedBeneficiaries || [];
          } catch (scopeErr) {
            // Phân biệt giới hạn đọc lịch sử với dữ liệu không tồn tại:
            // Nếu API chỉ hỗ trợ ca OPEN trả 404, giữ rỗng để xem lịch sử hồ sơ thay vì làm hỏng toàn trang
            if (scopeErr?.status === 404 || scopeErr?.code === 'RESOURCE_NOT_FOUND') {
              assets = [];
              beneficiaries = [];
            } else {
              throw scopeErr;
            }
          }
        }

        const result = await dossierPromise;

        if (active && currentCaseIdRef.current === selectedCaseId) {
          setAvailableAssets(assets || []);
          setAvailableBeneficiaries(beneficiaries || []);
          if (result.notFound || !result.dossier) {
            setDossier(null);
            setDossierNotFound(true);
          } else {
            setDossier(result.dossier);
            setDossierNotFound(false);
            if (['COURT', 'NOTARIAL'].includes(result.dossier.route)) {
              setLegalBasisType(result.dossier.route === 'NOTARIAL' ? 'NOTARIAL_PARTITION' : 'COURT_JUDGMENT');
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
  }, [selectedCaseId, effectiveAccessToken, effectiveIsDevPreview, lang, en, caseStatus, vaultStatus, isCaseMetadataReady]);

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
        recipientKind: 'existing',
        courtRecipient: {},
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
  const canReceiveBasis = !dossier || isRouteCourt || isRouteNotarial;
  const isLatestForwarded = latestVersion?.forwardStatus === 'FORWARDED';
  const forwardBlocked = !selectedCaseId ? (en ? 'Select a case first.' : 'Chọn hồ sơ trước.')
    : isDossierLoading || isForwarding || isSubmitting ? (en ? 'Wait for the current operation.' : 'Chờ thao tác hiện tại hoàn tất.')
      : dossierError ? (en ? 'Reload the dossier to check its status.' : 'Tải lại hồ sơ để kiểm tra trạng thái.')
        : ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) ? (en ? 'This case is closed.' : 'Hồ sơ đã đóng.')
          : isRouteOnHold ? (en ? 'The dossier is on hold.' : 'Hồ sơ đang tạm dừng.')
              : !latestVersion ? (en ? 'Receive the distribution document and allocations first.' : 'Tiếp nhận giấy tờ phân chia và thông tin người nhận trước.')
                : isLatestForwarded ? (en ? 'This version has already been sent to Legal.' : 'Phiên bản này đã chuyển Legal.') : '';
  const isLiveWithoutMetadataSource = Boolean(effectiveAccessToken) && availableAssets.length === 0;

  // Submit phiên bản mới (Finding B & C & Lỗi A/B/C)
  const handleSubmitVersion = async (e) => {
    e.preventDefault();
    if (isSubmitting || isForwarding || isDossierLoading || dossierError || !canReceiveBasis || ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status)) return;
    if (mutationControllerRef.current && !mutationControllerRef.current.signal.aborted) return;

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
      ...(legalBasisType === 'NOTARIAL_PARTITION' ? { notaryAuthority: issuer, notarialDocumentNumber: documentNumber, notarizedAt: issuanceDate } : {}),
    }, { lang, requireFile: true });

    const newErrors = { ...validation.errors };

    const allocationCheck = buildCourtAllocations(allocations, { assets: availableAssets, recipients: availableBeneficiaries, requireCatalog: Boolean(effectiveAccessToken) });
    if (allocationCheck.errors.length) newErrors.allocations = courtAllocationError(allocationCheck.errors[0], lang);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }
    setErrors({});

    const formattedAllocations = allocationCheck.allocations;

    const metadata = {
      legalBasisType,
      issuingAuthority: issuer.trim(),
      documentNumber: documentNumber.trim(),
      issueDate: issuanceDate,
      ...(legalBasisType === 'NOTARIAL_PARTITION' ? { notaryAuthority: issuer.trim(), notarialDocumentNumber: documentNumber.trim(), notarizedAt: issuanceDate } : {}),
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
      const transfer = await receiveAndForwardBasisVersion(requestCaseId, {
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

      setDossier(transfer.dossier);
      handleResetForm();setActiveTab('overview');
      if(!transfer.error) {
        setActionSuccess((en ? 'Documents saved and sent to Legal.' : 'Đã lưu và chuyển giấy tờ thẩm định.') + workflowNotificationFeedback(transfer.dossier, 'LEGAL', lang));
      } else if([401,403].includes(transfer.error.status)) {
        setDossier(null);setAvailableAssets([]);setAvailableBeneficiaries([]);
        if(transfer.error.status===401)onUnauthorized?.();
        setActionError(en?'Access to this case is no longer available.':'Bạn không còn quyền xử lý hồ sơ này.');
      } else {
        setActionError(en ? 'Documents were saved, but could not be forwarded. Use “Send to Legal” to retry; do not upload them again.' : 'Đã lưu giấy tờ nhưng chưa chuyển thẩm định được. Chọn “Chuyển Pháp lý” để thử lại, không cần tải tệp lần nữa.');
      }
    } catch (err) {
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }
      if([401,403].includes(err.status)){setDossier(null);setAvailableAssets([]);setAvailableBeneficiaries([]);if(err.status===401)onUnauthorized?.();}
      setActionError(en ? 'The upload could not be confirmed. Reload the case before retrying.' : 'Chưa xác nhận được kết quả tải giấy tờ. Hãy tải lại hồ sơ trước khi thử lại.');
    } finally {
      if (activeMutationIdRef.current === mutationId && currentCaseIdRef.current === requestCaseId) {
        mutationControllerRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  // Forward phiên bản mới nhất cho Ban Pháp lý (Finding C & Lỗi B/C)
  const handleViewVersionFile = async (version) => {
    if (!selectedCaseId || !version?.version) return;
    if (previewController.current && !previewController.current.signal.aborted) return;
    const c = new AbortController();
    previewController.current = c;
    setIsPreviewLoading(true);
    setActionError(null);
    try {
      const blob = await readBasisVersionContent(selectedCaseId, version.version, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
        signal: c.signal,
      });
      if (c.signal.aborted) return;
      const url = URL.createObjectURL(blob);
      setPreviewDoc({
        blobUrl: url,
        fileName: 'legal-basis-v' + version.version + '-' + selectedCaseId.slice(0, 8) + '.pdf',
        contentType: version.contentType || 'application/pdf',
      });
    } catch (err) {
      if (c.signal.aborted) return;
      if (err.status === 401) onUnauthorized?.();
      setActionError(err.message || (en ? 'Failed to read document file.' : 'Không thể tải nội dung tệp.'));
    } finally {
      if (previewController.current === c) previewController.current = null;
      if (!c.signal.aborted) setIsPreviewLoading(false);
    }
  };

  const handleForwardToLegal = async () => {
    if (forwardBlocked) return;
    if (mutationControllerRef.current && !mutationControllerRef.current.signal.aborted) return;

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
      setActionSuccess(t.forwardSuccessNotice + workflowNotificationFeedback(updatedDossier, 'LEGAL', lang));
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
        mutationControllerRef.current = null;
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
        </div>
      </div>

      {/* Unified Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={selectedCaseId}
        caseItem={displayCaseItem}
        sessionId={propSessionId}
        onOpenSelector={() => setIsSelectorOpen(true)}
        onChangeCase={() => setIsSelectorOpen(true)}
        lang={lang}
      />

      <StaffWorkflowGuide current="intake" caseId={selectedCaseId} sessionId={propSessionId} lang={lang} preview={effectiveIsDevPreview && !effectiveAccessToken}
        caseStatus={displayCaseItem?.status} vaultStatus={isRouteOnHold ? 'ON_HOLD' : displayCaseItem?.vaultStatus}
        loading={isDossierLoading} error={dossierError} forwarded={dossier ? isLatestForwarded : undefined} />

      {(['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) || displayCaseItem?.vaultStatus === 'ARCHIVED') && (
        <div className="lv-form-info-banner" role="status" style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', margin: '14px 0', fontSize: '13px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span>{en ? 'This case is closed or archived. Documents and history are available for reference in read-only mode.' : 'Hồ sơ đã đóng hoặc đã lưu trữ. Văn bản và lịch sử hiển thị ở chế độ chỉ đọc.'}</span>
            {isDiscoveredScopeMatching && discoveredSessionState.status === 'empty' && (
              <div style={{ fontSize: '12px', color: '#15803d', marginTop: '2px' }}>
                {en ? '(No handover session recorded for this case)' : '(Hồ sơ này chưa ghi nhận phiên bàn giao)'}
              </div>
            )}
            {isDiscoveredScopeMatching && discoveredSessionState.status === 'error' && (
              <div style={{ fontSize: '12px', color: '#b91c1c', marginTop: '2px' }}>
                {en ? '(Could not load historical handover sessions)' : '(Không thể tải danh sách phiên bàn giao lịch sử)'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {isDiscoveredScopeMatching && (discoveredSessionState.sessions?.length > 1 || discoveredSessionState.status === 'ambiguous') && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <label htmlFor="staff-historical-session-select" style={{ fontSize: '12px', fontWeight: 600 }}>
                  {en ? 'Session:' : 'Phiên:'}
                </label>
                <select
                  id="staff-historical-session-select"
                  value={effectiveSessionId}
                  onChange={e => {
                    const val = e.target.value;
                    if (!val) {
                      setDiscoveredSessionState(prev => ({
                        ...prev,
                        userSelection: 'CLEARED',
                        selectedSessionId: null,
                      }));
                    } else {
                      const isValid = Boolean(discoveredSessionState.sessions?.some(s => s.sessionId === val));
                      setDiscoveredSessionState(prev => ({
                        ...prev,
                        userSelection: isValid ? 'SELECTED' : 'CLEARED',
                        selectedSessionId: isValid ? val : null,
                      }));
                    }
                  }}
                  style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '4px', border: '1px solid #86efac', background: '#fff' }}
                >
                  <option value="">{en ? '-- Select session --' : '-- Chọn phiên bàn giao --'}</option>
                  {discoveredSessionState.sessions.map((s, idx) => (
                    <option key={s.sessionId || idx} value={s.sessionId}>
                      {s.sessionNumber || (s.sessionId ? s.sessionId.slice(0, 8) : `Session #${idx + 1}`)} ({s.status})
                    </option>
                  ))}
                </select>
              </div>
            )}
            {effectiveSessionId ? (
              <a
                href={`/staff/close-and-archive?caseId=${encodeURIComponent(selectedCaseId)}&sessionId=${encodeURIComponent(effectiveSessionId)}`}
                style={{ color: '#166534', fontWeight: 600, textDecoration: 'underline' }}
              >
                {en ? 'View archive & receipts' : 'Xem lưu trữ & biên nhận'}
              </a>
            ) : isDiscoveredScopeMatching && (discoveredSessionState.sessions?.length > 1 || discoveredSessionState.status === 'ambiguous' || discoveredSessionState.userSelection === 'CLEARED') ? (
              <span
                style={{ color: '#15803d', fontSize: '12px', fontStyle: 'italic' }}
              >
                {en ? 'Please select a handover session to view archive & receipts' : 'Vui lòng chọn phiên bàn giao để xem lưu trữ & biên nhận'}
              </span>
            ) : (
              <a
                href={`/staff/close-and-archive?caseId=${encodeURIComponent(selectedCaseId)}`}
                style={{ color: '#166534', fontWeight: 600, textDecoration: 'underline' }}
              >
                {en ? 'View archive & receipts' : 'Xem lưu trữ & biên nhận'}
              </a>
            )}
          </div>
        </div>
      )}
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
          <section className="lv-dossier-card lv-staff-glow" aria-labelledby="dossier-overview-heading">
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
                <h3>{en ? 'Receive distribution documents' : 'Tiếp nhận giấy tờ phân chia tài sản'}</h3>
                <p>{en ? 'Upload the documents and allocations, then forward them to Legal.' : 'Tải lên giấy tờ cùng thông tin phân chia, sau đó chuyển cho Pháp lý thẩm định.'}</p>
              </div>
            )}

            {dossierError && (
              <div className="lv-form-error-banner" role="alert">
                <AlertTriangle size={18} aria-hidden="true" />
                <span>{dossierError}</span>
              </div>
            )}

            {/* Cảnh báo luồng cũ NOTARIAL chỉ đọc */}


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
                    <span className="lv-dossier-label">{en ? 'Document number' : 'Số hiệu văn bản'}</span>
                    <span className="lv-dossier-value-text">{latestVersion.documentNumber}</span>
                  </div>
                )}

                {latestVersion?.issuingAuthority && (
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{en ? 'Issuing authority' : 'Cơ quan ban hành'}</span>
                    <span className="lv-dossier-value-text">{latestVersion.issuingAuthority}</span>
                  </div>
                )}

                {latestVersion?.notes && (
                  <div className="lv-dossier-row">
                    <span className="lv-dossier-label">{en ? 'Notes' : 'Ghi chú'}</span>
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
              {latestVersion && (
                <button
                  type="button"
                  className="lv-btn-view-document"
                  onClick={() => handleViewVersionFile(latestVersion)}
                  disabled={isPreviewLoading}
                >
                  {isPreviewLoading ? (
                    <>
                      <RefreshCw size={16} className="lv-spin" aria-hidden="true" />
                      <span>{en ? 'Loading file…' : 'Đang tải tệp…'}</span>
                    </>
                  ) : (
                    <>
                      <FileText size={16} aria-hidden="true" />
                      <span>{en ? 'View document file' : 'Xem tệp số hóa'}</span>
                    </>
                  )}
                </button>
              )}
              {selectedCaseId && (
                <button
                  type="button"
                  className="lv-btn-forward-legal"
                  onClick={handleForwardToLegal}
                  disabled={Boolean(forwardBlocked)} aria-describedby={forwardBlocked ? 'forward-blocked-reason' : undefined}
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
            <WorkflowActionHint id="forward-blocked-reason" reason={forwardBlocked} />
          </section>
        </div>
      )}

      {/* =========================================================================
          TAB 2: TIẾP NHẬN VĂN BẢN (INTAKE)
          ========================================================================= */}
      {selectedCaseId && activeTab === 'intake' && (
        <div id="panel-intake" role="tabpanel" aria-labelledby="tab-btn-intake">
          <section className="lv-staff-form-card lv-form-card lv-staff-glow" aria-labelledby="form-heading">
            <div className="lv-staff-form-card__header lv-form-card__header">
              <h2 id="form-heading">{t.formTitle}</h2>
            </div>



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
                  onChange={(e) => {
                    if(e.target.value === 'NOTARIAL_PARTITION' && allocations.some(row=>row.recipientKind==='court')) {
                      setActionError(en ? 'Select existing case recipients before switching to a notarized document.' : 'Hãy chọn người nhận đã có trong hồ sơ trước khi chuyển sang văn bản công chứng.');return;
                    }
                    setLegalBasisType(e.target.value);
                  }}
                  disabled={isSubmitting || isRouteOnHold}
                >
                  <option value="NOTARIAL_PARTITION" disabled={isRouteCourt}>{en ? 'Notarized distribution document' : 'Văn bản phân chia được công chứng'}</option>
                  <option value="COURT_JUDGMENT" disabled={isRouteNotarial}>{t.typeCourtJudgment}</option>
                  <option value="COURT_DECISION" disabled={isRouteNotarial}>{t.typeCourtDecision}</option>
                </select>
              </div>

              {/* Grid 2 cột: Cơ quan & Số hiệu */}
              <div className="lv-form-row lv-form-row--2cols">
                <div className="lv-form-group">
                  <label htmlFor={issuerId} className="lv-form-label">
                    {legalBasisType === 'NOTARIAL_PARTITION' ? (en ? 'Notary office' : 'Tổ chức công chứng') : t.issuerLabel}
                  </label>
                  <input
                    id={issuerId}
                    type="text"
                    className={`lv-form-input ${errors.issuer ? 'lv-form-input--error' : ''}`}
                    placeholder={t.issuerPlaceholder}
                    value={issuer}
                    onChange={(e) => setIssuer(e.target.value)}
                    disabled={isSubmitting || isRouteOnHold}
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
                  onFileChange={(file) => {
                    setEvidenceFile(file);
                    setErrors((previous) => ({ ...previous, file: undefined }));
                  }}
                  disabled={isSubmitting || isRouteOnHold}
                  lang={lang}
                  accept=".pdf,image/jpeg,image/png"
                  maxSizeBytes={10 * 1024 * 1024}
                  hint={t.fileUploadHint}
                />
                {errors.file && <span className="lv-field-error" role="alert">{getStaffLegalDocumentErrorMessage(errors.file, lang)}</span>}
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
                    disabled={isSubmitting || isDossierLoading || Boolean(dossierError) || !canReceiveBasis || ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) || isLiveWithoutMetadataSource}
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
                  <CourtAllocationEditor allowNewCourtRecipient={legalBasisType !== 'NOTARIAL_PARTITION'} hideHeading rows={allocations} assets={availableAssets} recipients={availableBeneficiaries}
                    lang={lang} onAdd={handleAddAllocation} onChange={handleUpdateAllocation} onRemove={handleRemoveAllocation}
                    disabled={isSubmitting || isDossierLoading || isRouteOnHold} />
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
                  disabled={isSubmitting || isDossierLoading || Boolean(dossierError) || !canReceiveBasis || ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) || allocations.length === 0 || isLiveWithoutMetadataSource}
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
          <section className="lv-dossier-card lv-staff-glow" aria-labelledby="history-heading">
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
                      <th>{en ? 'File' : 'Tệp'}</th>
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
                        <td>
                          <button
                            type="button"
                            className="lv-btn-view-version-file"
                            onClick={() => handleViewVersionFile(v)}
                            disabled={isPreviewLoading}
                            title={en ? `View file for version ${v.version}` : `Xem tệp phiên bản ${v.version}`}
                          >
                            <FileText size={14} aria-hidden="true" />
                            <span>{en ? 'View' : 'Xem'}</span>
                          </button>
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

      {/* Evidence Document Preview Modal (PS-96 & PS-103) */}
      <EvidencePreviewModal
        isOpen={Boolean(previewDoc)}
        onClose={() => setPreviewDoc(null)}
        blobUrl={previewDoc?.blobUrl}
        fileName={previewDoc?.fileName}
        contentType={previewDoc?.contentType}
        lang={lang}
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
