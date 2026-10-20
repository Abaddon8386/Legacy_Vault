import { useState, useId, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  RotateCcw,
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
import './BeneficiaryConfirmationPage.css';

export default function BeneficiaryConfirmationPage({
  lang = 'vi',
  initialBeneficiaries = [],
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  caseReference: propCaseReference = '',
  beneficiaries: propBeneficiaries,
  onFetchBeneficiaries,
  loadBeneficiaries,
  accessToken = null,
  isDevPreview = false,
}) {
  const t = beneficiaryConfirmationI18n[lang] || beneficiaryConfirmationI18n.vi;
  const caseInputId = useId();
  const benSelectId = useId();
  const receiptInputId = useId();

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialCase = propCaseReference || propCaseId || searchParams?.get('caseId') || '';
  const initialSession = propSessionId || searchParams?.get('sessionId') || '';

  const [caseReference, setCaseReference] = useState(initialCase);
  const [sessionId, setSessionId] = useState(initialSession);
  const [loadedCaseId, setLoadedCaseId] = useState(() => {
    if (initialCase && (propBeneficiaries || (initialBeneficiaries && initialBeneficiaries.length > 0))) {
      return initialCase;
    }
    return '';
  });
  const [beneficiaries, setBeneficiaries] = useState(() => {
    if (propBeneficiaries) return Array.isArray(propBeneficiaries) ? propBeneficiaries : [];
    if (initialCase && initialBeneficiaries && initialBeneficiaries.length > 0) return initialBeneficiaries;
    return [];
  });
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  const activeCaseRef = useRef(initialCase);

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
      setBeneficiaries(Array.isArray(propBeneficiaries) ? propBeneficiaries : []);
      setLoadedCaseId(effectivePropCase);
    } else if (initialBeneficiaries && initialBeneficiaries.length > 0 && effectivePropCase) {
      setBeneficiaries(initialBeneficiaries);
      setLoadedCaseId(effectivePropCase);
    } else {
      setBeneficiaries([]);
      setLoadedCaseId('');
    }
  } else if (propBeneficiaries !== prevPropBeneficiaries) {
    setPrevPropBeneficiaries(propBeneficiaries);
    if (propBeneficiaries && effectivePropCase) {
      setBeneficiaries(Array.isArray(propBeneficiaries) ? propBeneficiaries : []);
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
          setBeneficiaries(list);
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

    let active = true;
    fetchBeneficiaryConfirmations(caseReference, sessionId, {
      accessToken,
      isDevPreview,
      lang,
    })
      .then((list) => {
        if (active && activeCaseRef.current === caseReference) {
          setBeneficiaries(list);
          setLoadedCaseId(caseReference);
        }
      })
      .catch((err) => {
        if (active && activeCaseRef.current === caseReference) {
          setErrors({ fetch: err.message || t.informationUnavailable });
        }
      });

    return () => {
      active = false;
    };
  }, [caseReference, sessionId, propBeneficiaries, initialBeneficiaries, onFetchBeneficiaries, loadBeneficiaries, accessToken, isDevPreview, lang, t.informationUnavailable]);

  const handleCaseChange = (newCase) => {
    activeCaseRef.current = newCase;
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

  const handleReset = () => {
    activeCaseRef.current = '';
    setCaseReference('');
    setSessionId('');
    setBeneficiaries([]);
    setLoadedCaseId('');
    setSelectedBeneficiaryId('');
    setReceiptReference('');
    setErrors({});
    setActionSuccess(null);
    setActionError(null);
  };

  // Submit xác nhận người thụ hưởng
  const handleSubmitConfirmation = async (e) => {
    e.preventDefault();
    if (isSubmitting || !selectedBeneficiaryId) return;

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

    if (selectedBen && selectedBen.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED) {
      setErrors({ currentStatus: 'alreadyConfirmed' });
      return;
    }

    setIsSubmitting(true);
    try {
      const confirmed = await confirmBeneficiary(caseReference, sessionId, selectedBeneficiaryId, {
        receiptReference: trimmedReceipt,
      }, {
        accessToken,
        isDevPreview,
        lang,
      });

      // Cập nhật trạng thái người thụ hưởng sang CONFIRMED
      setBeneficiaries((prev) =>
        prev.map((b) => {
          const bId = b.id || b.beneficiaryId;
          if (bId === selectedBeneficiaryId) {
            return {
              ...b,
              confirmationStatus: BENEFICIARY_CONFIRM_STATUS.CONFIRMED,
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
      setActionError(err.message || (lang === 'en' ? 'Confirmation failed.' : 'Ghi nhận xác nhận thất bại.'));
    } finally {
      setIsSubmitting(false);
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
  const isSelectedAlreadyConfirmed = selectedBenObj?.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED;
  const canSubmit = hasValidData &&
    selectedBeneficiaryId &&
    receiptReference.trim().length > 0 &&
    !isSelectedAlreadyConfirmed &&
    !isSubmitting;

  return (
    <div className="lv-beneficiary-confirmation-view">
      {/* Context navigation back */}
      {caseReference && sessionId && (
        <div style={{ marginBottom: '12px' }}>
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(caseReference)}&sessionId=${encodeURIComponent(sessionId)}`}
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
        </div>
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
            className="lv-confirm-btn-reset"
            onClick={handleReset}
          >
            <RotateCcw size={14} aria-hidden="true" />
            <span>{t.btnResetForm}</span>
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
                  const bName = b.fullName || b.beneficiaryName || b.name;
                  const statusLabel =
                    b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED
                      ? t.statusConfirmed
                      : b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.PENDING
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

            <button
              type="button"
              className="lv-confirm-btn-reset"
              onClick={() => {
                setSelectedBeneficiaryId('');
                setReceiptReference('');
                setErrors({});
              }}
              disabled={isSubmitting}
            >
              <RotateCcw size={14} aria-hidden="true" />
              <span>{t.btnResetForm}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
