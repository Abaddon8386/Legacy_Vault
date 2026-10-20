import { useState, useEffect } from 'react';
import {
  Archive,
  CheckCircle2,
  Clock,
  AlertTriangle,
  FileText,
  Lock,
  RefreshCw,
  FileCheck,
  ArrowLeft,
} from 'lucide-react';
import {
  evaluateCloseArchivePreconditions,
  isCaseArchived,
} from '../../utils/closeAndArchiveValidation.js';
import {
  fetchHandoverReceipts,
  createHandoverReceipt,
  closeHandoverSession,
  archiveHandoverCase,
} from './handoverSessionService.js';
import { closeAndArchiveI18n } from './closeAndArchiveI18n.js';
import './CloseAndArchivePage.css';

export default function CloseAndArchivePage({
  lang = 'vi',
  caseId: propCaseId = '',
  sessionId: propSessionId = '',
  sessionStatus: propSessionStatus = null,
  vaultStatus: propVaultStatus = null,
  caseStatus: propCaseStatus = null,
  assetData = null,
  beneficiaryData = null,
  receipts: propReceipts = null,
  accessToken = null,
  session = null,
  preview = false,
  isDevPreview = false,
  onNavigateCases = null,
}) {
  const t = closeAndArchiveI18n[lang] || closeAndArchiveI18n.vi;

  const effectiveIsDevPreview = Boolean(isDevPreview || preview);
  const effectiveAccessToken = accessToken || session?.accessToken || null;

  const searchParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const caseId = propCaseId || searchParams?.get('caseId') || (effectiveIsDevPreview ? '6f1a4c2d-0000-4000-8000-000000000001' : '');
  const sessionId = propSessionId || searchParams?.get('sessionId') || (effectiveIsDevPreview ? 'HDS-2026-001' : '');

  const [sessionStatus, setSessionStatus] = useState(propSessionStatus || 'ACTIVE');
  const [vaultStatus, setVaultStatus] = useState(propVaultStatus || 'UNLOCKED');
  const [caseStatus, setCaseStatus] = useState(propCaseStatus || 'OPEN');
  const [fetchedReceipts, setFetchedReceipts] = useState([]);

  const receipts = propReceipts !== null ? propReceipts : fetchedReceipts;

  const [isCreatingReceipt, setIsCreatingReceipt] = useState(false);
  const [isClosingSession, setIsClosingSession] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);

  const isArchived = isCaseArchived(vaultStatus, caseStatus);

  // Evaluate pre-conditions
  const effectiveAssetData = assetData || { totalCount: 3, deliveredCount: 3, isComplete: true };
  const effectiveBeneficiaryData = beneficiaryData || { totalCount: 2, confirmedCount: 2, isComplete: true };

  const evaluation = evaluateCloseArchivePreconditions(effectiveAssetData, effectiveBeneficiaryData);
  const { isAssetComplete, isBeneficiaryComplete } = evaluation;

  // Tự động load receipts nếu chưa có từ props
  useEffect(() => {
    if (propReceipts !== null) {
      return;
    }
    if (!caseId || !sessionId) return;

    let active = true;
    fetchHandoverReceipts(caseId, sessionId, {
      accessToken: effectiveAccessToken,
      isDevPreview: effectiveIsDevPreview,
      lang,
    })
      .then((res) => {
        if (active) {
          setFetchedReceipts(Array.isArray(res) ? res : []);
        }
      })
      .catch(() => {
        if (active) {
          setFetchedReceipts([]);
        }
      });

    return () => {
      active = false;
    };
  }, [caseId, sessionId, propReceipts, effectiveAccessToken, effectiveIsDevPreview, lang]);

  // Resolve status label from server status code
  const resolveSessionLabel = (status) => {
    if (typeof status !== 'string') return t.statusUnavailable;
    const s = status.trim().toUpperCase();
    if (s === 'COMPLETED') return t.statusSessionCompleted;
    if (s === 'ACTIVE') return t.statusSessionActive;
    if (s === 'HANDOVER_IN_PROGRESS') return t.statusSessionInProgress;
    return t.statusUnavailable;
  };

  const resolveVaultLabel = (status) => {
    if (typeof status !== 'string') return t.statusUnavailable;
    const s = status.trim().toUpperCase();
    if (s === 'ARCHIVED') return t.statusVaultArchived;
    if (s === 'LOCKED') return t.statusVaultLocked;
    if (s === 'OPEN' || s === 'UNLOCKED') return t.statusVaultOpen;
    return t.statusUnavailable;
  };

  const resolveCaseLabel = (status) => {
    if (typeof status !== 'string') return t.statusUnavailable;
    const s = status.trim().toUpperCase();
    if (s === 'CLOSED') return t.statusCaseClosed;
    if (s === 'IN_PROGRESS' || s === 'OPEN') return t.statusCaseInProgress;
    return t.statusUnavailable;
  };

  // 1. Tạo biên bản bàn giao của Staff (POST /receipts)
  const handleCreateReceipt = async () => {
    if (isArchived || isCreatingReceipt || !caseId || !sessionId) return;
    setIsCreatingReceipt(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const newReceipt = await createHandoverReceipt(caseId, sessionId, {
        recipientId: 'ben-001',
        assetIds: ['ast-001', 'ast-002', 'ast-003'],
      }, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
      });

      setFetchedReceipts((prev) => [newReceipt, ...(prev || [])]);
      setActionSuccess(lang === 'en' ? 'Handover attestation receipt created successfully.' : 'Đã lập biên bản xác nhận bàn giao của Nhân viên quầy thành công.');
    } catch (err) {
      setActionError(err.message || (lang === 'en' ? 'Failed to create receipt.' : 'Lập biên bản bàn giao thất bại.'));
    } finally {
      setIsCreatingReceipt(false);
    }
  };

  // 2. Đóng phiên bàn giao (POST /close)
  const handleCloseSession = async () => {
    if (isArchived || isClosingSession || sessionStatus === 'COMPLETED' || !caseId || !sessionId) return;
    setIsClosingSession(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      const closeRes = await closeHandoverSession(caseId, sessionId, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
      });

      setSessionStatus('COMPLETED');
      setActionSuccess(lang === 'en' ? `Handover session ${closeRes.sessionId} closed successfully.` : `Phiên bàn giao ${closeRes.sessionId} đã được đóng thành công với bằng chứng kiểm toán.`);
    } catch (err) {
      setActionError(err.message || (lang === 'en' ? 'Failed to close handover session.' : 'Đóng phiên bàn giao thất bại.'));
    } finally {
      setIsClosingSession(false);
    }
  };

  // 3. Lưu trữ kho di sản và đóng ca (POST /archive)
  const handleArchiveCase = async () => {
    if (isArchived || isArchiving || sessionStatus !== 'COMPLETED' || !caseId || !sessionId) return;
    setIsArchiving(true);
    setActionSuccess(null);
    setActionError(null);

    try {
      await archiveHandoverCase(caseId, sessionId, {
        accessToken: effectiveAccessToken,
        isDevPreview: effectiveIsDevPreview,
        lang,
      });

      setVaultStatus('ARCHIVED');
      setCaseStatus('CLOSED');
      setActionSuccess(lang === 'en' ? 'Vault archived and verification case permanently closed.' : 'Đã lưu trữ kho di sản và hoàn tất đóng ca xác minh thành công. Hồ sơ chuyển sang chế độ Chỉ đọc.');
    } catch (err) {
      setActionError(err.message || (lang === 'en' ? 'Failed to archive vault.' : 'Lưu trữ kho di sản thất bại.'));
    } finally {
      setIsArchiving(false);
    }
  };

  const hasReceipts = Array.isArray(receipts) && receipts.length > 0;
  const isDualGateReady = isAssetComplete && isBeneficiaryComplete;
  const canCloseSession = !isArchived && sessionStatus !== 'COMPLETED' && isDualGateReady && hasReceipts;
  const canArchive = !isArchived && sessionStatus === 'COMPLETED';

  return (
    <div className="lv-close-archive-view">
      {/* Context navigation back */}
      <div style={{ marginBottom: '12px', display: 'flex', gap: '12px', alignItems: 'center' }}>
        {caseId && sessionId && (
          <a
            href={`/staff/handover?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(sessionId)}${effectiveIsDevPreview ? '&preview=true' : ''}`}
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

      {/* Warning when context is missing in real mode */}
      {(!caseId || !sessionId) && !effectiveIsDevPreview && (
        <section className="lv-ca-card" style={{ marginBottom: '16px', borderLeft: '4px solid #f59e0b' }}>
          <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
            <AlertTriangle size={24} style={{ color: '#d97706', flexShrink: 0 }} aria-hidden="true" />
            <div>
              <h3 style={{ margin: '0 0 4px', fontSize: '15px', fontWeight: 600, color: '#92400e' }}>
                {lang === 'en' ? 'No Handover Session Context' : 'Chưa có thông tin phiên bàn giao'}
              </h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#78350f' }}>
                {lang === 'en'
                  ? 'Please select a verification case and open a counter handover session from the Staff Dashboard to proceed.'
                  : 'Vui lòng chọn hồ sơ xác minh và mở phiên bàn giao tại quầy từ Bàn làm việc Nhân viên để thực hiện đóng và lưu trữ kho di sản.'}
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
      <header className="lv-ca-header">
        <h1 className="lv-ca-title">{t.pageTitle}</h1>
        <p className="lv-ca-subtitle">{t.pageSubtitle}</p>
      </header>

      {/* Read-Only Banner when Archived */}
      {isArchived && (
        <section className="lv-ca-archive-banner" role="status" aria-labelledby="archive-banner-heading">
          <Lock size={22} className="lv-ca-archive-banner__icon" aria-hidden="true" />
          <div>
            <h2 id="archive-banner-heading" className="lv-ca-archive-banner__title">
              {t.readOnlyBannerTitle}
            </h2>
            <p>{t.readOnlyBannerBody}</p>
          </div>
        </section>
      )}

      {/* Action feedback banner */}
      {actionSuccess && (
        <div className="lv-api-status-banner lv-api-status-banner--success" role="status" style={{ backgroundColor: '#ecfdf5', color: '#065f46', border: '1px solid #a7f3d0', padding: '12px 18px', borderRadius: '10px', marginBottom: '16px' }}>
          <CheckCircle2 size={16} aria-hidden="true" style={{ display: 'inline', marginRight: '8px' }} />
          <span>{actionSuccess}</span>
        </div>
      )}
      {actionError && (
        <div className="lv-api-status-banner lv-api-status-banner--error" role="alert" style={{ backgroundColor: '#fef2f2', color: '#991b1b', border: '1px solid #fecaca', padding: '12px 18px', borderRadius: '10px', marginBottom: '16px' }}>
          <AlertTriangle size={16} aria-hidden="true" style={{ display: 'inline', marginRight: '8px' }} />
          <span>{actionError}</span>
        </div>
      )}

      {/* 1. Server Status Dashboard */}
      <section className="lv-ca-card" aria-labelledby="server-status-heading">
        <h2 id="server-status-heading" className="lv-ca-card__title">
          {t.serverStatusHeading}
        </h2>
        <div className="lv-ca-server-grid">
          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.labelSessionStatus}</span>
            <span className="lv-ca-status-box__val">
              {resolveSessionLabel(sessionStatus)}
            </span>
          </div>

          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.labelVaultStatus}</span>
            <span className="lv-ca-status-box__val">
              {resolveVaultLabel(vaultStatus)}
            </span>
          </div>

          <div className="lv-ca-status-box">
            <span className="lv-ca-status-box__label">{t.labelCaseStatus}</span>
            <span className="lv-ca-status-box__val">
              {resolveCaseLabel(caseStatus)}
            </span>
          </div>
        </div>
      </section>

      {/* 2. Pre-Conditions & Dual Gate Evaluation */}
      <section className="lv-ca-card" aria-labelledby="preconditions-heading">
        <h2 id="preconditions-heading" className="lv-ca-card__title">
          {t.preconditionsHeading}
        </h2>
        <p className="lv-ca-card__desc">{t.preconditionsDesc}</p>

        <div className="lv-ca-preconditions-grid">
          <div className={`lv-ca-check-item ${isAssetComplete ? 'is-met' : 'is-unmet'}`}>
            <span className="lv-ca-check-item__icon">
              {isAssetComplete ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <Clock size={16} aria-hidden="true" />
              )}
            </span>
            <div className="lv-ca-check-item__text">
              <strong>{t.condAssetGateTitle}</strong>
              <p>
                {isAssetComplete
                  ? t.condAssetGateMet
                  : t.condAssetGateUnmet}
              </p>
            </div>
          </div>

          <div className={`lv-ca-check-item ${isBeneficiaryComplete ? 'is-met' : 'is-unmet'}`}>
            <span className="lv-ca-check-item__icon">
              {isBeneficiaryComplete ? (
                <CheckCircle2 size={16} aria-hidden="true" />
              ) : (
                <Clock size={16} aria-hidden="true" />
              )}
            </span>
            <div className="lv-ca-check-item__text">
              <strong>{t.condBeneficiaryGateTitle}</strong>
              <p>
                {isBeneficiaryComplete
                  ? t.condBeneficiaryGateMet
                  : t.condBeneficiaryGateUnmet}
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Receipt Summary Section */}
      <section className="lv-ca-card" aria-labelledby="receipt-summary-heading">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 id="receipt-summary-heading" className="lv-ca-card__title" style={{ margin: 0 }}>
              {t.receiptSummaryHeading}
            </h2>
            <p className="lv-ca-card__desc" style={{ margin: '4px 0 0' }}>{t.receiptSummaryDesc}</p>
          </div>
          {!isArchived && (
            <button
              type="button"
              className="lv-ca-btn-receipt"
              onClick={handleCreateReceipt}
              disabled={isCreatingReceipt || !isDualGateReady}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: isDualGateReady ? '#164639' : '#e2e8f0',
                color: isDualGateReady ? '#ffffff' : '#94a3b8',
                border: 'none',
                cursor: isDualGateReady ? 'pointer' : 'not-allowed',
              }}
            >
              {isCreatingReceipt ? (
                <>
                  <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
                  <span>{lang === 'en' ? 'Creating...' : 'Đang lập...'}</span>
                </>
              ) : (
                <>
                  <FileCheck size={14} aria-hidden="true" />
                  <span>{lang === 'en' ? 'Generate Staff Receipt' : 'Lập biên bản xác nhận'}</span>
                </>
              )}
            </button>
          )}
        </div>

        {!hasReceipts ? (
          <div className="lv-ca-empty-box" role="status">
            <FileText size={32} aria-hidden="true" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3>{t.receiptEmptyTitle}</h3>
            <p>{t.receiptEmptyDesc}</p>
          </div>
        ) : (
          <div className="lv-ca-table-wrapper">
            <table className="lv-ca-table">
              <thead>
                <tr>
                  <th scope="col">{t.thReceiptCode}</th>
                  <th scope="col">{t.thType}</th>
                  <th scope="col">{t.thRecipient}</th>
                  <th scope="col">{t.thIssuedDate}</th>
                  <th scope="col">{t.thStatus}</th>
                </tr>
              </thead>
              <tbody>
                {receipts.map((rc, idx) => (
                  <tr key={rc.receiptId || rc.id || rc.code || idx}>
                    <td>
                      <span className="lv-ca-code-badge">{rc.receiptId || rc.code || 'REC-STAFF'}</span>
                    </td>
                    <td>
                      {rc.attestationType || 'STAFF_ATTESTATION'}
                    </td>
                    <td>{rc.recipientId || rc.recipient || 'ben-001'}</td>
                    <td>{rc.createdAt ? new Date(rc.createdAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN') : t.statusUnavailable}</td>
                    <td>
                      <span className="lv-ca-tag">
                        {lang === 'en' ? 'VERIFIED' : 'HỢP LỆ'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Sequential Business Completion Actions */}
      <section className="lv-ca-card" aria-labelledby="action-heading">
        <h2 id="action-heading" className="lv-ca-card__title">
          {t.actionHeading}
        </h2>

        {isArchived ? (
          <div className="lv-ca-action-box">
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#065f46', fontWeight: 600 }}>
              <CheckCircle2 size={18} aria-hidden="true" />
              <span>{lang === 'en' ? 'Case and Vault are fully closed and archived. Read-only view.' : 'Ca xác minh và Kho di sản đã được đóng và lưu trữ hoàn tất. Chế độ chỉ đọc.'}</span>
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginTop: '12px' }}>
            {/* Action Step 1: Close Handover Session */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <strong style={{ fontSize: '14.5px', color: '#1e293b' }}>
                  {lang === 'en' ? 'Step 1: Close Handover Session' : 'Bước 1: Đóng phiên bàn giao'}
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  {sessionStatus === 'COMPLETED'
                    ? (lang === 'en' ? 'Session successfully closed with audit proof.' : 'Phiên đã được đóng thành công với bằng chứng kiểm toán.')
                    : (lang === 'en' ? 'Requires dual completion gates and staff attestation receipt.' : 'Yêu cầu đủ 2 cổng nghiệm thu kép và biên bản xác nhận của Nhân viên quầy.')}
                </p>
              </div>

              {sessionStatus === 'COMPLETED' ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '13px', fontWeight: 600, color: '#059669', background: '#d1fae5', padding: '6px 12px', borderRadius: '6px' }}>
                  <CheckCircle2 size={14} aria-hidden="true" />
                  <span>{lang === 'en' ? 'Session Completed' : 'Phiên đã đóng'}</span>
                </span>
              ) : (
                <button
                  type="button"
                  className="lv-ca-btn-primary"
                  onClick={handleCloseSession}
                  disabled={!canCloseSession || isClosingSession}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    borderRadius: '8px',
                    fontSize: '13.5px',
                    fontWeight: 600,
                    backgroundColor: canCloseSession ? '#2563eb' : '#e2e8f0',
                    color: canCloseSession ? '#ffffff' : '#94a3b8',
                    border: 'none',
                    cursor: canCloseSession ? 'pointer' : 'not-allowed',
                  }}
                >
                  {isClosingSession ? (
                    <>
                      <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
                      <span>{lang === 'en' ? 'Closing...' : 'Đang đóng phiên...'}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>{lang === 'en' ? 'Close Handover Session' : 'Đóng phiên bàn giao'}</span>
                    </>
                  )}
                </button>
              )}
            </div>

            {/* Action Step 2: Atomic Archive & Case Close */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '10px', flexWrap: 'wrap', gap: '12px' }}>
              <div>
                <strong style={{ fontSize: '14.5px', color: '#1e293b' }}>
                  {lang === 'en' ? 'Step 2: Archive Vault & Close Case' : 'Bước 2: Lưu trữ kho di sản & Đóng ca'}
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  {lang === 'en' ? 'Permanently archives the vault and closes the case. Available after session completion.' : 'Lưu trữ vĩnh viễn kho di sản và hoàn tất đóng ca xác minh. Kích hoạt sau khi phiên đã đóng.'}
                </p>
              </div>

              <button
                type="button"
                className="lv-ca-btn-primary"
                onClick={handleArchiveCase}
                disabled={!canArchive || isArchiving}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 18px',
                  borderRadius: '8px',
                  fontSize: '13.5px',
                  fontWeight: 600,
                  backgroundColor: canArchive ? '#164639' : '#e2e8f0',
                  color: canArchive ? '#ffffff' : '#94a3b8',
                  border: 'none',
                  cursor: canArchive ? 'pointer' : 'not-allowed',
                }}
              >
                {isArchiving ? (
                  <>
                    <RefreshCw size={14} className="lv-spin" aria-hidden="true" />
                    <span>{lang === 'en' ? 'Archiving...' : 'Đang lưu trữ...'}</span>
                  </>
                ) : (
                  <>
                    <Archive size={14} aria-hidden="true" />
                    <span>{t.btnExecuteCloseArchive}</span>
                  </>
                )}
              </button>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
