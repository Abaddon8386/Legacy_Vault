import { staffAuthFeedback, useStaffSessionExpiry } from './staffFeedback.js';
import { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  FileText,
  User,
  Shield,
  ShieldCheck,
  Clock,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  Info,
  Hash,
  XCircle,
  RefreshCw,
  UserCheck,
  FileCheck,
} from 'lucide-react';
import { Button } from '../../components/common/Button.jsx';
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import {
  fetchCaseBeneficiaries,
  fetchVerificationHistory,
  submitIdentityVerification,
  validateVerificationForm,
  validateVerificationReceipt,
} from './staffIdentityService.js';
import './StaffCaseVerificationPage.css';

/**
 * StaffCaseVerificationPage — Giao diện Tiếp nhận giấy tờ & Xác minh danh tính trực tiếp (PS-27)
 *
 * RANH GIỚI NGHIỆP VỤ & PHÁP LÝ:
 * 1. Staff kiểm tra CCCD/passport bản cứng và đối chiếu khuôn mặt trực tiếp tại quầy.
 * 2. Ghi kết quả: MATCH hoặc NOT_MATCH.
 * 3. Tuyệt đối KHÔNG có VNeID, camera, selfie, nhận diện tự động hay eKYC.
 * 4. Không upload ảnh/scan giấy tờ hoặc thu thập số định danh đầy đủ (chỉ tối đa 4 ký tự cuối).
 * 5. MATCH chỉ là kết quả đối chiếu danh tính; không đồng nghĩa phê duyệt pháp lý, xác nhận tử vong,
 *    mở khóa di chúc hoặc bàn giao tài sản.
 * 6. Không tự thay đổi Vault, DMS hoặc trạng thái case.
 * 7. Tách rõ:
 *    A. Tiếp nhận bản chính di chúc (PS-39): ghi nhận giao nhận vật lý, chưa kết nối API Backend.
 *    B. Xác minh danh tính người thụ hưởng (PS-45): Staff bắt buộc chọn đúng người được xác minh,
 *       không mặc định người nộp PS-26 là người thụ hưởng.
 */
export default function StaffCaseVerificationPage(props) {
  const scope = JSON.stringify([props.caseItem?.id || props.caseItem?.caseNumber, props.accessToken, Boolean(props.isDevPreview)]);
  return <VerificationForm key={scope} {...props} />;
}

function VerificationForm({
  caseItem,
  onBack,
  accessToken = null,
  isDevPreview = false,
  lang = 'vi',
  onUnauthorized,
  loadBeneficiaries = fetchCaseBeneficiaries,
  loadHistory = fetchVerificationHistory,
  onSubmitVerification = submitIdentityVerification,
  initialBeneficiaryId = null,
}) {
  const translations = getStaffCaseTranslations(lang);
  const t = translations.verification;
  const [listRetry, setListRetry] = useState(0);
  const [historyRetry, setHistoryRetry] = useState(0);

  // Refs for race-condition prevention & abort handling
  const activeCaseRef = useRef(caseItem?.id || caseItem?.caseNumber);
  const activeBeneficiaryRef = useRef(initialBeneficiaryId);
  const beneficiariesAbortRef = useRef(null);
  const historyAbortRef = useRef(null);
  const submitAbortRef = useRef(null);

  // Beneficiaries list state
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [isLoadingBeneficiaries, setIsLoadingBeneficiaries] = useState(true);
  const [beneficiariesError, setBeneficiariesError] = useState(null);

  // Selected Beneficiary state
  const [selectedBeneficiary, setSelectedBeneficiary] = useState(null);

  // Verification history state
  const [history, setHistory] = useState([]);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [historyError, setHistoryError] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    documentType: '',
    result: '',
    documentSuffix: '',
    issuingAuthority: '',
  });

  const [storedFieldErrors, setFieldErrors] = useState({});
  const currentValidation = validateVerificationForm(formData, lang).errors;
  const fieldErrors = Object.fromEntries(Object.entries(storedFieldErrors).map(([key, value]) =>
    [key, value === true ? (currentValidation[key] || t.beneficiarySelect?.selectPrompt) : value]));
  const notifySessionExpiry = useStaffSessionExpiry({ accessToken, isDevPreview, onUnauthorized });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);
  const [successReceipt, setSuccessReceipt] = useState(null);

  // Format Helper
  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  // Load Beneficiaries effect
  useEffect(() => {
    const currentCaseId = caseItem?.id || caseItem?.caseNumber;
    if (!currentCaseId) return;
    activeCaseRef.current = currentCaseId;

    if (beneficiariesAbortRef.current) {
      beneficiariesAbortRef.current.abort();
    }
    const controller = new AbortController();
    beneficiariesAbortRef.current = controller;

    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setIsLoadingBeneficiaries(true);
      setBeneficiariesError(null);
      return loadBeneficiaries(currentCaseId, {
      accessToken,
      isDevPreview,
      lang,
      signal: controller.signal,
      });
    })
      .then((res) => {
        if (controller.signal.aborted || activeCaseRef.current !== currentCaseId) return;
        const list = res?.beneficiaries || [];
        setBeneficiaries(list);
        if (initialBeneficiaryId) {
          const found = list.find((b) => b.id === initialBeneficiaryId);
          if (found) {
            setSelectedBeneficiary(found);
            activeBeneficiaryRef.current = found.id;
          }
        }
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (controller.signal.aborted || activeCaseRef.current !== currentCaseId) return;
        notifySessionExpiry(err);
        setBeneficiariesError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted && activeCaseRef.current === currentCaseId) {
          setIsLoadingBeneficiaries(false);
          beneficiariesAbortRef.current = null;
        }
      });

    return () => {
      controller.abort();
    };
  }, [caseItem?.id, caseItem?.caseNumber, accessToken, isDevPreview, lang, loadBeneficiaries, initialBeneficiaryId, listRetry, notifySessionExpiry]);

  // Load history when selectedBeneficiary changes
  useEffect(() => {
    const benId = selectedBeneficiary?.id;
    activeBeneficiaryRef.current = benId;

    if (!benId) return;

    if (historyAbortRef.current) {
      historyAbortRef.current.abort();
    }
    const controller = new AbortController();
    historyAbortRef.current = controller;

    Promise.resolve().then(() => {
      if (controller.signal.aborted) return;
      setHistory([]);
      setIsLoadingHistory(true);
      setHistoryError(null);
      return loadHistory(benId, {
      accessToken,
      isDevPreview,
      lang,
      signal: controller.signal,
      });
    })
      .then((res) => {
        if (controller.signal.aborted || activeBeneficiaryRef.current !== benId) return;
        setHistory(res?.history || []);
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        if (controller.signal.aborted || activeBeneficiaryRef.current !== benId) return;
        notifySessionExpiry(err);
        setHistoryError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted && activeBeneficiaryRef.current === benId) {
          setIsLoadingHistory(false);
          historyAbortRef.current = null;
        }
      });

    return () => {
      controller.abort();
    };
  }, [selectedBeneficiary?.id, accessToken, isDevPreview, lang, loadHistory, historyRetry, notifySessionExpiry]);

  // Cleanup all abort controllers on unmount
  useEffect(() => {
    return () => {
      activeCaseRef.current = null;
      activeBeneficiaryRef.current = null;
      beneficiariesAbortRef.current?.abort();
      historyAbortRef.current?.abort();
      submitAbortRef.current?.abort();
    };
  }, []);

  // Beneficiary selection handler
  const handleSelectBeneficiary = (ben) => {
    if (selectedBeneficiary?.id === ben.id) return;
    submitAbortRef.current?.abort();
    submitAbortRef.current = null;
    historyAbortRef.current?.abort();
    setIsSubmitting(false);
    setHistory([]);

    setSelectedBeneficiary(ben);
    activeBeneficiaryRef.current = ben.id;
    setFormData({ documentType: '', result: '', documentSuffix: '', issuingAuthority: '' });
    setFieldErrors({});
    setSubmitError(null);
    setSuccessReceipt(null);
  };

  // Form input change handler
  const handleInputChange = (field, value) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((prev) => {
        const next = { ...prev };
        delete next[field];
        return next;
      });
    }
  };

  // Submission handler
  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    if (isSubmitting || submitAbortRef.current) return;

    if (!selectedBeneficiary) {
      setFieldErrors({ beneficiary: true });
      return;
    }

    // Client-side validation against openapi schema
    const validation = validateVerificationForm(formData, lang);
    if (!validation.isValid) {
      setFieldErrors(Object.fromEntries(Object.keys(validation.errors).map(key => [key, true])));
      const firstKey = Object.keys(validation.errors)[0];
      const el = document.querySelector(`[data-field="${firstKey}"]`);
      if (el && typeof el.scrollIntoView === 'function') {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
      return;
    }

    setFieldErrors({});
    setSubmitError(null);
    setIsSubmitting(true);

    if (submitAbortRef.current) {
      submitAbortRef.current.abort();
    }
    const controller = new AbortController();
    submitAbortRef.current = controller;

    const currentCaseId = caseItem?.id || caseItem?.caseNumber;
    const currentBeneficiaryId = selectedBeneficiary.id;

    try {
      // Contract: POST /api/v1/staff/beneficiaries/{beneficiaryId}/identity-verifications
      // Only documentType, result, issuingAuthority, documentSuffix sent. No actor ID or verifiedAt!
      const result = await onSubmitVerification(
        currentBeneficiaryId,
        {
          documentType: formData.documentType,
          result: formData.result,
          documentSuffix: formData.documentSuffix ? formData.documentSuffix.trim() : null,
          issuingAuthority: formData.issuingAuthority ? formData.issuingAuthority.trim() : null,
        },
        {
          accessToken,
          isDevPreview,
          lang,
          signal: controller.signal,
        }
      );

      // Discard response if case or beneficiary changed while in flight
      if (
        controller.signal.aborted ||
        activeCaseRef.current !== currentCaseId ||
        activeBeneficiaryRef.current !== currentBeneficiaryId
      ) {
        return;
      }

      // Validate receipt against contract
      const receipt = validateVerificationReceipt(result, currentBeneficiaryId, {
        accessToken,
        isDevPreview,
        expectedDocumentType: formData.documentType,
        expectedResult: formData.result,
      });

      setSuccessReceipt(receipt);

      // Refresh history list for this beneficiary
      setHistory((prev) => [receipt, ...prev]);
    } catch (err) {
      if (err.name === 'AbortError') return;
      if (
        controller.signal.aborted ||
        activeCaseRef.current !== currentCaseId ||
        activeBeneficiaryRef.current !== currentBeneficiaryId
      ) {
        return;
      }

      notifySessionExpiry(err);
      if (err.fieldErrors) {
        setFieldErrors(err.fieldErrors);
      } else {
        setSubmitError(err);
      }
    } finally {
      if (
        !controller.signal.aborted &&
        activeCaseRef.current === currentCaseId &&
        activeBeneficiaryRef.current === currentBeneficiaryId
      ) {
        submitAbortRef.current = null;
        setIsSubmitting(false);
      }
    }
  };

  // Missing case context fallback
  if (!caseItem) {
    return (
      <div className="lv-verify-page lv-verify-page--no-case">
        <div className="lv-verify-header">
          <Button variant="secondary" size="sm" onClick={onBack} className="lv-verify-back-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t.backToListBtn}</span>
          </Button>
        </div>

        <div className="lv-verify-state-card" role="alert">
          <div className="lv-verify-state-icon-wrap lv-verify-state-icon-wrap--warning">
            <AlertCircle size={32} aria-hidden="true" />
          </div>
          <h2 className="lv-verify-state-title">{t.noCaseTitle}</h2>
          <p className="lv-verify-state-desc">{t.noCaseDesc}</p>
          <div className="lv-verify-state-actions">
            <Button variant="primary" onClick={onBack}>
              {t.backToListBtn}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Success Receipt View
  if (successReceipt) {
    const isMatch = successReceipt.result === 'MATCH';
    return (
      <div className="lv-verify-page">
        <div className="lv-verify-header">
          <Button variant="secondary" size="sm" onClick={onBack} className="lv-verify-back-btn">
            <ArrowLeft size={16} aria-hidden="true" />
            <span>{t.backToListBtn}</span>
          </Button>
        </div>

        <div className="lv-verify-success-card" role="status">
          <div className={`lv-verify-success-icon-wrap ${isMatch ? 'lv-verify-success-icon-wrap--match' : 'lv-verify-success-icon-wrap--not-match'}`}>
            {isMatch ? (
              <CheckCircle2 size={36} aria-hidden="true" />
            ) : (
              <XCircle size={36} aria-hidden="true" />
            )}
          </div>
          <h2 className="lv-verify-success-title">{t.feedback.successTitle}</h2>
          <p className="lv-verify-success-desc">{t.feedback.successDesc}</p>

          <div className="lv-verify-receipt-box">
            <div className="lv-verify-receipt-row">
              <span className="lv-verify-receipt-label">{t.feedback.receiptId}</span>
              <strong className="lv-verify-receipt-val lv-verify-receipt-val--code">
                {successReceipt.id}
              </strong>
            </div>

            <div className="lv-verify-receipt-row">
              <span className="lv-verify-receipt-label">{t.review.beneficiaryLabel}</span>
              <strong className="lv-verify-receipt-val">
                {selectedBeneficiary?.fullName || selectedBeneficiary?.id}
              </strong>
            </div>

            <div className="lv-verify-receipt-row">
              <span className="lv-verify-receipt-label">{t.review.resultLabel}</span>
              <span className={`lv-verify-status-badge ${isMatch ? 'lv-verify-status-badge--match' : 'lv-verify-status-badge--not-match'}`}>
                {isMatch ? t.beneficiarySelect.statusMatch : t.beneficiarySelect.statusNotMatch}
              </span>
            </div>

            <div className="lv-verify-receipt-row">
              <span className="lv-verify-receipt-label">{t.review.documentLabel}</span>
              <span className="lv-verify-receipt-val">
                {t.form.documentTypeOptions[successReceipt.documentType] || successReceipt.documentType}
                {successReceipt.documentSuffix ? ` (****${successReceipt.documentSuffix})` : ''}
              </span>
            </div>

            {successReceipt.issuingAuthority && (
              <div className="lv-verify-receipt-row">
                <span className="lv-verify-receipt-label">{t.review.authorityLabel}</span>
                <span className="lv-verify-receipt-val">{successReceipt.issuingAuthority}</span>
              </div>
            )}

            <div className="lv-verify-receipt-row">
              <span className="lv-verify-receipt-label">{t.feedback.verifiedAt}</span>
              <span className="lv-verify-receipt-val">{formatDate(successReceipt.verifiedAt)}</span>
            </div>
          </div>

          {isDevPreview && (
            <div className="lv-verify-simulation-warning" role="note">
              <Sparkles size={16} aria-hidden="true" />
              <span>{t.devPreviewBanner}</span>
            </div>
          )}

          <div className="lv-verify-success-actions">
            <Button
              variant="secondary"
              onClick={() => {
                setSelectedBeneficiary(null);
                activeBeneficiaryRef.current = null;
                setHistory([]);
                setSuccessReceipt(null);
                setFormData({ documentType: '', result: '', documentSuffix: '', issuingAuthority: '' });
                setFieldErrors({});
              }}
            >
              {t.buttons.continueVerification}
            </Button>
            <Button variant="primary" onClick={onBack}>
              {t.buttons.back}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const authFeedback = staffAuthFeedback(submitError || beneficiariesError, lang);
  const historyAuthFeedback = staffAuthFeedback(historyError, lang);
  const isBackendNotReady = submitError?.code === 'BACKEND_NOT_READY' || beneficiariesError?.code === 'BACKEND_NOT_READY';

  return (
    <div className="lv-verify-page">
      {/* Header and Back Button */}
      <div className="lv-verify-header">
        <Button variant="secondary" size="sm" onClick={onBack} className="lv-verify-back-btn">
          <ArrowLeft size={16} aria-hidden="true" />
          <span>{t.backToListBtn}</span>
        </Button>

        <div className="lv-verify-header__titles">
          <div className="lv-verify-eyebrow">{t.eyebrow}</div>
          <h1 className="lv-verify-title">{t.pageTitle}</h1>
          <p className="lv-verify-subtitle">{t.pageSubtitle}</p>
        </div>
      </div>

      {/* DEV Preview Notice Banner */}
      {isDevPreview && (
        <div className="lv-verify-preview-banner" role="status">
          <div className="lv-verify-preview-banner__icon">
            <Sparkles size={16} aria-hidden="true" />
          </div>
          <div className="lv-verify-preview-banner__text">
            {t.devPreviewBanner}
          </div>
        </div>
      )}

      {/* Legal & Operational Boundary Alert */}
      <div className="lv-verify-legal-notice" role="note">
        <div className="lv-verify-legal-notice__icon">
          <Info size={18} aria-hidden="true" />
        </div>
        <div className="lv-verify-legal-notice__body">
          <h4 className="lv-verify-legal-notice__title">{t.legalNoticeTitle}</h4>
          <ul className="lv-verify-legal-notice__list">
            <li>{t.legalNotice1}</li>
            <li>{t.legalNotice2}</li>
            <li>{t.legalNotice3}</li>
          </ul>
        </div>
      </div>

      {/* Error Banners */}
      {(submitError || beneficiariesError) && (
        <div className="lv-verify-error-banner" role="alert">
          <AlertCircle size={20} aria-hidden="true" />
          <div className="lv-verify-error-banner__content">
            <h4>{authFeedback?.title || (isBackendNotReady ? t.feedback.notReadyTitle : t.feedback.errorTitle)}</h4>
            <p>{authFeedback?.description || (isBackendNotReady ? t.feedback.notReadyDesc : t.feedback.errorDesc)}</p>
          </div>
          {beneficiariesError && <Button variant="secondary" onClick={() => setListRetry(n => n + 1)}>{translations.states.retryBtn}</Button>}
        </div>
      )}

      {/* SECTION 1: THÔNG TIN HỒ SƠ ĐANG XỬ LÝ */}
      <section className="lv-verify-section">
        <h2 className="lv-verify-section__title">
          <FileText size={18} aria-hidden="true" />
          <span>{t.sections.caseRef}</span>
        </h2>

        <div className="lv-verify-case-card">
          <div className="lv-verify-context-grid">
            <div className="lv-verify-context-item">
              <span className="lv-verify-context-label">{translations.detailModal.caseRef}</span>
              <span className="lv-verify-context-val lv-verify-context-val--code">
                <Hash size={13} aria-hidden="true" />
                {caseItem.caseNumber}
              </span>
            </div>

            <div className="lv-verify-context-item">
              <span className="lv-verify-context-label">{translations.detailModal.vaultName}</span>
              <span className="lv-verify-context-val lv-verify-context-val--vault">
                <Shield size={13} aria-hidden="true" />
                {caseItem.vaultName}
              </span>
            </div>

            <div className="lv-verify-context-item">
              <span className="lv-verify-context-label">{translations.detailModal.ownerName}</span>
              <span className="lv-verify-context-val">
                <User size={13} aria-hidden="true" />
                {caseItem.ownerName || caseItem.ownerFullName || '—'}
              </span>
            </div>

            <div className="lv-verify-context-item">
              <span className="lv-verify-context-label">{translations.detailModal.graceEndedAt}</span>
              <span className="lv-verify-context-val">
                <Clock size={13} aria-hidden="true" />
                {formatDate(caseItem.gracePeriodEndedAt)}
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 2: TIẾP NHẬN BẢN CHÍNH DI CHÚC (MINH HỌA PS-39) */}
      <section className="lv-verify-section">
        <div className="lv-verify-section__header-row">
          <h2 className="lv-verify-section__title">
            <FileCheck size={18} aria-hidden="true" />
            <span>{t.sections.physicalWill}</span>
          </h2>
          <span className="lv-verify-badge-preview-tag" title="Preview Only">
            {t.physicalWill.badge}
          </span>
        </div>

        <div className="lv-verify-ps39-card">
          <p className="lv-verify-ps39-notice">
            <Info size={15} aria-hidden="true" />
            <span>{t.physicalWill.notice}</span>
          </p>

          <div className="lv-verify-ps39-grid">
            <div className="lv-verify-ps39-item">
              <span className="lv-verify-ps39-label">{t.physicalWill.statusLabel}</span>
              <span className="lv-verify-ps39-val">{t.physicalWill.statusVal}</span>
            </div>
            <div className="lv-verify-ps39-item">
              <span className="lv-verify-ps39-label">{t.physicalWill.notesLabel}</span>
              <span className="lv-verify-ps39-val">{t.physicalWill.notesVal}</span>
            </div>
          </div>
        </div>
      </section>

      {/* SECTION 3: CHỌN NGƯỜI THỤ HƯỞNG CẦN XÁC MINH (PS-45) */}
      <section className="lv-verify-section" data-field="beneficiary">
        <h2 className="lv-verify-section__title">
          <UserCheck size={18} aria-hidden="true" />
          <span>{t.sections.beneficiarySelect}</span>
        </h2>

        <p className="lv-verify-section__subnote">
          {t.beneficiarySelect.desc}
        </p>

        {fieldErrors.beneficiary && (
          <div className="lv-verify-field-error-banner" role="alert">
            <AlertCircle size={16} aria-hidden="true" />
            <span>{fieldErrors.beneficiary}</span>
          </div>
        )}

        {isLoadingBeneficiaries ? (
          <div className="lv-verify-loading-box">
            <RefreshCw size={18} className="lv-verify-spin" aria-hidden="true" />
            <span>{lang === 'en' ? 'Loading beneficiaries…' : 'Đang tải danh sách người thụ hưởng…'}</span>
          </div>
        ) : beneficiariesError ? null : beneficiaries.length === 0 ? (
          <div className="lv-verify-empty-box">
            <User size={24} aria-hidden="true" />
            <span>{t.beneficiarySelect.emptyList}</span>
          </div>
        ) : (
          <div className="lv-verify-beneficiaries-grid" role="radiogroup" aria-label={t.sections.beneficiarySelect}>
            {beneficiaries.map((b) => {
              const isSelected = selectedBeneficiary?.id === b.id;
              // Check latest history status if available for badge
              const latestRecord = history.find((h) => h.beneficiaryId === b.id);
              let statusModifier = 'not-verified';
              let statusLabel = !isSelected || isLoadingHistory || historyError
                ? t.beneficiarySelect.statusUnknown : t.beneficiarySelect.statusNotVerified;
              if (latestRecord?.result === 'MATCH') {
                statusModifier = 'match';
                statusLabel = t.beneficiarySelect.statusMatch;
              } else if (latestRecord?.result === 'NOT_MATCH') {
                statusModifier = 'not-match';
                statusLabel = t.beneficiarySelect.statusNotMatch;
              }

              return (
                <div
                  key={b.id}
                  className={`lv-verify-ben-card ${isSelected ? 'lv-verify-ben-card--selected' : ''}`}
                  onClick={() => handleSelectBeneficiary(b)}
                  role="radio"
                  aria-checked={isSelected}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      e.preventDefault();
                      handleSelectBeneficiary(b);
                    }
                  }}
                >
                  <div className="lv-verify-ben-card__header">
                    <div className="lv-verify-ben-card__name-wrap">
                      <User size={15} className="lv-verify-ben-icon" aria-hidden="true" />
                      <strong className="lv-verify-ben-name">{b.fullName}</strong>
                    </div>
                    {isSelected && (
                      <span className="lv-verify-selected-tag">
                        <CheckCircle2 size={12} aria-hidden="true" />
                        <span>{t.beneficiarySelect.selectedTag}</span>
                      </span>
                    )}
                  </div>

                  <div className="lv-verify-ben-card__meta">
                    {b.relationship && (
                      <div className="lv-verify-ben-row">
                        <span className="lv-verify-ben-label">{t.beneficiarySelect.relationLabel}</span>
                        <span className="lv-verify-ben-val">{b.relationship}</span>
                      </div>
                    )}
                    {b.dateOfBirth && (
                      <div className="lv-verify-ben-row">
                        <span className="lv-verify-ben-label">{t.beneficiarySelect.dobLabel}</span>
                        <span className="lv-verify-ben-val">{b.dateOfBirth}</span>
                      </div>
                    )}
                    <div className="lv-verify-ben-row">
                      <span className="lv-verify-ben-label">{t.beneficiarySelect.idStatusLabel}</span>
                      <span className="lv-verify-ben-val">
                        {b.hasIdentityNumber ? t.beneficiarySelect.hasId : t.beneficiarySelect.noId}
                      </span>
                    </div>
                  </div>

                  <div className="lv-verify-ben-card__footer">
                    <span className={`lv-verify-status-badge lv-verify-status-badge--${statusModifier}`}>
                      <span className="lv-verify-status-dot" aria-hidden="true" />
                      <span>{statusLabel}</span>
                    </span>

                    <button
                      type="button"
                      className={`lv-verify-select-btn ${isSelected ? 'lv-verify-select-btn--active' : ''}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectBeneficiary(b);
                      }}
                      aria-label={`${t.beneficiarySelect.selectBtn} ${b.fullName}`}
                    >
                      {isSelected ? t.beneficiarySelect.selectedTag : t.beneficiarySelect.selectBtn}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 4: LỊCH SỬ XÁC MINH CỦA NGƯỜI ĐƯỢC CHỌN (PS-45) */}
      {selectedBeneficiary && (
        <section className="lv-verify-section">
          <h2 className="lv-verify-section__title">
            <Clock size={18} aria-hidden="true" />
            <span>{t.sections.history} — {selectedBeneficiary.fullName}</span>
          </h2>

          {isLoadingHistory ? (
            <div className="lv-verify-loading-box">
              <RefreshCw size={16} className="lv-verify-spin" aria-hidden="true" />
              <span>{lang === 'en' ? 'Loading verification history…' : 'Đang tải lịch sử xác minh…'}</span>
            </div>
          ) : historyError ? (
            <div role="alert" className="lv-verify-error-banner">
              <span>{historyAuthFeedback?.description || t.history.loadError}</span>
              <Button variant="secondary" onClick={() => setHistoryRetry(n => n + 1)}>{translations.states.retryBtn}</Button>
            </div>
          ) : history.length === 0 ? (
            <div className="lv-verify-history-empty">
              <Info size={16} aria-hidden="true" />
              <span>{t.history.empty}</span>
            </div>
          ) : (
            <div className="lv-verify-history-table-wrap">
              <table className="lv-verify-history-table">
                <thead>
                  <tr>
                    <th>{t.history.colTime}</th>
                    <th>{t.history.colDoc}</th>
                    <th>{t.history.colSuffix}</th>
                    <th>{t.history.colAuthority}</th>
                    <th>{t.history.colResult}</th>
                    <th>{t.history.colActor}</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item) => (
                    <tr key={item.id}>
                      <td>{formatDate(item.verifiedAt)}</td>
                      <td>{t.form.documentTypeOptions[item.documentType] || item.documentType}</td>
                      <td>{item.documentSuffix ? `****${item.documentSuffix}` : '—'}</td>
                      <td>{item.issuingAuthority || '—'}</td>
                      <td>
                        <span className={`lv-verify-status-badge ${item.result === 'MATCH' ? 'lv-verify-status-badge--match' : 'lv-verify-status-badge--not-match'}`}>
                          {item.result}
                        </span>
                      </td>
                      <td className="lv-verify-history-actor-cell">
                        <span className="lv-verify-history-no-actor">{t.history.noActor}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}

      {/* SECTION 5: BIỂU MẪU ĐỐI CHIẾU DANH TÍNH TRỰC TIẾP TẠI QUẦY (PS-45) */}
      <section className="lv-verify-section">
        <h2 className="lv-verify-section__title">
          <ShieldCheck size={18} aria-hidden="true" />
          <span>{t.sections.verificationForm}</span>
        </h2>

        {!selectedBeneficiary ? (
          <div className="lv-verify-select-prompt-box">
            <Info size={18} aria-hidden="true" />
            <span>{t.beneficiarySelect.selectPrompt}</span>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="lv-verify-form" noValidate>
            <div className="lv-verify-target-banner">
              <span className="lv-verify-target-label">{t.form.beneficiaryNotice}</span>
              <strong className="lv-verify-target-name">{selectedBeneficiary.fullName}</strong>
              {selectedBeneficiary.relationship && (
                <span className="lv-verify-target-rel">({selectedBeneficiary.relationship})</span>
              )}
            </div>

            <div className="lv-verify-form-fields">
              {/* FIELD 1: LOẠI GIẤY TỜ (Bắt buộc) */}
              <div
                className={`lv-verify-field ${fieldErrors.documentType ? 'lv-verify-field--error' : ''}`}
                data-field="documentType"
              >
                <label className="lv-verify-label">
                  <span>{t.form.documentType}</span>
                  <span className="lv-verify-required" aria-hidden="true">*</span>
                </label>

                <div className="lv-verify-radio-group" role="radiogroup" aria-label={t.form.documentType}>
                  <label className={`lv-verify-radio-pill ${formData.documentType === 'CCCD' ? 'lv-verify-radio-pill--active' : ''}`}>
                    <input
                      type="radio"
                      name="documentType"
                      value="CCCD"
                      checked={formData.documentType === 'CCCD'}
                      onChange={() => handleInputChange('documentType', 'CCCD')}
                      disabled={isSubmitting}
                      className="lv-verify-radio-input"
                    />
                    <span>{t.form.documentTypeOptions.CCCD}</span>
                  </label>

                  <label className={`lv-verify-radio-pill ${formData.documentType === 'PASSPORT' ? 'lv-verify-radio-pill--active' : ''}`}>
                    <input
                      type="radio"
                      name="documentType"
                      value="PASSPORT"
                      checked={formData.documentType === 'PASSPORT'}
                      onChange={() => handleInputChange('documentType', 'PASSPORT')}
                      disabled={isSubmitting}
                      className="lv-verify-radio-input"
                    />
                    <span>{t.form.documentTypeOptions.PASSPORT}</span>
                  </label>
                </div>

                {fieldErrors.documentType && (
                  <span className="lv-verify-error-text" role="alert">
                    {fieldErrors.documentType}
                  </span>
                )}
              </div>

              {/* FIELD 2: KẾT QUẢ ĐỐI CHIẾU TRỰC TIẾP (Bắt buộc, không chọn sẵn) */}
              <div
                className={`lv-verify-field ${fieldErrors.result ? 'lv-verify-field--error' : ''}`}
                data-field="result"
              >
                <label className="lv-verify-label">
                  <span>{t.form.result}</span>
                  <span className="lv-verify-required" aria-hidden="true">*</span>
                </label>
                <p className="lv-verify-hint">{t.form.resultDesc}</p>

                <div className="lv-verify-result-options" role="radiogroup" aria-label={t.form.result}>
                  <label className={`lv-verify-result-card lv-verify-result-card--match ${formData.result === 'MATCH' ? 'lv-verify-result-card--active' : ''}`}>
                    <div className="lv-verify-result-card__header">
                      <input
                        type="radio"
                        name="result"
                        value="MATCH"
                        checked={formData.result === 'MATCH'}
                        onChange={() => handleInputChange('result', 'MATCH')}
                        disabled={isSubmitting}
                        className="lv-verify-radio-input"
                      />
                      <span className="lv-verify-result-pill lv-verify-result-pill--match">MATCH</span>
                    </div>
                    <span className="lv-verify-result-card__text">
                      {t.form.resultOptions.MATCH}
                    </span>
                  </label>

                  <label className={`lv-verify-result-card lv-verify-result-card--not-match ${formData.result === 'NOT_MATCH' ? 'lv-verify-result-card--active' : ''}`}>
                    <div className="lv-verify-result-card__header">
                      <input
                        type="radio"
                        name="result"
                        value="NOT_MATCH"
                        checked={formData.result === 'NOT_MATCH'}
                        onChange={() => handleInputChange('result', 'NOT_MATCH')}
                        disabled={isSubmitting}
                        className="lv-verify-radio-input"
                      />
                      <span className="lv-verify-result-pill lv-verify-result-pill--not-match">NOT_MATCH</span>
                    </div>
                    <span className="lv-verify-result-card__text">
                      {t.form.resultOptions.NOT_MATCH}
                    </span>
                  </label>
                </div>

                {fieldErrors.result && (
                  <span className="lv-verify-error-text" role="alert">
                    {fieldErrors.result}
                  </span>
                )}
              </div>

              {/* FIELD 3: BỐN KÝ TỰ CUỐI SỐ GIẤY TỜ (Tùy chọn, đúng 4 ký tự) */}
              <div
                className={`lv-verify-field ${fieldErrors.documentSuffix ? 'lv-verify-field--error' : ''}`}
                data-field="documentSuffix"
              >
                <label htmlFor="verify-suffix" className="lv-verify-label">
                  <span>{t.form.documentSuffix}</span>
                </label>
                <input
                  id="verify-suffix"
                  type="text"
                  maxLength={4}
                  className="lv-verify-input lv-verify-input--code"
                  placeholder={t.form.documentSuffixPlaceholder}
                  value={formData.documentSuffix}
                  onChange={(e) => handleInputChange('documentSuffix', e.target.value.toUpperCase())}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.documentSuffix)}
                  aria-describedby="hint-documentSuffix"
                />
                <span id="hint-documentSuffix" className="lv-verify-hint">
                  {t.form.documentSuffixHint}
                </span>
                {fieldErrors.documentSuffix && (
                  <span className="lv-verify-error-text" role="alert">
                    {fieldErrors.documentSuffix}
                  </span>
                )}
              </div>

              {/* FIELD 4: CƠ QUAN CẤP (Tùy chọn, tối đa 150 ký tự) */}
              <div
                className={`lv-verify-field ${fieldErrors.issuingAuthority ? 'lv-verify-field--error' : ''}`}
                data-field="issuingAuthority"
              >
                <label htmlFor="verify-authority" className="lv-verify-label">
                  <span>{t.form.issuingAuthority}</span>
                </label>
                <input
                  id="verify-authority"
                  type="text"
                  maxLength={150}
                  className="lv-verify-input"
                  placeholder={t.form.issuingAuthorityPlaceholder}
                  value={formData.issuingAuthority}
                  onChange={(e) => handleInputChange('issuingAuthority', e.target.value)}
                  disabled={isSubmitting}
                  aria-invalid={Boolean(fieldErrors.issuingAuthority)}
                />
                {fieldErrors.issuingAuthority && (
                  <span className="lv-verify-error-text" role="alert">
                    {fieldErrors.issuingAuthority}
                  </span>
                )}
              </div>

              {/* FIELD 5: GHI CHÚ VỀ ACTOR & THỜI ĐIỂM (Chỉ đọc) */}
              <div className="lv-verify-actor-note-box" role="note">
                <Info size={16} aria-hidden="true" />
                <div className="lv-verify-actor-note-body">
                  <strong>{t.form.actorNote}</strong>
                  <p>{t.form.actorDesc}</p>
                </div>
              </div>

              {/* KHỐI XEM LẠI TRƯỚC KHI GHI NHẬN (REVIEW) */}
              <div className="lv-verify-review-box">
                <h4 className="lv-verify-review-title">{t.review.title}</h4>
                <div className="lv-verify-review-grid">
                  <div className="lv-verify-review-item">
                    <span className="lv-verify-review-label">{t.review.beneficiaryLabel}</span>
                    <strong className="lv-verify-review-val">{selectedBeneficiary.fullName}</strong>
                  </div>
                  <div className="lv-verify-review-item">
                    <span className="lv-verify-review-label">{t.review.documentLabel}</span>
                    <span className="lv-verify-review-val">
                      {t.form.documentTypeOptions[formData.documentType] || formData.documentType || '—'}
                    </span>
                  </div>
                  <div className="lv-verify-review-item">
                    <span className="lv-verify-review-label">{t.review.suffixLabel}</span>
                    <span className="lv-verify-review-val">{formData.documentSuffix || '—'}</span>
                  </div>
                  <div className="lv-verify-review-item">
                    <span className="lv-verify-review-label">{t.review.authorityLabel}</span>
                    <span className="lv-verify-review-val">{formData.issuingAuthority || '—'}</span>
                  </div>
                  <div className="lv-verify-review-item lv-verify-review-item--full">
                    <span className="lv-verify-review-label">{t.review.resultLabel}</span>
                    <span className={`lv-verify-review-result ${formData.result ? (formData.result === 'MATCH' ? 'lv-verify-review-result--match' : 'lv-verify-review-result--not-match') : ''}`}>
                      {formData.result ? t.form.resultOptions[formData.result] : '—'}
                    </span>
                  </div>
                </div>
                <p className="lv-verify-review-warning">{t.review.warning}</p>
              </div>

              {/* BUTTONS */}
              <div className="lv-verify-actions">
                <Button
                  type="submit"
                  variant="primary"
                  isLoading={isSubmitting}
                  disabled={isSubmitting || !formData.documentType || !formData.result}
                  className="lv-verify-submit-btn"
                >
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>{isSubmitting ? t.buttons.submitting : t.buttons.submit}</span>
                </Button>
              </div>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
