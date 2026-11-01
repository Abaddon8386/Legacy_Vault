import { signedReceiptFileError } from '../../utils/signedReceiptFile.js';
import { useState, useId, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  ArrowLeft,
  FolderOpen,
} from 'lucide-react';
import {
  BENEFICIARY_CONFIRM_STATUS,
} from '../../utils/beneficiaryConfirmationValidation.js';
import {
  fetchBeneficiaryConfirmations,
  fetchHandoverDeliveries,
  fetchEligibleAssets,
  fetchCompletionProgress,
  confirmBeneficiary,
  fetchHandoverReceipts,
  fetchHandoverSession,
} from './handoverSessionService.js';
import { beneficiaryConfirmationI18n } from './beneficiaryConfirmationI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './BeneficiaryConfirmationPage.css';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import SignedReceiptViewer from './SignedReceiptViewer.jsx';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';
import StaffWorkflowGuide from '../../components/staff/StaffWorkflowGuide.jsx';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import { formatStaffSession } from '../../utils/caseReference.js';
import { listLiveSessions, fetchStaffCaseBeneficiaries } from './liveHandoverService.js';
import { fetchStaffCases } from './staffCaseService.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (val) => typeof val === 'string' && UUID_REGEX.test(val);

const EMPTY_INITIAL_BENEFICIARIES = Object.freeze([]);

function confirmationErrorMessage(error, lang) {
  const en = lang === 'en';
  if (error.status === 404 || error.code === 'RESOURCE_NOT_FOUND') return en
    ? 'The case, session or recipient list is unavailable for your account. Check the selected case or retry.'
    : 'Không tải được hồ sơ, phiên hoặc danh sách người nhận trong phạm vi của bạn. Hãy kiểm tra hồ sơ đã chọn hoặc thử lại.';
  if (error.status === 403) return en ? 'You do not have permission to confirm this case.' : 'Bạn không có quyền ghi nhận xác nhận cho hồ sơ này.';
  if (error.status === 401) return en ? 'Your session has expired. Please sign in again.' : 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.';
  if (error.status === 409) return en ? 'The case or session does not currently allow confirmation. Check the handover status.' : 'Hồ sơ hoặc phiên chưa ở trạng thái cho phép xác nhận. Vui lòng kiểm tra trạng thái bàn giao.';
  if (error.message && !/^[A-Z][A-Z0-9_]+$/.test(error.message)) return error.message;
  return en ? 'Unable to load confirmation data. Please retry.' : 'Chưa tải được dữ liệu xác nhận. Vui lòng thử lại.';
}

function normalizeBeneficiaryItem(b, lang = 'vi') {
  if (!b) return null;
  const id = b.id || b.beneficiaryId || '';
  const statusRaw = String(b.confirmationStatus || b.status || '').toUpperCase();
  const isConfirmed = statusRaw === 'CONFIRMED';
  const isPending = statusRaw === 'PENDING';
  const confirmationStatus = isConfirmed
    ? BENEFICIARY_CONFIRM_STATUS.CONFIRMED
    : isPending
      ? BENEFICIARY_CONFIRM_STATUS.PENDING
      : (b.confirmationStatus || null);

  const rawName = b.fullName || b.beneficiaryName || b.name || '';
  const fallbackLabel = lang === 'en' ? 'Information not available' : 'Chưa có thông tin';
  const displayName = rawName.trim() ? rawName.trim() : fallbackLabel;

  return {
    ...b,
    id,
    beneficiaryId: id,
    fullName: displayName,
    rawName: rawName.trim(),
    confirmationStatus,
    status: isConfirmed ? 'CONFIRMED' : isPending ? 'PENDING' : b.status,
    deliveryStatus: b.deliveryStatus || null,
    receiptReference: b.receiptReference || b.confirmationReceipt || '',
    confirmedAt: b.confirmedAt || null,
  };
}

export default function BeneficiaryConfirmationPage(props) {
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const key = JSON.stringify([props.session?.user?.id, props.accessToken || props.session?.accessToken,
    props.caseId || props.caseReference || query.get('caseId'), props.sessionId || query.get('sessionId')]);
  return <BeneficiaryConfirmationPageContext key={key} {...props} />;
}
function BeneficiaryConfirmationPageContext({
  lang = 'vi',
  initialBeneficiaries = EMPTY_INITIAL_BENEFICIARIES,
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  caseReference: propCaseReference = '',
  caseItem: propCaseItem = null,
  beneficiaries: propBeneficiaries,
  onFetchBeneficiaries,
  loadBeneficiaries,
  accessToken = null,
  session = null,
  preview = false,
  isDevPreview = false,
  onCaseChange = null,
  onUnauthorized = null,
  onNavigateCases = null,
}) {
  const t = beneficiaryConfirmationI18n[lang] || beneficiaryConfirmationI18n.vi;
  const benSelectId = useId();
  const receiptInputId = useId();

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialCase = propCaseReference || propCaseId || searchParams?.get('caseId') || (effectiveIsDevPreview ? '6f1a4c2d-0000-4000-8000-000000000001' : '');
  const initialSession = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

  const [caseReference, setCaseReference] = useState(initialCase);
  const [sessionId, setSessionId] = useState(initialSession);
  const [availableSessions, setAvailableSessions] = useState([]);
  const [selectedCaseItem, setSelectedCaseItem] = useState(propCaseItem);
  const selectedSession = availableSessions.find(item => item.sessionId === sessionId);
  const isReadOnlySession = ['COMPLETED', 'CANCELLED'].includes(selectedSession?.status);
  const displayCaseItem = useStaffCaseMetadata(caseReference, selectedCaseItem || propCaseItem, effectiveAccessToken, lang, effectiveIsDevPreview);
  const caseUnassigned = displayCaseItem?.assignmentStatus === 'UNASSIGNED_CLAIMABLE';
  const isReadOnlyCase = displayCaseItem?.status === 'CLOSED' || displayCaseItem?.vaultStatus === 'ARCHIVED';
  const [closedHistory, setClosedHistory] = useState(null);
  const historyKey = `${caseReference}:${sessionId}:${effectiveAccessToken || ''}:${lang}`;
  useEffect(() => {
    if (!isReadOnlyCase || !caseReference || !sessionId || !effectiveAccessToken) return;
    const controller = new AbortController();
    const options = { accessToken: effectiveAccessToken, lang, signal: controller.signal };
    Promise.allSettled([
      fetchBeneficiaryConfirmations(caseReference, sessionId, options),
      fetchHandoverReceipts(caseReference, sessionId, options),
      fetchHandoverSession(caseReference, sessionId, options),
    ])
      .then(([confirmationsRes, receiptsRes, sessionRes]) => {
        if (controller.signal.aborted) return;
        if (confirmationsRes.status === 'rejected') {
          setClosedHistory({ key: historyKey, error: confirmationsRes.reason });
          return;
        }
        const items = confirmationsRes.value || [];
        const receipts = receiptsRes.status === 'fulfilled' && Array.isArray(receiptsRes.value) ? receiptsRes.value : [];
        const sessionData = sessionRes.status === 'fulfilled' && sessionRes.value ? sessionRes.value : null;

        // Ánh xạ tên người nhận chính xác theo beneficiaryId từ biên nhận
        const mappedItems = items.map((item) => {
          const matchingReceipt = receipts.find((r) => r.recipientId === item.beneficiaryId || r.beneficiaryId === item.beneficiaryId);
          return {
            ...item,
            beneficiaryName: item.beneficiaryName || matchingReceipt?.recipientName || matchingReceipt?.beneficiaryName || null,
          };
        });

        if (sessionData) {
          setAvailableSessions((prev) => {
            const exists = prev.some((s) => s.sessionId === sessionData.sessionId);
            return exists ? prev.map((s) => s.sessionId === sessionData.sessionId ? { ...s, ...sessionData } : s) : [...prev, sessionData];
          });
        }

        setClosedHistory({ key: historyKey, items: mappedItems, receipts, session: sessionData });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setClosedHistory({ key: historyKey, error });
      });
    return () => controller.abort();
  }, [isReadOnlyCase, caseReference, sessionId, effectiveAccessToken, lang, historyKey]);
  const [reloadRevision, setReloadRevision] = useState(0);
  const [sessionLoadError, setSessionLoadError] = useState('');
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [sessionRetryTrigger, setSessionRetryTrigger] = useState(0);
  const [resolvedCaseUuid, setResolvedCaseUuid] = useState(() => {
    if (isUuid(initialCase)) return initialCase;
    if (propCaseItem?.caseId && isUuid(propCaseItem.caseId)) return propCaseItem.caseId;
    return '';
  });

  const effectiveCaseId = isUuid(caseReference)
    ? caseReference
    : (resolvedCaseUuid || selectedCaseItem?.caseId || propCaseItem?.caseId || displayCaseItem?.caseId || '');

  const handleRetryLoadSessions = () => {
    setSessionRetryTrigger((prev) => prev + 1);
  };

  const [fetchedKey, setFetchedKey] = useState('');

  const handleSelectSession = (newSessionId) => {
    setSessionId(newSessionId);
    setBeneficiaries([]);
    setLoadedCaseId('');
    setSelectedBeneficiaryId('');
    setReceiptReference('');
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
    setFetchedKey('');

    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (caseReference) url.searchParams.set('caseId', caseReference);
      if (newSessionId) url.searchParams.set('sessionId', newSessionId);
      else url.searchParams.delete('sessionId');
      window.history.replaceState(window.history.state, '', url.pathname + url.search);
    }
  };

  useEffect(() => {
    if (
      sessionId || caseUnassigned ||
      !caseReference ||
      !effectiveAccessToken ||
      effectiveIsDevPreview ||
      onFetchBeneficiaries ||
      loadBeneficiaries
    ) {
      return;
    }

    const controller = new AbortController();

    async function loadSessionsForCase() {
      setIsLoadingSessions(true);
      setSessionLoadError('');
      try {
        let targetUuid = isUuid(caseReference)
          ? caseReference
          : (propCaseItem?.caseId && isUuid(propCaseItem.caseId)
              ? propCaseItem.caseId
              : (resolvedCaseUuid || ''));

        if (!targetUuid && caseReference.trim() && effectiveAccessToken) {
          try {
            const res = await fetchStaffCases({
              accessToken: effectiveAccessToken,
              lang,
              q: caseReference.trim(),
              size: 20,
              signal: controller.signal,
            });
            const found = res?.content?.find(
              (c) => c.caseNumber === caseReference.trim() || c.caseId === caseReference.trim()
            );
            if (found?.caseId && isUuid(found.caseId)) {
              targetUuid = found.caseId;
              setResolvedCaseUuid((prev) => (prev === found.caseId ? prev : found.caseId));
            }
          } catch {
            // Silent lookup fallback
          }
        }

        if (!targetUuid || !isUuid(targetUuid)) {
          if (!controller.signal.aborted) {
            setIsLoadingSessions(false);
            setAvailableSessions([]);
            setSessionLoadError(
              lang === 'en'
                ? 'Unable to resolve case ID. Please re-select the case.'
                : 'Chưa xác định được mã hồ sơ. Vui lòng chọn lại hồ sơ từ danh sách.'
            );
          }
          return;
        }

        const items = await listLiveSessions(targetUuid, {
          accessToken: effectiveAccessToken,
          lang,
          signal: controller.signal,
        });

        if (!controller.signal.aborted) {
          setAvailableSessions(Array.isArray(items) ? items : []);
          setSessionLoadError('');
          setIsLoadingSessions(false);
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          setAvailableSessions([]);
          setIsLoadingSessions(false);
          const msg = confirmationErrorMessage(error, lang);
          setSessionLoadError(msg || (lang === 'en' ? 'Unable to load handover sessions.' : 'Không tải được danh sách phiên bàn giao.'));
          if (error.status === 401) onUnauthorized?.();
        }
      }
    }

    loadSessionsForCase();

    return () => controller.abort();
  }, [
    sessionId,
    caseUnassigned,
    caseReference,
    propCaseItem?.caseId,
    resolvedCaseUuid,
    effectiveAccessToken,
    effectiveIsDevPreview,
    lang,
    onUnauthorized,
    sessionRetryTrigger,
    onFetchBeneficiaries,
    loadBeneficiaries,
  ]);
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [loadedCaseId, setLoadedCaseId] = useState(() => {
    if (initialCase && (propBeneficiaries || (initialBeneficiaries && initialBeneficiaries.length > 0))) {
      return initialCase;
    }
    return '';
  });
  const [beneficiaries, setBeneficiaries] = useState(() => {
    if (propBeneficiaries) return (Array.isArray(propBeneficiaries) ? propBeneficiaries : []).map(b => normalizeBeneficiaryItem(b, lang));
    if (initialCase && initialBeneficiaries && initialBeneficiaries.length > 0) return initialBeneficiaries.map(b => normalizeBeneficiaryItem(b, lang));
    return [];
  });
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const evidenceKey = `${caseReference}:${sessionId}:${selectedBeneficiaryId}:${effectiveAccessToken || ''}`;
  const [evidenceDraft, setEvidenceDraft] = useState(null);
  const signedFile = evidenceDraft?.key === evidenceKey ? evidenceDraft.file : null;
  const attested = evidenceDraft?.key === evidenceKey && evidenceDraft.attested === true;
  const setSignedFile = file => setEvidenceDraft({key:evidenceKey,file,attested:false});
  const setAttested = value => setEvidenceDraft(previous => ({key:evidenceKey,file:previous?.key===evidenceKey?previous.file:null,attested:value}));
  const [guideProgress, setGuideProgress] = useState(null);
  const progressKey = `${caseReference}:${sessionId}:${effectiveAccessToken || ''}`;
  useEffect(() => {
    if (isReadOnlyCase || !caseReference || !sessionId) return;
    const controller = new AbortController();
    fetchCompletionProgress(caseReference, sessionId, { accessToken: effectiveAccessToken, isDevPreview: effectiveIsDevPreview, lang, signal: controller.signal })
      .then(data => { if (!controller.signal.aborted) setGuideProgress({ key: progressKey, data }); })
      .catch(() => { if (!controller.signal.aborted) setGuideProgress({ key: progressKey, data: null }); });
    return () => controller.abort();
  }, [caseReference, sessionId, effectiveAccessToken, effectiveIsDevPreview, lang, progressKey, selectedBeneficiaryId, isReadOnlyCase]);
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [activeReceiptPreview, setActiveReceiptPreview] = useState(null);

  const activeCaseRef = useRef(initialCase);
  const confirmationController = useRef(null);
  useEffect(() => () => confirmationController.current?.abort(), []);

  const effectivePropCase = propCaseReference || propCaseId || '';
  const [prevPropCase, setPrevPropCase] = useState(effectivePropCase);
  const [prevPropBeneficiaries, setPrevPropBeneficiaries] = useState(propBeneficiaries);

  // Synchronize with external prop updates during render
  if (effectivePropCase !== prevPropCase) {
    setPrevPropCase(effectivePropCase);
    setPrevPropBeneficiaries(propBeneficiaries);
    setCaseReference(effectivePropCase);
    setSelectedCaseItem(propCaseItem);
    // Immediately reset all state from previous case A
    setSelectedBeneficiaryId('');
    setReceiptReference('');
    setErrors({});
    setActionSuccess(null);
    setActionError(null);

    if (propBeneficiaries) {
      setBeneficiaries((Array.isArray(propBeneficiaries) ? propBeneficiaries : []).map(b => normalizeBeneficiaryItem(b, lang)));
      setLoadedCaseId(effectivePropCase);
    } else if (initialBeneficiaries && initialBeneficiaries.length > 0 && effectivePropCase) {
      setBeneficiaries(initialBeneficiaries.map(b => normalizeBeneficiaryItem(b, lang)));
      setLoadedCaseId(effectivePropCase);
    } else {
      setBeneficiaries([]);
      setLoadedCaseId('');
    }
  } else if (propBeneficiaries !== prevPropBeneficiaries) {
    setPrevPropBeneficiaries(propBeneficiaries);
    if (propBeneficiaries && effectivePropCase) {
      setBeneficiaries((Array.isArray(propBeneficiaries) ? propBeneficiaries : []).map(b => normalizeBeneficiaryItem(b, lang)));
      setLoadedCaseId(effectivePropCase);
    } else if (!propBeneficiaries) {
      setBeneficiaries([]);
      setLoadedCaseId('');
    }
  }

  // Handle async fetching when prop case changes or backend session is available
  useEffect(() => {
    activeCaseRef.current = caseReference;
    if (isReadOnlyCase) return;
    const fetcher = onFetchBeneficiaries || loadBeneficiaries;
    if (fetcher && caseReference.trim()) {
      fetcher(caseReference.trim())
        .then((res) => {
          if (activeCaseRef.current !== caseReference) return;
          const list = Array.isArray(res) ? res : (res?.beneficiaries || []);
          setBeneficiaries(list.map((b) => normalizeBeneficiaryItem(b, lang)));
          setLoadedCaseId(caseReference);
        })
        .catch((err) => {
          if (activeCaseRef.current !== caseReference) return;
          setBeneficiaries([]);
          setLoadedCaseId('');
          setErrors({ fetch: confirmationErrorMessage(err, lang) });
        });
      return;
    }

    if (caseUnassigned || !caseReference || !sessionId || propBeneficiaries || (initialBeneficiaries && initialBeneficiaries.length > 0)) {
      return;
    }

    const effectiveTargetCase = isUuid(caseReference)
      ? caseReference
      : (effectiveCaseId || caseReference);

    const currentKey = `${effectiveTargetCase}::${sessionId}::${effectiveAccessToken || ''}`;
    if (fetchedKey === currentKey) {
      return;
    }

    const controller = new AbortController();
    const options = {
      accessToken: effectiveAccessToken,
      isDevPreview: effectiveIsDevPreview,
      lang,
      signal: controller.signal,
    };
    (async () => {
      const sessionData = effectiveIsDevPreview ? null : await fetchHandoverSession(effectiveTargetCase, sessionId, options);
      const openSession = sessionData?.status === 'OPEN';
      const [list, people, assets] = await Promise.all([
      fetchBeneficiaryConfirmations(effectiveTargetCase, sessionId, options),
      effectiveIsDevPreview ? Promise.resolve([]) : fetchStaffCaseBeneficiaries(effectiveTargetCase, options),
      effectiveIsDevPreview ? Promise.resolve([]) : openSession
        ? fetchEligibleAssets(effectiveTargetCase, sessionId, options)
        : fetchHandoverDeliveries(effectiveTargetCase, sessionId, options),
      ]);
      return {list, people, assets, sessionData, openSession};
    })()
      .then(({list, people, assets, sessionData, openSession}) => {
        if (!controller.signal.aborted && activeCaseRef.current === caseReference) {
          if (sessionData) setAvailableSessions(previous => [...previous.filter(item => item.sessionId !== sessionData.sessionId), sessionData]);
          setFetchedKey(currentKey);
          const normalized = (Array.isArray(list) ? list : []).map((b) => {
            const person = people.find(item => item.beneficiaryId === b.beneficiaryId);
            const allocated = assets.filter(item => item.recipientId === b.beneficiaryId);
            return normalizeBeneficiaryItem({ ...b,
              fullName: person?.fullName || b.fullName || b.beneficiaryName,
              relationship: person?.relationship || b.relationship,
              // Delivery history contains only delivered items, not the full allocation scope.
              deliveryStatus: openSession
                ? (allocated.length > 0 && allocated.every(item => item.deliveryStatus === 'DELIVERED') ? 'DELIVERED' : 'PENDING')
                : b.deliveryStatus,
            }, lang);
          });
          setErrors({});
          setBeneficiaries(normalized);
          setLoadedCaseId(caseReference);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && activeCaseRef.current === caseReference) {
          setFetchedKey('');
          setBeneficiaries([]);
          setLoadedCaseId('');
          setErrors({ fetch: confirmationErrorMessage(err, lang) });
          if (err.status === 401) onUnauthorized?.();
        }
      });

    return () => {
      controller.abort();
    };
  }, [caseReference, effectiveCaseId, sessionId, propBeneficiaries, initialBeneficiaries, onFetchBeneficiaries, loadBeneficiaries, effectiveAccessToken, effectiveIsDevPreview, lang, isReadOnlyCase, caseUnassigned, reloadRevision, onUnauthorized, fetchedKey]);

  const handleBeneficiarySelect = (benId) => {
    setSelectedBeneficiaryId(benId);
    setReceiptReference('');
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
  };

  const handleReceiptChange = (val) => {
    setReceiptReference(val);
    if (errors.receiptReference) {
      setErrors((prev) => {
        const next = { ...prev };
        delete next.receiptReference;
        return next;
      });
    }
  };


  // Submit xác nhận người thụ hưởng
  const handleSubmitConfirmation = async (e) => {
    e.preventDefault();
    if (caseUnassigned || isReadOnlyCase || isReadOnlySession || errors.fetch || confirmationController.current || isSubmitting || !selectedBeneficiaryId) return;

    setActionSuccess(null);
    setActionError(null);

    const trimmedReceipt = receiptReference.trim();
    if (!signedFile || !attested) {
      setActionError(lang === 'en' ? 'Attach the signed receipt and confirm the check.' : 'Đính kèm biên nhận đã ký và xác nhận đối chiếu.');
      return;
    }

    const selectedBen = beneficiaries.find(
      (b) => (b.id || b.beneficiaryId) === selectedBeneficiaryId
    );

    if (
      selectedBen &&
      (selectedBen.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED ||
        selectedBen.status === 'CONFIRMED')
    ) {
      setErrors({ currentStatus: 'alreadyConfirmed' });
      return;
    }

    setIsSubmitting(true);
    const controller = new AbortController();
    confirmationController.current = controller;
    try {
      const effectiveTargetCase = isUuid(caseReference)
        ? caseReference
        : (effectiveCaseId || caseReference);

      const confirmed = await confirmBeneficiary(effectiveTargetCase, sessionId, selectedBeneficiaryId, {
        receiptReference: trimmedReceipt, file: signedFile, attested,
      }, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
        signal: controller.signal,
      });
      if (controller.signal.aborted) return;

      // Cập nhật trạng thái người thụ hưởng sang CONFIRMED
      setBeneficiaries((prev) =>
        prev.map((b) => {
          const bId = b.id || b.beneficiaryId;
          if (bId === selectedBeneficiaryId) {
            return {
              ...b,
              confirmationId: confirmed.confirmationId,
              hasSignedFile: confirmed.hasSignedFile,
              confirmationStatus: BENEFICIARY_CONFIRM_STATUS.CONFIRMED,
              status: 'CONFIRMED',
              receiptReference: confirmed.receiptReference || trimmedReceipt,
              confirmedAt: confirmed.confirmedAt || new Date().toISOString(),
            };
          }
          return b;
        })
      );

      setActionSuccess(lang === 'en' ? 'Beneficiary confirmation successfully recorded.' : 'Đã ghi nhận xác nhận của Người thụ hưởng thành công.');
      setSelectedBeneficiaryId('');
      setReceiptReference('');
      setErrors({});
    } catch (err) {
      if (controller.signal.aborted) return;
      setActionError(confirmationErrorMessage(err, lang));
    } finally {
      if (!controller.signal.aborted) { confirmationController.current = null; setIsSubmitting(false); }
    }
  };

  const hasValidData =
    !caseUnassigned && !isReadOnlyCase && Boolean(caseReference) &&
    loadedCaseId === caseReference &&
    Array.isArray(beneficiaries) &&
    beneficiaries.length > 0;

  const selectedBenObj = beneficiaries.find(
    (b) => (b.id || b.beneficiaryId) === selectedBeneficiaryId
  );
  const isSelectedAlreadyConfirmed =
    selectedBenObj?.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED ||
    selectedBenObj?.status === 'CONFIRMED';
  const canSubmit = hasValidData && !isReadOnlySession &&
    selectedBeneficiaryId &&
    Boolean(signedFile) && attested &&
    !isSelectedAlreadyConfirmed &&
    !isSubmitting;
  const confirmationBlocked = isReadOnlyCase ? (lang === 'en' ? 'This case is read-only.' : 'Hồ sơ này chỉ được xem.')
    : !hasValidData ? (lang === 'en' ? 'Select a session and load the recipient data first.' : 'Chọn phiên và tải thông tin người nhận trước.')
      : !selectedBeneficiaryId ? (lang === 'en' ? 'Select the recipient who signed the receipt.' : 'Chọn người nhận đã ký nhận.')
        : isSelectedAlreadyConfirmed ? (lang === 'en' ? 'This recipient is already confirmed.' : 'Người nhận này đã được xác nhận.')
          : !signedFile ? (lang === 'en' ? 'Attach the signed receipt.' : 'Đính kèm biên nhận đã ký.') : !attested ? (lang === 'en' ? 'Confirm the signed receipt check.' : 'Xác nhận đã đối chiếu biên nhận có chữ ký.')
            : isSubmitting ? (lang === 'en' ? 'Wait for confirmation to finish.' : 'Chờ ghi nhận hoàn tất.') : '';

  return (
    <div className="lv-beneficiary-confirmation-view">
      {/* Page Title at Top */}
      <div className="lv-confirm-header" style={{ marginBottom: '14px' }}>
        <h1 className="lv-confirm-title">{t.pageTitle}</h1>
      </div>

      <StaffWorkflowGuide current="confirmation" caseId={caseReference} sessionId={sessionId} lang={lang} preview={effectiveIsDevPreview && !effectiveAccessToken}
        assets={guideProgress?.key === progressKey ? (guideProgress.data?.assets || guideProgress.data?.assetCompletion) : null}
        beneficiaries={guideProgress?.key === progressKey ? (guideProgress.data?.beneficiaries || guideProgress.data?.beneficiaryCompletion) : null}
        caseStatus={displayCaseItem?.status} vaultStatus={displayCaseItem?.vaultStatus} confirmationReady={hasValidData} loading={isLoadingSessions} error={sessionLoadError} />
      {/* Context navigation back */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {caseReference && sessionId && (
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId)}${effectiveIsDevPreview ? '&preview=true' : ''}`}
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

      {/* Staff Case Context Bar */}
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
          setSelectedCaseItem(item);
          setCaseReference(newId);
          setResolvedCaseUuid(item.caseId || '');
          setSessionId(''); // Đổi hồ sơ xóa sessionId cũ
          setAvailableSessions([]);
          setSessionLoadError('');
          setIsLoadingSessions(false);
          setBeneficiaries([]);
          setLoadedCaseId('');
          setSelectedBeneficiaryId('');
          setReceiptReference('');
          setErrors({});
          setActionSuccess(null);
          setActionError(null);
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

      {/* State 1: Chưa chọn hồ sơ */}
      {!caseReference && !effectiveIsDevPreview && (
        <section className="lv-confirm-card lv-confirm-state-card" role="region" aria-label="Chưa chọn hồ sơ">
          <div className="lv-confirm-state-content">
            <FolderOpen size={24} className="lv-confirm-state-icon lv-confirm-state-icon--warning" aria-hidden="true" />
            <div>
              <h3 className="lv-confirm-state-title">
                {lang === 'en' ? 'No verification case selected' : 'Chưa chọn hồ sơ xác minh'}
              </h3>
              <p className="lv-confirm-state-desc">
                {lang === 'en'
                  ? 'Please select a verification case to view handover sessions and record beneficiary confirmations.'
                  : 'Vui lòng chọn hồ sơ xác minh để xem danh sách phiên bàn giao và thực hiện xác nhận người thụ hưởng.'}
              </p>
              <div className="lv-confirm-state-actions">
                <button
                  type="button"
                  className="lv-btn lv-btn-primary"
                  onClick={() => setIsSelectorOpen(true)}
                >
                  {lang === 'en' ? 'Select Verification Case' : 'Chọn hồ sơ xác minh'}
                </button>
                {onNavigateCases && (
                  <button
                    type="button"
                    className="lv-btn lv-btn-secondary"
                    onClick={onNavigateCases}
                  >
                    {lang === 'en' ? 'Back to Cases Queue' : 'Về danh sách ca xác minh'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* State 2: Đang tải danh sách phiên */}
      {caseUnassigned && <section className="lv-confirm-card" role="status"><h2 className="lv-confirm-card__title">{lang === 'en' ? 'This case has not been claimed' : 'Hồ sơ chưa được nhận xử lý'}</h2><p>{lang === 'en' ? 'Claim this case from the case queue before opening a handover session.' : 'Staff cần nhận xử lý hồ sơ trong danh sách ca xác minh trước khi mở phiên bàn giao.'}</p><a className="lv-confirm-btn-select-case" href={`/staff/cases?caseId=${encodeURIComponent(caseReference)}`}>{lang === 'en' ? 'Open case queue' : 'Đến hồ sơ để nhận xử lý'}</a></section>}
      {caseReference && !caseUnassigned && !sessionId && isLoadingSessions && !effectiveIsDevPreview && (
        <section className="lv-confirm-card lv-confirm-state-card" aria-busy="true" aria-live="polite">
          <div className="lv-confirm-state-content">
            <RefreshCw size={22} className="lv-confirm-state-spinner" aria-hidden="true" />
            <div>
              <h3 className="lv-confirm-state-title">
                {lang === 'en' ? 'Loading handover sessions…' : 'Đang tải danh sách phiên bàn giao…'}
              </h3>
              <p className="lv-confirm-state-desc">
                {lang === 'en'
                  ? 'Fetching available counter handover sessions for the selected case.'
                  : 'Đang lấy danh sách các phiên bàn giao tại quầy cho hồ sơ đã chọn.'}
              </p>
            </div>
          </div>
        </section>
      )}

      {/* State 3: Tải phiên thất bại (có nguyên nhân và nút thử lại) */}
      {caseReference && !caseUnassigned && !sessionId && !isLoadingSessions && sessionLoadError && !effectiveIsDevPreview && (
        <section className="lv-confirm-card lv-confirm-state-card lv-confirm-state-card--error" role="alert">
          <div className="lv-confirm-state-content">
            <AlertTriangle size={24} className="lv-confirm-state-icon lv-confirm-state-icon--error" aria-hidden="true" />
            <div>
              <h3 className="lv-confirm-state-title">
                {lang === 'en' ? 'Unable to load handover sessions' : 'Không tải được danh sách phiên bàn giao'}
              </h3>
              <p className="lv-confirm-state-desc">{sessionLoadError}</p>
              <div className="lv-confirm-state-actions">
                <button
                  type="button"
                  className="lv-btn lv-btn-primary"
                  onClick={handleRetryLoadSessions}
                >
                  <RefreshCw size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
                  {lang === 'en' ? 'Retry' : 'Thử lại'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* State 4: Tải thành công nhưng không có phiên phù hợp */}
      {caseReference && !caseUnassigned && !sessionId && !isLoadingSessions && !sessionLoadError && availableSessions.length === 0 && !effectiveIsDevPreview && (
        <section className="lv-confirm-card lv-confirm-state-card lv-confirm-state-card--warning" role="region">
          <div className="lv-confirm-state-content">
            <HelpCircle size={24} className="lv-confirm-state-icon lv-confirm-state-icon--warning" aria-hidden="true" />
            <div>
              <h3 className="lv-confirm-state-title">
                {lang === 'en' ? 'No Handover Session Available' : 'Chưa có phiên bàn giao phù hợp'}
              </h3>
              <p className="lv-confirm-state-desc">
                {lang === 'en'
                  ? 'This case does not have an active counter handover session to record beneficiary confirmations. Please open a counter handover session first.'
                  : 'Hồ sơ này chưa có phiên bàn giao mở tại quầy để ghi nhận người nhận. Vui lòng mở phiên bàn giao tại quầy trước.'}
              </p>
              <div className="lv-confirm-state-actions">
                <a
                  href={`/staff/handover?caseId=${encodeURIComponent(caseReference)}`}
                  className="lv-btn lv-btn-primary"
                  onClick={(e) => {
                    if (typeof window !== 'undefined' && window.__LV_NAVIGATE__) {
                      e.preventDefault();
                      window.__LV_NAVIGATE__(`/staff/handover?caseId=${encodeURIComponent(caseReference)}`);
                    }
                  }}
                >
                  {lang === 'en' ? 'Open Counter Handover' : 'Mở phiên bàn giao tại quầy'}
                </a>
                <button
                  type="button"
                  className="lv-btn lv-btn-secondary"
                  onClick={handleRetryLoadSessions}
                >
                  <RefreshCw size={14} aria-hidden="true" style={{ marginRight: '6px' }} />
                  {lang === 'en' ? 'Check Sessions Again' : 'Kiểm tra lại phiên'}
                </button>
              </div>
            </div>
          </div>
        </section>
      )}

      {/* State 5: Có phiên nhưng chưa chọn */}
      {caseReference && !sessionId && !isLoadingSessions && !sessionLoadError && availableSessions.length > 0 && !effectiveIsDevPreview && (
        <section className="lv-confirm-card lv-confirm-session-picker-card">
          <div className="lv-confirm-input-group">
            <label htmlFor="lv-confirm-session-select" className="lv-confirm-label">
              {lang === 'en' ? 'Select handover session *' : 'Chọn phiên bàn giao *'}
            </label>
            <div className="lv-confirm-session-select-row">
              <select
                id="lv-confirm-session-select"
                className="lv-confirm-select"
                value=""
                onChange={(event) => handleSelectSession(event.target.value)}
              >
                <option value="">{lang === 'en' ? '-- Select a handover session --' : '-- Chọn phiên đã bàn giao --'}</option>
                {availableSessions.map((item) => (
                  <option key={item.sessionId} value={item.sessionId}>
                    {formatStaffSession(item, lang)}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </section>
      )}

      {/* State 6 Header bar: Đã chọn phiên */}
      {caseReference && sessionId && !effectiveIsDevPreview && (
        <div className="lv-confirm-active-session-strip">
          <div className="lv-confirm-active-session-info">
            <span className="lv-confirm-active-session-label">
              {lang === 'en' ? 'Active Handover Session:' : 'Phiên bàn giao đang chọn:'}
            </span>
            <strong className="lv-confirm-active-session-id">
              {formatStaffSession(
                availableSessions.find((s) => s.sessionId === sessionId) || { sessionId },
                lang
              )}
            </strong>
          </div>
          <button
            type="button"
            className="lv-btn lv-btn-secondary lv-btn-sm"
            onClick={() => handleSelectSession('')}
          >
            {lang === 'en' ? 'Change session' : 'Đổi phiên'}
          </button>
        </div>
      )}



      {/* Feedback Banners */}
      {actionSuccess && (
        <div className="lv-api-status-banner lv-api-status-banner--success" role="status" style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
          <CheckCircle2 size={16} aria-hidden="true" style={{ display: 'inline', marginRight: '8px' }} />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="lv-api-status-banner lv-api-status-banner--error" role="alert" style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '12px 16px', borderRadius: '8px', marginBottom: '16px' }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ display: 'inline', marginRight: '8px' }} />
          <span>{actionError}</span>
        </div>
      )}

      {isReadOnlyCase && (
        <section className="lv-confirm-card lv-confirm-history-card" aria-labelledby="readonly-heading">
          <h2 id="readonly-heading" className="lv-confirm-card__title">
            {lang === 'en' ? 'Closed case — view history' : 'Hồ sơ đã đóng — chỉ xem lịch sử'}
          </h2>
            {closedHistory?.key === historyKey && closedHistory.error && <p role="alert">{confirmationErrorMessage(closedHistory.error, lang)}</p>}
            {closedHistory?.key === historyKey && closedHistory.items && <ul aria-label={lang === 'en' ? 'Confirmation history' : 'Lịch sử xác nhận'} className="lv-confirm-history-list" style={{ listStyle: 'none', padding: 0, margin: '14px 0' }}>
              {closedHistory.items.map((item, index) => {
                const displayName = item.beneficiaryName || `${lang === 'en' ? 'Recipient' : 'Người nhận'} (${index + 1})`;
                const isConfirmed = item.status === 'CONFIRMED' || item.confirmationStatus === 'CONFIRMED';
                return (
                  <li key={item.beneficiaryId || index} style={{ margin: '8px 0', padding: '10px 14px', background: '#f8faf7', borderRadius: '8px', border: '1px solid #e2e8e2' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '8px' }}>
                      <strong style={{ color: '#164639' }}>{displayName}</strong>
                      <span className={`lv-confirm-status-badge ${isConfirmed ? 'lv-confirm-status-badge--confirmed' : 'lv-confirm-status-badge--pending'}`}>
                        {isConfirmed ? (lang === 'en' ? 'Confirmed' : 'Đã xác nhận') : (lang === 'en' ? 'Pending' : 'Chưa xác nhận')}
                      </span>
                    </div>
                    {item.hasSignedFile && item.confirmationId && <SignedReceiptViewer caseId={caseReference} sessionId={sessionId} confirmationId={item.confirmationId} accessToken={effectiveAccessToken} lang={lang} onUnauthorized={onUnauthorized} onViewReceipt={setActiveReceiptPreview} />}
                  </li>
                );
              })}
            </ul>}
          <p>{lang === 'en' ? 'New confirmations cannot be recorded after the case is closed or the vault is archived.' : 'Không thể ghi nhận xác nhận mới khi hồ sơ đã đóng hoặc kho đã lưu trữ.'}</p>
          <div className="lv-confirm-form-actions">
            <a className="lv-confirm-btn-select-case" href={`/staff/close-and-archive?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId || '')}`}>
              {lang === 'en' ? 'View case history' : 'Xem lịch sử hồ sơ'}
            </a>
            <button type="button" className="lv-confirm-btn-select-case" onClick={() => setIsSelectorOpen(true)}>
              {lang === 'en' ? 'Choose an open case' : 'Chọn hồ sơ đang mở'}
            </button>
          </div>
        </section>
      )}
      {!isReadOnlyCase && !caseUnassigned && errors.fetch && (
        <section className="lv-confirm-card">
          <p className="lv-confirm-error-msg" role="alert"><AlertTriangle size={18} aria-hidden="true" />{errors.fetch}</p>
          <button type="button" className="lv-confirm-btn-select-case" onClick={() => {
            setFetchedKey('');
            setErrors({});
            setReloadRevision((revision) => revision + 1);
          }}>{lang === 'en' ? 'Retry' : 'Thử lại'}</button>
        </section>
      )}
      {!isReadOnlyCase && !errors.fetch && <>
      {/* Beneficiaries Table Card */}
      <section className="lv-confirm-card lv-staff-glow" aria-labelledby="table-heading">
        <div className="lv-confirm-card__header">
          <h2 id="table-heading" className="lv-confirm-card__title">
            {t.cardTitle}
          </h2>
        </div>

        <div className="lv-confirm-table-wrapper">
          <table className="lv-confirm-table">
            <thead>
              <tr>
                <th>{t.tableColBeneficiary}</th>
                <th>{t.tableColRelationship}</th>
                <th>{t.tableColDeliveryStatus}</th>
                <th>{t.tableColConfirmStatus}</th>
                <th>{t.tableColReceipt}</th>
              </tr>
            </thead>
            <tbody>
              {!hasValidData ? (
                <tr>
                  <td colSpan="5">
                    <div className="lv-confirm-empty" role="status">
                      <p>{t.informationUnavailable}</p>
                    </div>
                  </td>
                </tr>
              ) : (
                beneficiaries.map((b) => {
                  const isConfirmed = b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED;
                  const isPending = b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.PENDING;
                  const isDelivered = b.deliveryStatus === 'DELIVERED';
                  const isDeliveryPending = b.deliveryStatus === 'PENDING';

                  return (
                    <tr key={b.id || b.beneficiaryId}>
                      <td>
                        <strong>{b.fullName || b.beneficiaryName || b.name || t.informationUnavailable}</strong>
                      </td>
                      <td>{b.relationship || t.informationUnavailable}</td>
                      <td>
                        <span className="lv-confirm-delivery-tag">
                          {isDelivered
                            ? t.deliveryDelivered
                            : isDeliveryPending
                              ? t.deliveryPending
                              : (b.confirmationStatus === 'CONFIRMED' ? t.deliveryDelivered : t.informationUnavailable)}
                        </span>
                      </td>
                      <td>
                        {isConfirmed ? (
                          <span className="lv-confirm-status-pill lv-confirm-status-pill--confirmed">
                            <CheckCircle2 size={12} aria-hidden="true" />
                            <span>{t.statusConfirmed}</span>
                          </span>
                        ) : isPending ? (
                          <span className="lv-confirm-status-pill lv-confirm-status-pill--pending">
                            <Clock size={12} aria-hidden="true" />
                            <span>{t.statusPending}</span>
                          </span>
                        ) : (
                          <span className="lv-confirm-status-pill lv-confirm-status-pill--unknown">
                            <HelpCircle size={12} aria-hidden="true" />
                            <span>{t.informationUnavailable}</span>
                          </span>
                        )}
                      </td>
                      <td>
                        {b.receiptReference ? (
                          <><code className="lv-confirm-receipt-code">{b.receiptReference}</code>
                          {b.hasSignedFile && b.confirmationId ? <SignedReceiptViewer key={`${caseReference}:${sessionId}:${effectiveAccessToken}:${b.confirmationId}`} caseId={caseReference} sessionId={sessionId} confirmationId={b.confirmationId} accessToken={effectiveAccessToken} lang={lang} onUnauthorized={onUnauthorized} onViewReceipt={setActiveReceiptPreview} />
                            : <small>{lang === 'en' ? 'Legacy record: no signed attachment' : 'Bản ghi cũ: chưa có tệp ký nhận'}</small>}</>
                        ) : (
                          <span className="lv-confirm-empty-cell">{t.informationUnavailable}</span>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Staff Record Confirmation Form */}
      {!isReadOnlySession && <section className="lv-confirm-card lv-staff-glow" aria-labelledby="form-heading">
        <div className="lv-confirm-card__header">
          <h2 id="form-heading" className="lv-confirm-card__title">
            {t.formHeading}
          </h2>
        </div>

        <form onSubmit={handleSubmitConfirmation} noValidate>
          <div className="lv-confirm-input-group" style={{ marginBottom: 16 }}>
            <label htmlFor={benSelectId} className="lv-confirm-label lv-confirm-label--required">
              {t.beneficiarySelectLabel}
            </label>
            <select
              id={benSelectId}
              className="lv-confirm-select"
              value={selectedBeneficiaryId}
              onChange={(e) => handleBeneficiarySelect(e.target.value)}
              disabled={!hasValidData || isSubmitting}
            >
              <option value="">{t.beneficiarySelectPlaceholder}</option>
              {hasValidData &&
                beneficiaries.map((b) => {
                  const bId = b.id || b.beneficiaryId;
                  const bName = b.fullName || b.beneficiaryName || b.name || t.informationUnavailable;
                  const isConfirmed =
                    b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED ||
                    b.status === 'CONFIRMED';
                  const isPending =
                    b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.PENDING ||
                    b.status === 'PENDING';
                  const statusLabel = isConfirmed
                    ? t.statusConfirmed
                    : isPending
                      ? t.statusPending
                      : t.statusUnknown;
                  return (
                    <option key={bId} value={bId}>
                      {bName} ({statusLabel})
                    </option>
                  );
                })}
            </select>
            {errors.beneficiaryId && (
              <div className="lv-confirm-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.beneficiaryId] || errors.beneficiaryId}</span>
              </div>
            )}
          </div>

          <div className="lv-confirm-input-group" style={{ marginBottom: 16 }}>
            <label htmlFor={receiptInputId} className="lv-confirm-label lv-confirm-label--required">{lang === 'en' ? 'Signed receipt' : 'Biên nhận đã ký'}</label>
            <span className="lv-confirm-hint">{lang === 'en' ? 'Upload the full signed receipt (PDF, JPEG or PNG, up to 10 MB). A receipt number is generated when saved.' : 'Tải toàn bộ biên nhận có chữ ký (PDF, JPEG hoặc PNG, tối đa 10 MB). Hệ thống tự tạo mã khi lưu.'}</span>
            <input className="lv-confirm-signed-file" key={`${caseReference}:${sessionId}:${selectedBeneficiaryId}`} id={receiptInputId} type="file" accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/jpg,image/png" disabled={!hasValidData || !selectedBeneficiaryId || isSubmitting || isSelectedAlreadyConfirmed}
              onChange={e => {
                const file=e.target.files?.[0]; setAttested(false);
                const fileError = signedReceiptFileError(file);
                if (fileError) {
                  setSignedFile(null); setActionError(fileError === 'empty' ? (lang === 'en' ? 'The receipt file is empty.' : 'Tệp biên nhận không có nội dung.') : fileError === 'size' ? (lang === 'en' ? 'The receipt must not exceed 10 MB.' : 'Biên nhận không được vượt quá 10 MB.') : (lang === 'en' ? 'Use PDF, JPEG or PNG. Export HEIC/WebP images to JPEG or PNG first.' : 'Chỉ hỗ trợ PDF, JPEG hoặc PNG. Ảnh HEIC/WebP cần xuất sang JPEG hoặc PNG trước.')); e.target.value=''; return;
                }
                setSignedFile(file || null); setActionError(null);
              }} />
            <details><summary>{lang === 'en' ? 'Paper receipt number (optional)' : 'Số trên giấy biên nhận (tùy chọn)'}</summary>
              <input aria-label={lang === 'en' ? 'Paper receipt number' : 'Số trên giấy biên nhận'} className="lv-confirm-input" value={receiptReference} maxLength={200} onChange={e => handleReceiptChange(e.target.value)} disabled={!hasValidData || isSubmitting || isSelectedAlreadyConfirmed} />
            </details>
            <label className="lv-confirm-signed-check"><input type="checkbox" checked={attested} disabled={!signedFile || isSubmitting || isSelectedAlreadyConfirmed} onChange={e => setAttested(e.target.checked)} />{lang === 'en' ? 'I checked the receipt and the recipient has signed.' : 'Tôi đã đối chiếu biên nhận và người nhận đã ký.'}</label>
            {errors.receiptReference && (
              <div className="lv-confirm-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.receiptReference] || errors.receiptReference}</span>
              </div>
            )}
            {errors.currentStatus && (
              <div className="lv-confirm-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{t[errors.currentStatus] || errors.currentStatus}</span>
              </div>
            )}
          </div>

          <WorkflowActionHint id="confirmation-action-blocked" reason={confirmationBlocked} />
          <div className="lv-confirm-form-actions">
            <button
              type="submit"
              aria-describedby={confirmationBlocked ? 'confirmation-action-blocked' : undefined}
              className="lv-btn-record-submit"
              disabled={!canSubmit}
              title={!canSubmit ? (!hasValidData ? t.informationUnavailable : t.unavailableNotice) : undefined}
              aria-label={lang === 'en' ? 'Confirm asset receipt' : 'Xác nhận đã nhận tài sản'}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '10px 20px',
                borderRadius: '8px',
                fontWeight: 600,
                fontSize: '14px',
                backgroundColor: canSubmit ? '#164639' : '#e2e8f0',
                color: canSubmit ? '#ffffff' : '#94a3b8',
                border: 'none',
                cursor: canSubmit ? 'pointer' : 'not-allowed',
                transition: 'all 0.2s ease',
              }}
            >
              {isSubmitting ? (
                <>
                  <RefreshCw size={15} className="lv-spin" aria-hidden="true" />
                  <span>{lang === 'en' ? 'Recording...' : 'Đang ghi nhận...'}</span>
                </>
              ) : (
                <>
                  <FileCheck size={16} aria-hidden="true" />
                  <span>{lang === 'en' ? 'Confirm asset receipt' : 'Xác nhận đã nhận tài sản'}</span>
                </>
              )}
            </button>


          </div>
        </form>
      </section>}
      {isReadOnlySession && <section className="lv-confirm-card" role="status"><h2 className="lv-confirm-card__title">{lang === 'en' ? 'This handover session has ended' : 'Phiên bàn giao đã kết thúc'}</h2><p>{lang === 'en' ? 'Receipt records remain available above. New confirmations cannot be added to this session.' : 'Bạn có thể xem ký nhận đã ghi ở trên. Phiên này không nhận thêm xác nhận mới.'}</p><a className="lv-confirm-btn-select-case" href={`/staff/close-and-archive?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId)}`}>{lang === 'en' ? 'View case completion' : 'Xem hoàn tất hồ sơ'}</a></section>}
      </>}
      {/* Global Root Receipt Preview Modal - Escapes card stacking contexts */}
      {activeReceiptPreview && (
        <EvidencePreviewModal
          isOpen={true}
          blobUrl={activeReceiptPreview.blobUrl}
          contentType={activeReceiptPreview.contentType}
          fileName={activeReceiptPreview.fileName || 'signed-receipt'}
          lang={lang}
          onClose={() => {
            if (activeReceiptPreview.blobUrl) {
              URL.revokeObjectURL(activeReceiptPreview.blobUrl);
            }
            setActiveReceiptPreview(null);
          }}
        />
      )}
    </div>
  );
}
