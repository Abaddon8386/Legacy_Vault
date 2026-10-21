import { useState, useId, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  AlertTriangle,
  UserCheck,
  HelpCircle,
  RefreshCw,
  ArrowLeft,
} from 'lucide-react';
import {
  BENEFICIARY_CONFIRM_STATUS,
} from '../../utils/beneficiaryConfirmationValidation.js';
import {
  fetchBeneficiaryConfirmations,
  confirmBeneficiary,
} from './handoverSessionService.js';
import { beneficiaryConfirmationI18n } from './beneficiaryConfirmationI18n.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './BeneficiaryConfirmationPage.css';

const EMPTY_INITIAL_BENEFICIARIES = Object.freeze([]);

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
          setErrors({ fetch: err.message || t.informationUnavailable });
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
    fetchBeneficiaryConfirmations(caseReference, sessionId, {
      accessToken: effectiveAccessToken,
      isDevPreview: effectiveIsDevPreview,
      lang,
      signal: controller.signal,
    })
      .then((list) => {
        if (!controller.signal.aborted && activeCaseRef.current === caseReference) {
          lastFetchedKeyRef.current = currentKey;
          const normalized = (Array.isArray(list) ? list : []).map((b) => normalizeBeneficiaryItem(b, lang));
          setBeneficiaries(normalized);
          setLoadedCaseId(caseReference);
        }
      })
      .catch((err) => {
        if (!controller.signal.aborted && activeCaseRef.current === caseReference) {
          lastFetchedKeyRef.current = currentKey;
          setErrors({ fetch: err.message || t.informationUnavailable });
        }
      });

    return () => {
      controller.abort();
    };
  }, [caseReference, sessionId, propBeneficiaries, initialBeneficiaries, onFetchBeneficiaries, loadBeneficiaries, effectiveAccessToken, effectiveIsDevPreview, lang, t.informationUnavailable]);

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
    if (confirmationController.current || isSubmitting || !selectedBeneficiaryId) return;

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
      setActionError(err.message || (lang === 'en' ? 'Confirmation failed.' : 'Ghi nhận xác nhận thất bại.'));
    } finally {
      if (!controller.signal.aborted) { confirmationController.current = null; setIsSubmitting(false); }
    }
  };

  const hasValidData =
    Boolean(caseReference) &&
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
      <p role="note">{lang === 'en' ? 'Record the recipient’s in-person signature at the counter. Legal approval is completed beforehand.' : 'Ghi nhận người nhận ký trực tiếp tại quầy. Phân bổ phải được Legal duyệt trước.'}</p>
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
        caseItem={propCaseItem}
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
        <p className="lv-confirm-subtitle">{t.pageSubtitle}</p>
      </div>

      {/* Critical Business Rule Banner */}
      <section className="lv-confirm-notice-banner" role="alert" aria-labelledby="confirm-rule-heading">
        <UserCheck size={22} className="lv-confirm-notice-banner__icon" aria-hidden="true" />
        <div className="lv-confirm-notice-banner__body">
          <h2 id="confirm-rule-heading" className="lv-confirm-notice-banner__title">
            {t.noticeTitle}
          </h2>
          <p>{t.noticeBody}</p>
        </div>
      </section>

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

      {/* Beneficiaries Table Card */}
      <section className="lv-confirm-card" aria-labelledby="table-heading">
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
      <section className="lv-confirm-card" aria-labelledby="form-heading">
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
            {errors.fetch && (
              <div className="lv-confirm-error-msg" role="alert">
                <AlertTriangle size={13} aria-hidden="true" />
                <span>{errors.fetch}</span>
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
    </div>
  );
}
