import { useState, useId, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  HelpCircle,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import {
  BENEFICIARY_CONFIRM_STATUS,
} from '../../utils/beneficiaryConfirmationValidation.js';
import {
  fetchBeneficiaryConfirmations,
  fetchEligibleAssets,
  confirmBeneficiary,
} from './handoverSessionService.js';
import { beneficiaryConfirmationI18n } from './beneficiaryConfirmationI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './BeneficiaryConfirmationPage.css';
import { useStaffCaseMetadata } from '../../utils/useStaffCaseMetadata.js';
import { formatStaffSession } from '../../utils/caseReference.js';
import { listLiveSessions, fetchStaffCaseBeneficiaries } from './liveHandoverService.js';

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
  const caseInputId = useId();
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
  const displayCaseItem = useStaffCaseMetadata(caseReference, selectedCaseItem || propCaseItem, effectiveAccessToken, lang, effectiveIsDevPreview);
  const isReadOnlyCase = displayCaseItem?.status === 'CLOSED' || displayCaseItem?.vaultStatus === 'ARCHIVED';
  const [reloadRevision, setReloadRevision] = useState(0);
  const [sessionLoadError, setSessionLoadError] = useState('');
  useEffect(() => {
    if (sessionId || !caseReference || !effectiveAccessToken || effectiveIsDevPreview) return;
    const controller = new AbortController();
    listLiveSessions(caseReference, { accessToken: effectiveAccessToken, lang, signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setAvailableSessions(items); })
      .catch(error => {
        if (!controller.signal.aborted) {
          setSessionLoadError(lang === 'en' ? 'Unable to load handover sessions.' : 'Không tải được danh sách phiên bàn giao.');
          if (error.status === 401) onUnauthorized?.();
        }
      });
    return () => controller.abort();
  }, [sessionId, caseReference, effectiveAccessToken, effectiveIsDevPreview, lang, onUnauthorized]);
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
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  const activeCaseRef = useRef(initialCase);
  const lastFetchedKeyRef = useRef('');
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

    if (!caseReference || !sessionId || propBeneficiaries || (initialBeneficiaries && initialBeneficiaries.length > 0)) {
      return;
    }

    const currentKey = `${caseReference}::${sessionId}::${effectiveAccessToken || ''}`;
    if (lastFetchedKeyRef.current === currentKey) {
      return;
    }

    const controller = new AbortController();
    const options = {
      accessToken: effectiveAccessToken,
      isDevPreview: effectiveIsDevPreview,
      lang,
      signal: controller.signal,
    };
    Promise.all([
      fetchBeneficiaryConfirmations(caseReference, sessionId, options),
      effectiveIsDevPreview ? Promise.resolve([]) : fetchStaffCaseBeneficiaries(caseReference, options),
      effectiveIsDevPreview ? Promise.resolve([]) : fetchEligibleAssets(caseReference, sessionId, options),
    ])
      .then(([list, people, assets]) => {
        if (!controller.signal.aborted && activeCaseRef.current === caseReference) {
          lastFetchedKeyRef.current = currentKey;
          const normalized = (Array.isArray(list) ? list : []).map((b) => {
            const person = people.find(item => item.beneficiaryId === b.beneficiaryId);
            const allocated = assets.filter(item => item.recipientId === b.beneficiaryId);
            return normalizeBeneficiaryItem({ ...b,
              fullName: person?.fullName || b.fullName || b.beneficiaryName,
              relationship: person?.relationship || b.relationship,
              deliveryStatus: allocated.length > 0
                ? (allocated.every(item => item.deliveryStatus === 'DELIVERED') ? 'DELIVERED' : 'PENDING')
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
          lastFetchedKeyRef.current = '';
          setBeneficiaries([]);
          setLoadedCaseId('');
          setErrors({ fetch: confirmationErrorMessage(err, lang) });
          if (err.status === 401) onUnauthorized?.();
        }
      });

    return () => {
      controller.abort();
    };
  }, [caseReference, sessionId, propBeneficiaries, initialBeneficiaries, onFetchBeneficiaries, loadBeneficiaries, effectiveAccessToken, effectiveIsDevPreview, lang, isReadOnlyCase, reloadRevision, onUnauthorized]);

  const handleCaseChange = (newCase) => {
    confirmationController.current?.abort();
    confirmationController.current = null;
    setIsSubmitting(false);
    activeCaseRef.current = newCase;
    lastFetchedKeyRef.current = '';
    setCaseReference(newCase);
    setBeneficiaries([]);
    setLoadedCaseId('');
    setSelectedBeneficiaryId('');
    setReceiptReference('');
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
  };

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
    if (isReadOnlyCase || errors.fetch || confirmationController.current || isSubmitting || !selectedBeneficiaryId) return;

    setActionSuccess(null);
    setActionError(null);

    const trimmedReceipt = receiptReference.trim();
    if (!trimmedReceipt) {
      setErrors({ receiptReference: 'receiptRequired' });
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
      const confirmed = await confirmBeneficiary(caseReference, sessionId, selectedBeneficiaryId, {
        receiptReference: trimmedReceipt,
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
    !isReadOnlyCase && Boolean(caseReference) &&
    loadedCaseId === caseReference &&
    Array.isArray(beneficiaries) &&
    beneficiaries.length > 0;

  const selectedBenObj = beneficiaries.find(
    (b) => (b.id || b.beneficiaryId) === selectedBeneficiaryId
  );
  const isSelectedAlreadyConfirmed =
    selectedBenObj?.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED ||
    selectedBenObj?.status === 'CONFIRMED';
  const canSubmit = hasValidData &&
    selectedBeneficiaryId &&
    receiptReference.trim().length > 0 &&
    !isSelectedAlreadyConfirmed &&
    !isSubmitting;

  return (
    <div className="lv-beneficiary-confirmation-view">
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
          setSessionId(''); // Đổi hồ sơ xóa sessionId cũ
          setBeneficiaries([]);
          setLoadedCaseId('');
          setSelectedBeneficiaryId('');
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

      {/* Warning when context is missing in real mode */}
      {caseReference && !sessionId && !effectiveIsDevPreview && (
        <section className="lv-confirm-card">
          <label>{lang === 'en' ? 'Select handover session' : 'Chọn phiên bàn giao'}
            <select value="" onChange={event => {
              const selected = availableSessions.find(item => item.sessionId === event.target.value);
              if (!selected) return;
              setSessionId(selected.sessionId);
              const url = new URL(window.location.href);
              url.searchParams.set('caseId', caseReference);
              url.searchParams.set('sessionId', selected.sessionId);
              window.history.replaceState(window.history.state, '', url.pathname + url.search);
            }}>
              <option value="">{lang === 'en' ? 'Select a session' : '-- Chọn phiên đã bàn giao --'}</option>
              {availableSessions.map(item => <option key={item.sessionId} value={item.sessionId}>{formatStaffSession(item, lang)}</option>)}
            </select>
          </label>
          {sessionLoadError && <p role="alert">{sessionLoadError}</p>}
        </section>
      )}
      {(!caseReference || !sessionId) && !effectiveIsDevPreview && (
        <section className="lv-confirm-card" style={{ marginBottom: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: '#92400e' }}>
                {lang === 'en' ? 'No Handover Session Context' : 'Chưa có thông tin phiên bàn giao'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                {lang === 'en'
                  ? 'Please select a verification case and open a counter handover session to record beneficiary confirmations.'
                  : 'Vui lòng chọn hồ sơ xác minh và mở phiên bàn giao tại quầy từ Bàn làm việc Nhân viên để thực hiện xác nhận người thụ hưởng.'}
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
      <div className="lv-confirm-header">
        <h1 className="lv-confirm-title">{t.pageTitle}</h1>
      </div>

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

      {/* Case Selection Card */}
      <details className="lv-confirm-technical"><summary>{lang === 'en' ? 'Technical case reference' : 'Mã kỹ thuật hồ sơ'}</summary>
      <section className="lv-confirm-card" aria-labelledby="case-card-heading">
        <div className="lv-confirm-case-bar">
          <div className="lv-confirm-input-group">
            <label htmlFor={caseInputId} className="lv-confirm-label" id="case-card-heading">
              {t.caseSelectLabel}
            </label>
            <input
              id={caseInputId}
              type="text"
              className="lv-confirm-input"
              placeholder={t.caseSelectPlaceholder}
              value={caseReference}
              onChange={(e) => handleCaseChange(e.target.value)}
            />
          </div>
          <button
            type="button"
            className="lv-confirm-btn-select-case"
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
      {isReadOnlyCase && (
        <section className="lv-confirm-card" aria-labelledby="readonly-heading">
          <h2 id="readonly-heading" className="lv-confirm-card__title">
            {lang === 'en' ? 'Closed case — view history' : 'Hồ sơ đã đóng — chỉ xem lịch sử'}
          </h2>
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
      {!isReadOnlyCase && errors.fetch && (
        <section className="lv-confirm-card">
          <p className="lv-confirm-error-msg" role="alert"><AlertTriangle size={18} aria-hidden="true" />{errors.fetch}</p>
          <button type="button" className="lv-confirm-btn-select-case" onClick={() => {
            lastFetchedKeyRef.current = '';
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
                        <code>{b.receiptReference || t.informationUnavailable}</code>
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
      <section className="lv-confirm-card lv-staff-glow" aria-labelledby="form-heading">
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
            <label htmlFor={receiptInputId} className="lv-confirm-label lv-confirm-label--required">
              {t.receiptInputLabel}
            </label>
            <span className="lv-confirm-hint">{t.receiptInputHint}</span>
            <input
              id={receiptInputId}
              type="text"
              className="lv-confirm-input"
              placeholder={t.receiptInputPlaceholder}
              value={receiptReference}
              onChange={(e) => handleReceiptChange(e.target.value)}
              disabled={!hasValidData || isSubmitting || isSelectedAlreadyConfirmed}
            />
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

          <div className="lv-confirm-form-actions">
            <button
              type="submit"
              className="lv-btn-record-submit"
              disabled={!canSubmit}
              title={!canSubmit ? (!hasValidData ? t.informationUnavailable : t.unavailableNotice) : undefined}
              aria-label={t.btnRecordConfirmation}
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
                  <span>{t.btnRecordConfirmation}</span>
                </>
              )}
            </button>


          </div>
        </form>
      </section>
      </>}
    </div>
  );
}
