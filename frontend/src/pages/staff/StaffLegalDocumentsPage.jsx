import {staffWorkflowNotificationFeedback as workflowNotificationFeedback} from '../../utils/staffWorkflowNotification.js';
import DistributionWorkflowOverview from '../../workflows/DistributionWorkflowOverview.jsx';
import { useDistributionWorkflow } from '../../workflows/useDistributionWorkflow.js';
import { staffStage } from '../../utils/staffStage.js';
import { canUseDistributionAction, loadDistributionWorkflow, preflightDistributionAction } from '../../workflows/distributionWorkflowService.js';
import StaffDistributionAllocations from './StaffDistributionAllocations.jsx';
import { distributionTabStatus } from '../../utils/distributionTabStatus.js';
import { useState, useId, useEffect, useRef, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  RefreshCw,
  Clock,
  Send,
  Plus,
  FileText,
  Info,
} from 'lucide-react';
import EvidenceFileUploader from '../../components/common/EvidenceFileUploader.jsx';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import {
  validateStaffLegalDocumentForm,
  formatStaffLegalDocumentErrors,
} from '../../utils/staffLegalDocumentsValidation.js';
import DatePicker from '../../components/common/DatePicker.jsx';
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
import { formatStaffSession } from '../../utils/caseReference.js';
import StaffLegalDecisionNotice from '../../components/staff/StaffLegalDecisionNotice.jsx';
import { BasisVersionOutcome } from '../../components/staff/StaffDocumentOutcome.jsx';
import { basisTypeForRoute } from '../../utils/basisTypeForRoute.js';
import { versionOutcomeChip } from '../../components/staff/documentOutcomeResults.js';
import StaffLegalOutcomeCard from '../../components/staff/StaffLegalOutcomeCard.jsx';
import { mapCurrentBasisDecision } from './staffLegalDocumentsService.js';


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
  legalDecision = null,
  onCaseChange,
  onUnauthorized,
}) {
  const t = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;
  const en = lang === 'en';

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  // Active Tab: 'overview' | 'intake' | 'allocations' | 'history'
  const [activeTab, setActiveTab] = useState(() => {
    const tabParam = new URLSearchParams(globalThis.window?.location?.search || '').get('tab');
    return ['overview', 'intake', 'allocations', 'history'].includes(tabParam) ? tabParam : 'overview';
  });

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
  const [dossierRevision,setDossierRevision] = useState(0);

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
  const [legalBasisType, setLegalBasisType] = useState('');
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
  const distribution = useDistributionWorkflow({ caseId: selectedCaseId, workspace: 'STAFF', accessToken: effectiveAccessToken, lang, onUnauthorized, isMutationPending:()=>isSubmitting || isForwarding, onExternalChange:()=>setDossierRevision(value=>value+1) });
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

  const [draftToken, setDraftToken] = useState(effectiveAccessToken);
  if (draftToken !== effectiveAccessToken) {
    setDraftToken(effectiveAccessToken); handleResetForm(); setDossier(null);
    setAvailableAssets([]); setAvailableBeneficiaries([]); setActiveTab('overview');
  }

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
        // Load basis dossier for history view
        const dossierPromise = fetchBasisDossier(selectedCaseId, {
          accessToken: effectiveAccessToken,
          isDevPreview: effectiveIsDevPreview,
          lang,
          signal: controller.signal,
        });

        const result = await dossierPromise;

        if (active && currentCaseIdRef.current === selectedCaseId) {
          if (result.notFound || !result.dossier) {
            setDossier(null);
            setDossierNotFound(true);
          } else {
            setDossier(result.dossier);
            setDossierNotFound(false);
            if (['COURT', 'NOTARIAL'].includes(result.dossier.route)) {
              setLegalBasisType(current => basisTypeForRoute(current, result.dossier.route));
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
  }, [selectedCaseId, effectiveAccessToken, effectiveIsDevPreview, lang, en, caseStatus, vaultStatus, isCaseMetadataReady, dossierRevision]);

  useEffect(() => {
    const refresh = () => {
      if (!document.hidden && !isSubmitting && !isForwarding && !hasUnsavedDraft) setDossierRevision(value => value + 1);
    };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [selectedCaseId, effectiveAccessToken, isSubmitting, isForwarding, hasUnsavedDraft]);

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

  useEffect(() => {
    const controller = new AbortController();
    if (distribution.data?.phase !== 'AWAITING_ALLOCATIONS' || !selectedCaseId || !effectiveAccessToken) return;
    Promise.all([
      fetchStaffAssetCatalog(selectedCaseId, { accessToken: effectiveAccessToken, lang, signal: controller.signal }),
      fetchStaffCaseBeneficiaries(selectedCaseId, { accessToken: effectiveAccessToken, lang, signal: controller.signal }),
    ]).then(([assets, recipients]) => {
      if (!controller.signal.aborted) { setAvailableAssets(assets); setAvailableBeneficiaries(recipients); }
    }).catch(error => {
      if (!controller.signal.aborted) {
        setAvailableAssets([]); setAvailableBeneficiaries([]);
        setActionError(en ? 'The asset and recipient lists could not be loaded. Check the case status again.' : 'Chưa tải được danh sách tài sản và người nhận. Chọn kiểm tra lại trạng thái hồ sơ.');
        if (error.status === 401) onUnauthorized?.();
      }
    });
    return () => controller.abort();
  }, [selectedCaseId, effectiveAccessToken, distribution.data?.phase, distribution.data?.document?.version, lang, en, onUnauthorized]);

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
  const mappedDecision = mapCurrentBasisDecision(dossier?.currentDecision, dossier?.caseId || selectedCaseId);
  const effectiveLegalDecision = legalDecision || mappedDecision;
  const isRouteOnHold = dossier?.route === 'ON_HOLD' || dossier?.status === 'ON_HOLD';
  const isRouteNotarial = dossier?.route === 'NOTARIAL';
  const isRouteCourt = dossier?.route === 'COURT';
  const tabStatus = distributionTabStatus(distribution.data, dossier?.versions?.length > 0, en);
  const basisTypeMatchesRoute = !legalBasisType || (!isRouteNotarial && !isRouteCourt)
    || (isRouteNotarial ? legalBasisType === 'NOTARIAL_PARTITION' : ['COURT_JUDGMENT','COURT_DECISION'].includes(legalBasisType));
  const basisTypeRouteError = basisTypeMatchesRoute ? '' : (isRouteNotarial
    ? (en ? 'This dossier currently accepts notarized documents. Select the matching document type; Legal must review a change of legal basis.' : 'Hồ sơ hiện tiếp nhận văn bản công chứng. Chọn đúng loại văn bản; nếu cần dùng giấy tờ Tòa án, Ban Pháp lý phải xem xét lại căn cứ.')
    : (en ? 'This dossier currently accepts court documents. Select the matching court document type.' : 'Hồ sơ hiện tiếp nhận giấy tờ Tòa án. Chọn đúng loại bản án hoặc quyết định của Tòa án.'));
  const canReceiveBasis = (!dossier || isRouteCourt || isRouteNotarial) && canUseDistributionAction(distribution.data, 'uploadDocuments', 'STAFF');
  const isLatestForwarded = latestVersion?.forwardStatus === 'FORWARDED';

  // Phân biệt tiếp nhận lần đầu với yêu cầu bổ sung theo dữ liệu BE thực tế:
  // - Nếu chưa có phiên bản nào (versions = []) và requiredVersion <= 1: Tiếp nhận lần đầu, KHÔNG báo Legal yêu cầu bổ sung.
  // - Nếu đã có phiên bản trước đó (hasPriorVersions) và requiredVersion > latestVersion.version: Legal yêu cầu phiên bản bổ sung mới.
  // - Khi ON_HOLD: tuyệt đối không hiển thị banner bổ sung hoặc hướng dẫn upload vì thao tác đang bị chặn.
  const hasPriorVersions = Boolean(latestVersion && Number.isInteger(latestVersion.version) && latestVersion.version > 0);
  const returnedForSupplementation = distribution.data?.phase === 'AWAITING_DOCUMENTS' && distribution.data?.document?.status === 'CHANGES_REQUESTED';
  const requiredIntakeVersion = Math.max(dossier?.requiredVersion || 1, (latestVersion?.version || 0) + 1);
  const isSupplementationRequired = Boolean(
    !isRouteOnHold &&
    hasPriorVersions &&
    (dossier.requiredVersion > latestVersion.version || returnedForSupplementation)
  );
  const isNeutralVersionRequirement = Boolean(
    !isRouteOnHold &&
    !hasPriorVersions &&
    dossier?.requiredVersion &&
    dossier.requiredVersion > 1
  );
  const forwardBlocked = !selectedCaseId ? (en ? 'Select a case first.' : 'Chọn hồ sơ trước.')
    : isDossierLoading || isForwarding || isSubmitting ? (en ? 'Wait for the current operation.' : 'Chờ thao tác hiện tại hoàn tất.')
      : dossierError ? (en ? 'Reload the dossier to check its status.' : 'Tải lại hồ sơ để kiểm tra trạng thái.')
        : ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) ? (en ? 'This case is closed.' : 'Hồ sơ đã đóng.')
          : !canUseDistributionAction(distribution.data, 'forwardDocuments', 'STAFF') ? (canReceiveBasis
            ? (en ? 'Receive and save the new document before sending it for assessment.' : 'Tiếp nhận và lưu văn bản mới trước khi chuyển Ban Pháp lý thẩm định.')
            : (en ? 'This action is not available in the current workflow stage.' : 'Chưa được chuyển văn bản ở giai đoạn hiện tại. Kiểm tra trạng thái hồ sơ phía trên.'))
          : isRouteOnHold ? (en ? 'The dossier is on hold.' : 'Hồ sơ đang tạm dừng.')
              : !latestVersion ? (en ? 'Receive the distribution document first.' : 'Tiếp nhận giấy tờ phân chia trước.')
                : isLatestForwarded ? (en ? 'This version has already been sent to Legal Department.' : 'Phiên bản này đã chuyển cho Ban Pháp lý.') : '';

  // Submit phiên bản mới (Finding B & C & Lỗi A/B/C)
  const handleSubmitVersion = async (e) => {
    e.preventDefault();
    if (isSubmitting || isForwarding || isDossierLoading || dossierError || !canReceiveBasis || ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status)) return;
    if (mutationControllerRef.current && !mutationControllerRef.current.signal.aborted) return;

    if (basisTypeRouteError) {
      setErrors(previous => ({...previous,legalBasisType:basisTypeRouteError}));
      setActionError(basisTypeRouteError);
      document.getElementById(typeId)?.focus();
      return;
    }

    setActionSuccess(null);
    setActionError(null);

    const validation = validateStaffLegalDocumentForm({
      issuer,
      documentNumber,
      issuanceDate,
      legalBasisType,
      file: evidenceFile,
      ...(legalBasisType === 'NOTARIAL_PARTITION' ? { notaryAuthority: issuer, notarialDocumentNumber: documentNumber, notarizedAt: issuanceDate } : {}),
    }, { lang, requireFile: true });

    const newErrors = formatStaffLegalDocumentErrors(validation.errors, lang);

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      // Auto-scroll and focus to the first invalid field while keeping entered inputs intact
      const fieldOrder = [
        { key: 'issuer', id: issuerId },
        { key: 'documentNumber', id: docNumId },
        { key: 'issuanceDate', id: dateId },
        { key: 'file', selector: '.lv-evidence-dropzone, .lv-evidence-uploader, [data-field="file"], input[type="file"]' },
        { key: 'allocations', selector: '#allocations-section, .lv-btn-add-allocation, .lv-allocations-section' },
      ];
      for (const field of fieldOrder) {
        if (newErrors[field.key]) {
          const el = field.id ? document.getElementById(field.id) : document.querySelector(field.selector);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            if (typeof el.focus === 'function') {
              if (el.tagName === 'DIV' && !el.hasAttribute('tabIndex')) {
                el.setAttribute('tabIndex', '-1');
              }
              const interactive = el.querySelector?.('button, [role="button"], input, select, textarea') || el;
              interactive.focus();
            }
            break;
          }
        }
      }
      return;
    }
    setErrors({});

    const metadata = {
      legalBasisType,
      issuingAuthority: issuer.trim(),
      documentNumber: documentNumber.trim(),
      issueDate: issuanceDate,
      ...(legalBasisType === 'NOTARIAL_PARTITION' ? { notaryAuthority: issuer.trim(), notarialDocumentNumber: documentNumber.trim(), notarizedAt: issuanceDate } : {}),
      evidenceReference: evidenceReference?.trim() || null,
      notes: notes?.trim() || null,
      // Allocations are submitted separately after Legal accepts this document.
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
      await preflightDistributionAction(requestCaseId, 'STAFF', 'uploadDocuments', distribution.data, { accessToken: requestToken, lang, signal: controller.signal });
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
      }, { forward: async (id, version, options) => {
        const current = await loadDistributionWorkflow(id, 'STAFF', options);
        if (!canUseDistributionAction(current, 'forwardDocuments', 'STAFF') || current.document?.version !== version) throw { status: 409 };
        return forwardBasisVersion(id, version, options);
      } });

      // Guard context sau await
      if (
        controller.signal.aborted ||
        activeMutationIdRef.current !== mutationId ||
        currentCaseIdRef.current !== requestCaseId ||
        currentTokenRef.current !== requestToken
      ) {
        return;
      }

      window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
      setDossier(transfer.dossier);
      distribution.refresh();
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
      setActionError(err.status===400
        ? (en ? 'The document information is invalid. Check the document type, issuer, number and issue date. Your entered data is kept.' : 'Thông tin giấy tờ chưa hợp lệ. Kiểm tra loại văn bản, cơ quan ban hành, số hiệu và ngày ban hành. Nội dung đã nhập vẫn được giữ.')
        : err.status===413 ? (en ? 'The file exceeds the upload size limit.' : 'Tệp vượt quá dung lượng cho phép. Vui lòng chọn tệp nhỏ hơn.')
        : (en ? 'The upload could not be confirmed. Reload the case before retrying.' : 'Chưa xác nhận được kết quả tải giấy tờ. Hãy tải lại hồ sơ trước khi thử lại.'));
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
      const contentType = version.contentType || blob.type || 'application/pdf';
      setPreviewDoc({
        blobUrl: url,
        fileName: 'legal-basis-v' + version.version + '-' + selectedCaseId.slice(0, 8) + ({ 'image/jpeg': '.jpg', 'image/png': '.png' }[contentType] || '.pdf'),
        contentType,
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
      const currentWorkflow = await preflightDistributionAction(requestCaseId, 'STAFF', 'forwardDocuments', distribution.data, { accessToken: requestToken, lang, signal: controller.signal });
      if (currentWorkflow.document?.version !== latestVer.version) throw { status: 409 };
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

      window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
      setDossier(updatedDossier);
      distribution.refresh();
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
    const tabs = ['overview', 'intake', 'allocations', 'history'];
    const tabIds = ['tab-btn-overview', 'tab-btn-intake', 'tab-btn-allocations', 'tab-btn-history'];
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
        <div className="lv-staff-title-left">
          <h1 className="lv-staff-title">{t.pageTitle}</h1>
        </div>
      </div>

      {/* Unified Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={selectedCaseId}
        caseItem={displayCaseItem}
        onOpenSelector={() => setIsSelectorOpen(true)}
        onChangeCase={() => setIsSelectorOpen(true)}
        stage={staffStage(distribution.data, en)}
        outcomeChip={latestVersion ? versionOutcomeChip(latestVersion, en) : null}
        lang={lang}
      />

      {selectedCaseId && !dossierError && <DistributionWorkflowOverview workflow={distribution} workspace="STAFF" lang={lang} showRefresh={false} />}
      <StaffLegalDecisionNotice decision={effectiveLegalDecision} caseId={selectedCaseId} currentVersion={latestVersion?.version} lang={lang} onViewHistory={()=>setActiveTab('history')} />

      {(['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status) || displayCaseItem?.vaultStatus === 'ARCHIVED') && (
        <div className="lv-form-info-banner" role="status" style={{ padding: '12px 16px', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '8px', color: '#166534', margin: '14px 0', fontSize: '14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <span>{en ? 'This case is closed or archived. Documents and history are available for reference in read-only mode.' : 'Hồ sơ đã đóng hoặc đã lưu trữ. Văn bản và lịch sử hiển thị ở chế độ chỉ đọc.'}</span>
            {isDiscoveredScopeMatching && discoveredSessionState.status === 'empty' && (
              <div style={{ fontSize: '14px', color: '#15803d', marginTop: '2px' }}>
                {en ? '(No handover session recorded for this case)' : '(Hồ sơ này chưa ghi nhận phiên bàn giao)'}
              </div>
            )}
            {isDiscoveredScopeMatching && discoveredSessionState.status === 'error' && (
              <div style={{ fontSize: '14px', color: '#b91c1c', marginTop: '2px' }}>
                {en ? '(Could not load historical handover sessions)' : '(Không thể tải danh sách phiên bàn giao lịch sử)'}
              </div>
            )}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            {isDiscoveredScopeMatching && (discoveredSessionState.sessions?.length > 1 || discoveredSessionState.status === 'ambiguous') && (
              <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
                <label htmlFor="staff-historical-session-select" style={{ fontSize: '14px', fontWeight: 600 }}>
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
                  style={{ fontSize: '14px', padding: '4px 8px', borderRadius: '6px', border: '1px solid #86efac', background: '#fff' }}
                >
                  <option value="">{en ? '-- Select session --' : '-- Chọn phiên bàn giao --'}</option>
                  {discoveredSessionState.sessions.map((s, idx) => (
                    <option key={s.sessionId || idx} value={s.sessionId}>
                      {formatStaffSession(s, lang)}
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
                style={{ color: '#15803d', fontSize: '14px', fontStyle: 'italic' }}
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
            <span>{t.tabOverview}</span>
            <span className={`lv-staff-tab-dot is-${tabStatus.overview.tone}`} role="img" aria-label={tabStatus.overview.label} title={tabStatus.overview.label} />
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
            <span>{t.tabIntake}</span>
            <span className={`lv-staff-tab-dot is-${tabStatus.intake.tone}`} role="img" aria-label={tabStatus.intake.label} title={tabStatus.intake.label} />
          </button>

          <button
            type="button"
            role="tab"
            id="tab-btn-allocations"
            aria-controls="panel-allocations"
            aria-selected={activeTab === 'allocations'}
            tabIndex={activeTab === 'allocations' ? 0 : -1}
            className={`lv-staff-tab-btn ${activeTab === 'allocations' ? 'lv-staff-tab-btn--active' : ''}`}
            onClick={() => setActiveTab('allocations')}
          >
            <span>{en ? 'Asset allocations' : 'Phân bổ tài sản'}</span>
            <span className={`lv-staff-tab-dot is-${tabStatus.allocations.tone}`} role="img" aria-label={tabStatus.allocations.label} title={tabStatus.allocations.label} />
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
            <span>{t.tabHistory}</span>
            <span className={`lv-staff-tab-dot is-${tabStatus.history.tone}`} role="img" aria-label={tabStatus.history.label} title={tabStatus.history.label} />
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
          {latestVersion && effectiveLegalDecision?.decision !== 'LEGAL_REJECTED' && <StaffLegalOutcomeCard version={latestVersion} en={en} />}
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
              <div className="lv-dossier-unconnected-box lv-dossier-empty-state" role="status">
                <h3>{en ? 'Receive distribution documents' : 'Tiếp nhận giấy tờ phân chia tài sản'}</h3>
                <p>{en ? 'Submit the documents requested by Legal. Allocations are prepared after Legal accepts the documents.' : 'Nộp giấy tờ Ban Pháp lý đã yêu cầu. Chỉ lập phân bổ sau khi Ban Pháp lý duyệt căn cứ.'}</p>
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
                  {dossier?.routeReason ? (
                    <p style={{ marginTop: 4, fontStyle: 'italic' }}><strong>{en ? 'Reason:' : 'Lý do:'}</strong> {dossier.routeReason}</p>
                  ) : (
                    <p style={{ marginTop: 4, fontStyle: 'italic', color: '#64748b' }}>
                      {en ? 'The dossier is placed on hold by Legal decision. Please wait for further guidance.' : 'Hồ sơ đang tạm giữ theo quyết định của Ban Pháp lý. Vui lòng chờ hướng dẫn.'}
                    </p>
                  )}
                </div>
              </div>
            )}

            {/* LV-SUPP-001: Supplementation required by real BE contract (requiredVersion > latest version with prior history) */}
            {isSupplementationRequired && (
              <div className="lv-dossier-hold-banner lv-dossier-supplement-banner" role="status" style={{ marginBottom: 20, borderColor: '#fed7aa', backgroundColor: '#fff7ed', color: '#9a3412' }}>
                <AlertTriangle size={20} className="lv-dossier-hold-icon" style={{ color: '#ea580c' }} aria-hidden="true" />
                <div>
                  <strong>{t.dossierSupplementationTitle}</strong>
                  <p>{t.dossierSupplementationDesc}</p>
                  <p style={{ marginTop: 4, fontStyle: 'italic', color: '#7c2d12' }}>
                    {en
                      ? `Receive document version ${requiredIntakeVersion}.`
                      : `Vui lòng tiếp nhận phiên bản hồ sơ số ${requiredIntakeVersion}.`}
                  </p>
                  <button type="button" className="lv-btn-go-intake" disabled={!canReceiveBasis} onClick={() => setActiveTab('intake')}>
                    {en ? `Receive version ${requiredIntakeVersion}` : `Tiếp nhận phiên bản ${requiredIntakeVersion}`}
                  </button>
                </div>
              </div>
            )}

            {isNeutralVersionRequirement && (
              <div className="lv-dossier-hold-banner" role="status" style={{ marginBottom: 20, borderColor: '#fed7aa', backgroundColor: '#fff7ed', color: '#9a3412' }}>
                <AlertTriangle size={20} className="lv-dossier-hold-icon" style={{ color: '#ea580c' }} aria-hidden="true" />
                <div>
                  <strong>{t.dossierNeutralVersionTitle || (en ? 'Dossier Version Requirement' : 'Yêu cầu phiên bản hồ sơ')}</strong>
                  <p style={{ marginTop: 4, fontStyle: 'italic', color: '#7c2d12' }}>
                    {en
                      ? `Please submit dossier version ${dossier.requiredVersion}.`
                      : `Vui lòng tiếp nhận phiên bản hồ sơ số ${dossier.requiredVersion}.`}
                  </p>
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
              {selectedCaseId && !isLatestForwarded && !['CLOSED','CANCELLED'].includes(displayCaseItem?.status) && (
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

              {!['CLOSED','CANCELLED'].includes(displayCaseItem?.status) && <button
                type="button"
                className="lv-btn-go-intake"
                onClick={() => setActiveTab('intake')}
                disabled={isRouteOnHold}
              >
                <Plus size={16} aria-hidden="true" />
                <span>{t.btnGoToIntake}</span>
              </button>}
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
              <p className="lv-staff-tab-desc">{en ? 'Upload only the requested documents here.' : 'Tại đây chỉ tải giấy tờ được yêu cầu.'}</p>
            </div>



            {isRouteOnHold && (
              <div className="lv-dossier-hold-banner" role="alert" style={{ marginBottom: 20 }}>
                <Clock size={20} className="lv-dossier-hold-icon" aria-hidden="true" />
                <div>
                  <strong>{t.dossierOnHoldTitle}</strong>
                  <p>{t.dossierOnHoldDesc}</p>
                  {dossier?.routeReason && <p style={{ marginTop: 4, fontStyle: 'italic' }}><strong>{en ? 'Reason:' : 'Lý do:'}</strong> {dossier.routeReason}</p>}
                </div>
              </div>
            )}

            {isSupplementationRequired && (
              <div className="lv-dossier-hold-banner lv-dossier-supplement-banner" role="status" style={{ marginBottom: 20, borderColor: '#fed7aa', backgroundColor: '#fff7ed', color: '#9a3412' }}>
                <AlertTriangle size={20} className="lv-dossier-hold-icon" style={{ color: '#ea580c' }} aria-hidden="true" />
                <div>
                  <strong>{t.dossierSupplementationTitle}</strong>
                  <p>{t.dossierSupplementationDesc}</p>
                  <p style={{ marginTop: 4, fontStyle: 'italic', color: '#7c2d12' }}>
                    {en
                      ? `Receive document version ${requiredIntakeVersion}.`
                      : `Vui lòng tiếp nhận phiên bản hồ sơ số ${requiredIntakeVersion}.`}
                  </p>
                </div>
              </div>
            )}

            {isNeutralVersionRequirement && (
              <div className="lv-dossier-hold-banner" role="status" style={{ marginBottom: 20, borderColor: '#fed7aa', backgroundColor: '#fff7ed', color: '#9a3412' }}>
                <AlertTriangle size={20} className="lv-dossier-hold-icon" style={{ color: '#ea580c' }} aria-hidden="true" />
                <div>
                  <strong>{t.dossierNeutralVersionTitle || (en ? 'Dossier Version Requirement' : 'Yêu cầu phiên bản hồ sơ')}</strong>
                  <p style={{ marginTop: 4, fontStyle: 'italic', color: '#7c2d12' }}>
                    {en
                      ? `Please submit dossier version ${dossier.requiredVersion}.`
                      : `Vui lòng tiếp nhận phiên bản hồ sơ số ${dossier.requiredVersion}.`}
                  </p>
                </div>
              </div>
            )}

            <form onSubmit={handleSubmitVersion} noValidate className="lv-intake-form">
              {/* Record the actual document submitted; Legal does not preselect its source. */}
              <div className="lv-form-group">
                <label htmlFor={typeId} className="lv-form-label lv-form-label--required">
                  {t.legalBasisTypeLabel}
                </label>
                <select
                  id={typeId}
                  className="lv-form-select"
                  value={legalBasisType}
                  onChange={(e) => {setLegalBasisType(e.target.value);setErrors(previous=>({...previous,legalBasisType:''}));}}
                  disabled={isSubmitting || !canReceiveBasis}
                  aria-invalid={!basisTypeMatchesRoute || undefined}
                >
                  <option value="">{en ? 'Select the submitted document type' : 'Chọn loại giấy tờ thực tế được nộp'}</option>
                  <option value="NOTARIAL_PARTITION" disabled={isRouteCourt}>{en ? 'Notarized distribution document' : 'Văn bản phân chia được công chứng'}</option>
                  <option value="COURT_JUDGMENT" disabled={isRouteNotarial}>{t.typeCourtJudgment}</option>
                  <option value="COURT_DECISION" disabled={isRouteNotarial}>{t.typeCourtDecision}</option>
                </select>
                {basisTypeRouteError && <span className="lv-field-error" role="alert">{basisTypeRouteError}</span>}
              </div>

              {/* Grid 2 cột: Cơ quan & Số hiệu */}
              <div className="lv-form-row lv-form-row--2cols">
                <div className="lv-form-group">
                  <label htmlFor={issuerId} className="lv-form-label lv-form-label--required">
                    {legalBasisType === 'NOTARIAL_PARTITION' ? (en ? 'Notary office' : 'Tổ chức công chứng') : t.issuerLabel}
                  </label>
                  <input
                    id={issuerId}
                    type="text"
                    className={`lv-form-input ${errors.issuer ? 'lv-form-input--error' : ''}`}
                    aria-invalid={Boolean(errors.issuer)}
                    aria-describedby={errors.issuer ? `${issuerId}-error` : undefined}
                    placeholder={isRouteNotarial ? (en ? 'e.g. Notarial office name' : 'VD: Văn phòng công chứng Nguyễn An') : t.issuerPlaceholder}
                    value={issuer}
                    onChange={(e) => { setIssuer(e.target.value); if (errors.issuer) setErrors(prev => ({ ...prev, issuer: '' })); }}
                    disabled={isSubmitting || !canReceiveBasis}
                    maxLength={255}
                  />
                  {errors.issuer && (
                    <span id={`${issuerId}-error`} className="lv-field-error" role="alert">{errors.issuer}</span>
                  )}
                </div>

                <div className="lv-form-group">
                  <label htmlFor={docNumId} className="lv-form-label lv-form-label--required">
                    {t.documentNumberLabel}
                  </label>
                  <input
                    id={docNumId}
                    type="text"
                    className={`lv-form-input ${errors.documentNumber ? 'lv-form-input--error' : ''}`}
                    aria-invalid={Boolean(errors.documentNumber)}
                    aria-describedby={errors.documentNumber ? `${docNumId}-error` : undefined}
                    placeholder={t.documentNumberPlaceholder}
                    value={documentNumber}
                    onChange={(e) => { setDocumentNumber(e.target.value); if (errors.documentNumber) setErrors(prev => ({ ...prev, documentNumber: '' })); }}
                    disabled={isSubmitting || !canReceiveBasis}
                    maxLength={100}
                  />
                  {errors.documentNumber && (
                    <span id={`${docNumId}-error`} className="lv-field-error" role="alert">{errors.documentNumber}</span>
                  )}
                </div>
              </div>

              {/* Grid 2 cột: Ngày ban hành & Mã tham chiếu hồ sơ giấy */}
              <div className="lv-form-row lv-form-row--2cols">
                <div className="lv-form-group">
                  <label htmlFor={dateId} className="lv-form-label lv-form-label--required">
                    {t.issuanceDateLabel}
                  </label>
                  <DatePicker
                    id={dateId}
                    className={errors.issuanceDate ? 'lv-datepicker--error' : ''}
                    value={issuanceDate}
                    onChange={(val) => {
                      setIssuanceDate(val);
                      if (errors.issuanceDate) setErrors(prev => ({ ...prev, issuanceDate: '' }));
                    }}
                    disabled={isSubmitting || !canReceiveBasis}
                    max={new Date().toISOString().split('T')[0]}
                    lang={lang}
                    aria-label={t.issuanceDateLabel}
                    aria-invalid={Boolean(errors.issuanceDate)}
                    aria-describedby={errors.issuanceDate ? `${dateId}-error` : undefined}
                  />
                  {errors.issuanceDate && (
                    <span id={`${dateId}-error`} className="lv-field-error" role="alert">{errors.issuanceDate}</span>
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
                    disabled={isSubmitting || !canReceiveBasis}
                    maxLength={500}
                  />
                </div>
              </div>

              {/* Right column on wide screens: file first, short note under it */}
              <div className="lv-intake-aside">
                <div className="lv-form-group lv-intake-aside__file">
                  <label className="lv-form-label lv-form-label--required">{t.fileUploadLabel}</label>
                  <EvidenceFileUploader
                    file={evidenceFile}
                    error={errors.file}
                    onFileChange={(file) => {
                      setEvidenceFile(file);
                      setErrors((previous) => ({ ...previous, file: undefined }));
                    }}
                    disabled={isSubmitting || !canReceiveBasis}
                    lang={lang}
                    required={false}
                  />
                </div>

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
                    disabled={isSubmitting || !canReceiveBasis}
                    rows={3}
                    maxLength={1000}
                  />
                </div>
              </div>

              {/* Thanh tiến trình upload */}
              {uploadProgress && uploadProgress.phase !== 'error' && (
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
                  disabled={isSubmitting || isDossierLoading || Boolean(dossierError) || !canReceiveBasis || ['CLOSED', 'CANCELLED'].includes(displayCaseItem?.status)}
                >
                  {isSubmitting ? (
                    <>
                      <RefreshCw size={16} className="lv-spin" aria-hidden="true" />
                      <span>{t.submittingVersion}</span>
                    </>
                  ) : (
                    <span>{en ? 'Save and send documents to Legal' : 'Lưu và chuyển giấy tờ cho Ban Pháp lý'}</span>
                  )}
                </button>


              </div>
            </form>
          </section>
        </div>
      )}

      {selectedCaseId && activeTab === 'allocations' && <div id="panel-allocations" role="tabpanel" aria-labelledby="tab-btn-allocations">
        <StaffDistributionAllocations key={`${selectedCaseId}:${effectiveAccessToken}`} workflow={distribution} dossier={dossier} assets={availableAssets}
          recipients={availableBeneficiaries} rows={allocations} onAdd={handleAddAllocation} onChange={handleUpdateAllocation}
          onRemove={handleRemoveAllocation} onRestore={setAllocations} lang={lang} onSubmitted={() => setAllocations([])} />
      </div>}

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
              <div className="lv-dossier-unconnected-box lv-dossier-empty-state" role="status">
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
                      <th>{en ? 'Legal results and reasons' : 'Kết quả và lý do của Ban Pháp lý'}</th>
                      <th>{en ? 'Allocations' : 'Phân bổ'}</th>
                      <th>{en ? 'File' : 'Tệp'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dossier.versions.map((v) => (
                      <tr key={v.version}>
                        <td data-label={t.dossierVersionLabel}>
                          <span className="lv-version-pill">
                            {t.versionText} {v.version}
                          </span>
                        </td>
                        <td data-label={t.documentNumberLabel}>{v.documentNumber || '—'}</td>
                        <td data-label={t.issuerLabel}>{v.issuingAuthority || '—'}</td>
                        <td data-label={t.issuanceDateLabel}>{v.issueDate || '—'}</td>
                        <td data-label={t.forwardStatusLabel}>
                          <span className={`lv-forward-badge ${v.forwardStatus === 'FORWARDED' ? 'lv-forward-badge--forwarded' : 'lv-forward-badge--not-forwarded'}`}>
                            {v.forwardStatus === 'FORWARDED' ? t.forwardStatusForwarded : t.forwardStatusNotForwarded}
                          </span>
                        </td>
                        <td data-label={en ? 'Legal results and reasons' : 'Kết quả và lý do của Ban Pháp lý'}><BasisVersionOutcome version={v} en={en} /></td>
                        <td data-label={en ? 'Allocations' : 'Phân bổ'}>
                          {Array.isArray(v.allocations) && v.allocations.length > 0 ? (
                            <span className="lv-alloc-count-badge">
                              {v.allocations.length} {en ? 'items' : 'mục'}
                            </span>
                          ) : (
                            <span className="lv-alloc-count-empty">0</span>
                          )}
                        </td>
                        <td data-label={en ? 'File' : 'Tệp'}>
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


