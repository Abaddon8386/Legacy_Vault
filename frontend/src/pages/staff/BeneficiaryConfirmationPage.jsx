import { useState, useId, useEffect, useRef } from 'react';
import {
  FileCheck,
  CheckCircle2,
  Clock,
  Info,
  AlertTriangle,
  UserCheck,
  HelpCircle,
} from 'lucide-react';
import {
  BENEFICIARY_CONFIRM_STATUS,
} from '../../utils/beneficiaryConfirmationValidation.js';
import { beneficiaryConfirmationI18n } from './beneficiaryConfirmationI18n.js';
import './BeneficiaryConfirmationPage.css';

export default function BeneficiaryConfirmationPage({
  lang = 'vi',
  initialBeneficiaries = [],
  caseId = '',
  caseReference: propCaseReference = '',
  beneficiaries: propBeneficiaries,
  onFetchBeneficiaries,
  loadBeneficiaries,
}) {
  const t = beneficiaryConfirmationI18n[lang] || beneficiaryConfirmationI18n.vi;
  const caseInputId = useId();
  const benSelectId = useId();
  const receiptInputId = useId();

  const initialCase = propCaseReference || caseId || '';
  const [caseReference, setCaseReference] = useState(initialCase);
  const [loadedCaseId, setLoadedCaseId] = useState(() => {
    if (initialCase && (propBeneficiaries || initialBeneficiaries.length > 0)) {
      return initialCase;
    }
    return '';
  });
  const [beneficiaries, setBeneficiaries] = useState(() => {
    if (propBeneficiaries) return Array.isArray(propBeneficiaries) ? propBeneficiaries : [];
    if (initialCase && initialBeneficiaries.length > 0) return initialBeneficiaries;
    return [];
  });
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [errors, setErrors] = useState({});

  const activeCaseRef = useRef(initialCase);

  const effectivePropCase = propCaseReference || caseId || '';
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

  // Handle async fetching when prop case changes
  useEffect(() => {
    activeCaseRef.current = effectivePropCase;
    const fetcher = onFetchBeneficiaries || loadBeneficiaries;
    if (fetcher && effectivePropCase.trim()) {
      fetcher(effectivePropCase.trim())
        .then((res) => {
          if (activeCaseRef.current !== effectivePropCase) return; // Discard stale response
          const list = Array.isArray(res) ? res : (res?.beneficiaries || []);
          setBeneficiaries(list);
          setLoadedCaseId(effectivePropCase);
        })
        .catch((err) => {
          if (activeCaseRef.current !== effectivePropCase) return;
          setBeneficiaries([]);
          setLoadedCaseId('');
          setErrors({ fetch: err.message || t.informationUnavailable });
        });
    }
  }, [effectivePropCase, onFetchBeneficiaries, loadBeneficiaries, t.informationUnavailable]);

  // Switch case resets all form inputs, previous errors, and beneficiary list
  const handleCaseChange = (newCase) => {
    activeCaseRef.current = newCase;
    setCaseReference(newCase);
    // CRITICAL: Immediately clear everything belonging to previous case
    setBeneficiaries([]);
    setLoadedCaseId('');
    setSelectedBeneficiaryId('');
    setReceiptReference('');
    setErrors({});

    const trimmed = newCase.trim();
    if (!trimmed) {
      return;
    }

    const fetcher = onFetchBeneficiaries || loadBeneficiaries;
    if (fetcher) {
      fetcher(trimmed)
        .then((res) => {
          // Response cũ của A về sau khi chuyển B phải bị bỏ qua
          if (activeCaseRef.current !== newCase) {
            return;
          }
          const list = Array.isArray(res) ? res : (res?.beneficiaries || []);
          setBeneficiaries(list);
          setLoadedCaseId(newCase);
        })
        .catch((err) => {
          if (activeCaseRef.current !== newCase) return;
          setBeneficiaries([]);
          setLoadedCaseId('');
          setErrors({ fetch: err.message || t.informationUnavailable });
        });
    }
  };

  // Switch beneficiary resets receipt input and validation feedback
  const handleBeneficiarySelect = (benId) => {
    setSelectedBeneficiaryId(benId);
    setReceiptReference('');
    setErrors({});
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

  const hasValidData =
    Boolean(caseReference) &&
    loadedCaseId === caseReference &&
    Array.isArray(beneficiaries) &&
    beneficiaries.length > 0;

  return (
    <div className="lv-beneficiary-confirmation-view">
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
                        <strong>{b.fullName || b.name || t.informationUnavailable}</strong>
                      </td>
                      <td>{b.relationship || t.informationUnavailable}</td>
                      <td>
                        <span className="lv-confirm-delivery-tag">
                          {isDelivered
                            ? t.deliveryDelivered
                            : isDeliveryPending
                              ? t.deliveryPending
                              : t.informationUnavailable}
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

        {/* Unavailable Notice */}
        <div className="lv-api-status-banner" role="status">
          <Info size={16} className="lv-api-status-banner__icon" aria-hidden="true" />
          <span>{!hasValidData ? t.informationUnavailable : t.unavailableNotice}</span>
        </div>

        <form onSubmit={(e) => e.preventDefault()} noValidate>
          <div className="lv-confirm-input-group" style={{ marginBottom: 16 }}>
            <label htmlFor={benSelectId} className="lv-confirm-label lv-confirm-label--required">
              {t.beneficiarySelectLabel}
            </label>
            <select
              id={benSelectId}
              className="lv-confirm-select"
              value={selectedBeneficiaryId}
              onChange={(e) => handleBeneficiarySelect(e.target.value)}
              disabled={!hasValidData}
            >
              <option value="">{t.beneficiarySelectPlaceholder}</option>
              {hasValidData &&
                beneficiaries.map((b) => {
                  const statusLabel =
                    b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED
                      ? t.statusConfirmed
                      : b.confirmationStatus === BENEFICIARY_CONFIRM_STATUS.PENDING
                        ? t.statusPending
                        : t.statusUnknown;
                  return (
                    <option key={b.id || b.beneficiaryId} value={b.id || b.beneficiaryId}>
                      {b.fullName || b.name} ({statusLabel})
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
              disabled={!hasValidData}
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
              type="button"
              className="lv-btn-record-submit"
              disabled={true} // Mutation disabled pending server endpoint; locked when no data
              title={!hasValidData ? t.informationUnavailable : t.unavailableNotice}
              aria-label={t.btnRecordConfirmation}
            >
              <FileCheck size={16} aria-hidden="true" />
              <span>{t.btnRecordConfirmation}</span>
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
