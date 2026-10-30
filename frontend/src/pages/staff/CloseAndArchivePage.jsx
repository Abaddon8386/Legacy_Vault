import { useState, useEffect, useRef } from 'react';
import { Archive, CheckCircle2, Clock, AlertTriangle, FileText, Lock, RefreshCw, FileCheck, ArrowLeft } from 'lucide-react';
import { evaluateCloseArchivePreconditions, isCaseArchived } from '../../utils/closeAndArchiveValidation.js';
import { fetchHandoverReceipts, fetchCompletionProgress, fetchHandoverSession, fetchHandoverDeliveries, createHandoverReceipt, closeHandoverSession, archiveHandoverCase, isCounterHandoverSimulationPermitted } from './handoverSessionService.js';
import { loadStaffCase } from './staffLiveService.js';
import { fetchStaffCaseBeneficiaries } from './liveHandoverService.js';
import { closeAndArchiveI18n } from './closeAndArchiveI18n.js';
import { workflowFailure } from '../../utils/workflowFeedback.js';
import StaffCaseSelectorModal from '../../components/staff/StaffCaseSelectorModal.jsx';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import './CloseAndArchivePage.css';
import StaffWorkflowGuide from '../../components/staff/StaffWorkflowGuide.jsx';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';

const isUuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

// Context owns the whole page lifetime, including pending mutations and private state.
export default function CloseAndArchivePage(props) {
  const token = props.accessToken || props.session?.accessToken || null;
  const preview = isCounterHandoverSimulationPermitted({accessToken: token, isDevPreview: props.preview || props.isDevPreview});
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const caseId = props.caseId || query.get('caseId') || (preview ? '6f1a4c2d-0000-4000-8000-000000000001' : '');
  const sessionId = props.sessionId || query.get('sessionId') || (preview ? 'HDS-2026-001' : '');
  return <CloseArchiveContext key={JSON.stringify([props.session?.user?.id, token, caseId, sessionId, preview])}
    {...props} caseId={caseId} sessionId={sessionId} effectiveAccessToken={token} effectiveIsDevPreview={preview} />;
}

function CloseArchiveContext({
  lang = 'vi', caseId, sessionId, effectiveAccessToken, effectiveIsDevPreview,
  caseItem: propCaseItem = null,
  sessionStatus: propSessionStatus = null, vaultStatus: propVaultStatus = null,
  caseStatus: propCaseStatus = null, assetData = null, beneficiaryData = null,
  receipts: propReceipts = null, recipientId: propRecipientId = '', assetIds: propAssetIds = [],
  onCaseChange = null, onUnauthorized = null,
  onNavigateCases = null,
}) {
  const t = closeAndArchiveI18n[lang] || closeAndArchiveI18n.vi;
  const [isSelectorOpen, setIsSelectorOpen] = useState(false);
  const [server, setServer] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  const [busy, setBusy] = useState('');
  const [actionSuccess, setActionSuccess] = useState(null);
  const [actionError, setActionError] = useState(null);
  const [selectedRecipient, setSelectedRecipient] = useState(propRecipientId);
  const alive = useRef(false);
  const mutation = useRef(null);
  const options = {accessToken: effectiveAccessToken, isDevPreview: effectiveIsDevPreview, lang};
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; mutation.current?.abort(); };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    if (!caseId || !sessionId) return () => controller.abort();
    const opts = {accessToken: effectiveAccessToken, isDevPreview: effectiveIsDevPreview, lang, signal: controller.signal};
    async function load() {
      try {
        await Promise.resolve();
        if (controller.signal.aborted) return;
        setLoading(true);
        setLoadError(null);
        const [session, caseInfo, receipts, deliveries] = await Promise.all([
          propSessionStatus ? Promise.resolve({status: propSessionStatus}) : fetchHandoverSession(caseId, sessionId, opts),
          propCaseStatus ? Promise.resolve({status: propCaseStatus}) :
            effectiveIsDevPreview ? Promise.resolve({status: 'OPEN'}) : loadStaffCase(caseId, opts),
          propReceipts !== null ? Promise.resolve(propReceipts) : fetchHandoverReceipts(caseId, sessionId, opts),
          fetchHandoverDeliveries(caseId, sessionId, opts),
        ]);
        // Progress requires a current workflow and can conflict after archival. History remains readable.
        const closed = caseInfo.status === 'CLOSED' || propVaultStatus === 'ARCHIVED';
        const people = closed || effectiveIsDevPreview || propCaseStatus ? []
          : await fetchStaffCaseBeneficiaries(caseId, opts).catch(() => []);
        const progress = closed ? null : assetData && beneficiaryData
          ? {assets: assetData, beneficiaries: beneficiaryData}
          : await fetchCompletionProgress(caseId, sessionId, opts);
        if (controller.signal.aborted) return;
        setServer({revision, caseInfo, sessionStatus: session.status, caseStatus: caseInfo.status, vaultStatus: caseInfo.vaultStatus, people, receipts, deliveries, progress});
      } catch (error) {
        if (!controller.signal.aborted) { setServer(null); setLoadError(error); }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    load();
    return () => controller.abort();
  }, [caseId, sessionId, effectiveAccessToken, effectiveIsDevPreview, lang, revision,
    propSessionStatus, propCaseStatus, propVaultStatus, propReceipts, assetData, beneficiaryData, t.contextRequired, t.loadFailed]);

  const sessionStatus = server?.sessionStatus || propSessionStatus || '';
  const caseStatus = server?.caseStatus || propCaseStatus || '';
  const vaultStatus = server?.vaultStatus || propVaultStatus || '';
  const isArchived = isCaseArchived(vaultStatus, caseStatus);
  const receipts = server?.receipts || [];
  const recipientName = id => receipts.find(r => r.recipientId === id && r.recipientName)?.recipientName || server?.people?.find(person => person.beneficiaryId === id)?.fullName || id;
  const {isAssetComplete, isBeneficiaryComplete} = evaluateCloseArchivePreconditions(
    server?.progress?.assets || {}, server?.progress?.beneficiaries || {});
  const groups = new Map();
  for (const item of server?.deliveries || []) {
    if (item.status !== 'DELIVERED') continue;
    const assets = groups.get(item.recipientId) || [];
    if (!assets.includes(item.assetId)) assets.push(item.assetId);
    groups.set(item.recipientId, assets);
  }
  // Explicit target props are only a selection, never authority to invent a relationship.
  const targetRecipientId = selectedRecipient;
  const targetAssetIds = (groups.get(targetRecipientId) || []).filter(id => !propAssetIds.length || propAssetIds.includes(id));
  const superseded = new Set(receipts.map(r => r.supersedesReceiptId).filter(Boolean));
  const covered = (recipient, asset) => receipts.some(r => !superseded.has(r.receiptId) && r.recipientId === recipient && r.assetIds?.includes(asset));
  const uncoveredAssetIds = targetAssetIds.filter(id => !covered(targetRecipientId, id));
  const hasValidReceiptTarget = isUuid(targetRecipientId) && uncoveredAssetIds.length > 0 && uncoveredAssetIds.every(isUuid);
  const hasReceipts = receipts.length > 0;
  const allDeliveredCovered = groups.size > 0 && [...groups].every(([recipient, assets]) => assets.every(asset => covered(recipient, asset)));
  const isDualGateReady = Boolean(isAssetComplete && isBeneficiaryComplete);
  const ready = !loading && !loadError && server?.revision === revision && !busy && !isArchived && caseStatus === 'OPEN';
  const canCloseSession = ready && sessionStatus === 'OPEN' && isDualGateReady;
  const canCreateReceipt = ready && sessionStatus === 'COMPLETED' && isDualGateReady && hasValidReceiptTarget;
  // BE rechecks coverage against the current full allocation snapshot under lock.
  const canArchive = ready && sessionStatus === 'COMPLETED' && isDualGateReady && hasReceipts && allDeliveredCovered;
  const say = (vi, en) => lang === 'en' ? en : vi;
  const commonBlock = loading || busy ? say('Chờ kiểm tra hoặc ghi nhận hoàn tất.', 'Wait for loading or saving to finish.')
    : loadError || !server ? say('Tải lại để kiểm tra trạng thái hồ sơ.', 'Reload to check the case status.')
      : isArchived ? say('Hồ sơ đã đóng/lưu trữ; chỉ xem lịch sử.', 'Closed or archived record; history is read-only.')
        : !isDualGateReady ? say('Cần đủ bàn giao và xác nhận đã nhận trước khi đóng phiên.', 'Complete both delivery and receipt confirmation before closing.') : '';
  const closeBlock = canCloseSession ? '' : commonBlock || say('Phiên không ở trạng thái đang mở.', 'The session is not open.');
  const receiptBlock = canCreateReceipt ? '' : commonBlock || (sessionStatus !== 'COMPLETED'
    ? say('Đóng phiên trước khi lập biên nhận Staff.', 'Close the session before creating a Staff receipt.')
    : say('Chọn người nhận có phần tài sản đã giao để lập biên nhận.', 'Select a recipient with delivered items for the receipt.'));
  const archiveBlock = canArchive ? '' : commonBlock || (sessionStatus !== 'COMPLETED'
    ? say('Đóng phiên trước khi lưu trữ.', 'Close the session before archiving.')
    : say('Cần biên nhận Staff bao phủ đầy đủ phần tài sản đã giao.', 'Staff receipts must cover all delivered items.'));
  const isCreatingReceipt = busy === 'receipt', isClosingSession = busy === 'close', isArchiving = busy === 'archive';
  async function execute(kind, permitted, work) {
    if (!permitted || mutation.current) return;
    const controller = new AbortController();
    mutation.current = controller;
    setBusy(kind); setActionError(null); setActionSuccess(null);
    try {
      await work({...options, signal: controller.signal});
      if (!alive.current || controller.signal.aborted) return;
      setActionSuccess(kind === 'close' ? say('Đã đóng phiên bàn giao. Hồ sơ chưa đóng: hoàn tất biên nhận rồi bấm Đóng & Lưu trữ hồ sơ.', 'Handover session closed. The case remains open: complete its receipts, then close and archive the case.') : kind === 'archive' ? say('Đã đóng hồ sơ và lưu trữ kho di sản.', 'Case closed and vault archived.') : t.saved);
      setRevision(value => value + 1);
    } catch (error) {
      if (alive.current && !controller.signal.aborted) {
        setActionError(error.message || t.loadFailed);
        // A rejected mutation may mean the server scope/approval changed.
        setRevision(value => value + 1);
      }
    } finally {
      if (alive.current && !controller.signal.aborted) { mutation.current = null; setBusy(''); }
    }
  }
  const handleCreateReceipt = () => execute('receipt', canCreateReceipt,
    opts => createHandoverReceipt(caseId, sessionId, {recipientId: targetRecipientId, assetIds: uncoveredAssetIds}, opts));
  const handleCloseSession = () => execute('close', canCloseSession, opts => closeHandoverSession(caseId, sessionId, opts));
  const handleArchiveCase = () => execute('archive', canArchive, opts => archiveHandoverCase(caseId, sessionId, opts));
  const resolveSessionLabel = status => ({OPEN:t.statusSessionActive, COMPLETED:t.statusSessionCompleted, CANCELLED:t.cancelled}[status] || t.statusUnavailable);
  const resolveVaultLabel = status => ({ARCHIVED:t.statusVaultArchived, UNLOCKED:t.statusVaultOpen, HANDOVER_IN_PROGRESS:t.statusSessionInProgress, LOCKED:t.statusVaultLocked}[status] || t.statusUnavailable);
  const resolveCaseLabel = status => ({OPEN:t.statusCaseInProgress, CLOSED:t.statusCaseClosed, CANCELLED:t.cancelled}[status] || t.statusUnavailable);

  if (!caseId || !sessionId) return <section className="lv-staff-context-state" role="status"><h1>{lang === 'en' ? 'Select a case and handover session' : 'Chọn hồ sơ và phiên bàn giao'}</h1><p>{lang === 'en' ? 'Case completion becomes available after the preceding handover steps.' : 'Hoàn tất hồ sơ được thực hiện sau các bước bàn giao và ký nhận. Chưa chọn phiên không phải lỗi hệ thống.'}</p><div className="lv-staff-context-state__actions"><a href={`/staff/handover${caseId ? '?caseId='+encodeURIComponent(caseId) : ''}`}>{lang === 'en' ? 'Go to counter handover' : 'Đến bàn giao tại quầy'}</a></div></section>;
  if (loadError) {
    const feedback = workflowFailure(loadError, lang);
    return <section className="lv-staff-context-state" role={feedback.kind === 'waiting' || feedback.kind === 'changed' ? 'status' : 'alert'}><h1>{feedback.title}</h1><p>{feedback.description}</p><div className="lv-staff-context-state__actions"><button type="button" onClick={() => setRevision(value => value + 1)}>{t.retry}</button><a href="/staff/cases">{lang === 'en' ? 'Choose case' : 'Chọn lại hồ sơ'}</a></div></section>;
  }
  if (loading) return <section className="lv-staff-context-state" role="status"><h1>{lang === 'en' ? 'Loading case completion…' : 'Đang tải thông tin hoàn tất hồ sơ…'}</h1></section>;
  return (
    <div className="lv-close-archive-view">
      <StaffWorkflowGuide current="archive" caseId={caseId} sessionId={sessionId} lang={lang} preview={effectiveIsDevPreview && !effectiveAccessToken}
        caseStatus={caseStatus} vaultStatus={vaultStatus} sessionStatus={sessionStatus} loading={loading} error={loadError}
        assets={server?.progress?.assets} beneficiaries={server?.progress?.beneficiaries} hasReceipts={hasReceipts} canArchive={canArchive} />
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
      </header>

      {/* Staff Case Context Bar */}
      <StaffCaseContextBar
        caseId={caseId}
        caseItem={propCaseItem || server?.caseInfo}
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
        currentCaseId={caseId}
        onUnauthorized={onUnauthorized}
      />
      {effectiveIsDevPreview && <p role="status">{t.demo}</p>}
      {loading && <p role="status">{t.loading}</p>}
      {loadError && <div role="alert"><p>{t.loadFailed}</p><button type="button" onClick={() => setRevision(value => value + 1)}>{t.retry}</button></div>}

      {/* Read-Only Banner when Archived */}
      {isArchived && (
        <section className="lv-ca-archive-banner" role="status" aria-labelledby="archive-banner-heading">
          <Lock size={22} className="lv-ca-archive-banner__icon" aria-hidden="true" />
          <div>
            <h2 id="archive-banner-heading" className="lv-ca-archive-banner__title">
              {t.readOnlyBannerTitle}
            </h2>
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
      <section className="lv-ca-card lv-staff-glow" aria-labelledby="server-status-heading">
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
      {!isArchived && <section className="lv-ca-card lv-staff-glow" aria-labelledby="preconditions-heading">
        <h2 id="preconditions-heading" className="lv-ca-card__title">
          {t.preconditionsHeading}
        </h2>

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
      </section>}

      {/* 3. Receipt Summary Section */}
      <section className="lv-ca-card lv-staff-glow" aria-labelledby="receipt-summary-heading">
        {!isArchived && <div className="lv-ca-recipient-field">
          <label htmlFor="staff-receipt-recipient">{t.recipientLabel}</label>
          <select id="staff-receipt-recipient" value={selectedRecipient} onChange={event => setSelectedRecipient(event.target.value)} disabled={loading || !!busy}>
            <option value="">{t.selectRecipient}</option>
            {[...groups.keys()].map(id => <option key={id} value={id}>{recipientName(id)}</option>)}
          </select>
          {selectedRecipient && <p>{t.receiptScope}: {targetAssetIds.length}</p>}
        </div>}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '8px', flexWrap: 'wrap', gap: '8px' }}>
          <div>
            <h2 id="receipt-summary-heading" className="lv-ca-card__title" style={{ margin: 0 }}>
              {t.receiptSummaryHeading}
            </h2>
          </div>
          <WorkflowActionHint id="receipt-action-blocked" reason={receiptBlock} />
          {!isArchived && (
            <button
              type="button"
              className="lv-ca-btn-receipt"
              onClick={handleCreateReceipt}
              aria-describedby={receiptBlock ? 'receipt-action-blocked' : undefined}
              disabled={isCreatingReceipt || !canCreateReceipt}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: canCreateReceipt ? '#164639' : '#e2e8f0',
                color: canCreateReceipt ? '#ffffff' : '#94a3b8',
                border: 'none',
                cursor: canCreateReceipt ? 'pointer' : 'not-allowed',
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
                    <span>{t.receiptBtnText}</span>
                </>
              )}
            </button>
          )}
        </div>

        {!hasReceipts ? (
          <div className="lv-ca-empty-box" role="status">
            <FileText size={32} aria-hidden="true" style={{ margin: '0 auto 12px', opacity: 0.4 }} />
            <h3>{t.receiptEmptyTitle}</h3>
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
                      <span className="lv-ca-code-badge">{rc.code || `${lang === 'en' ? 'Receipt' : 'Biên nhận'} ${String(idx + 1).padStart(2, '0')}`}</span>
                    </td>
                    <td>
                      {rc.attestationType === 'STAFF_ATTESTATION' || !rc.attestationType ? (lang === 'en' ? 'Counter confirmation' : 'Xác nhận tại quầy') : (lang === 'en' ? 'Handover receipt' : 'Biên nhận bàn giao')}
                    </td>
                    <td>{rc.recipientName?.trim() || server?.people?.find(person => person.beneficiaryId === rc.recipientId)?.fullName || (lang === 'en' ? 'Name unavailable' : 'Chưa có tên người nhận')}</td>
                    <td>{rc.confirmedAt ? new Date(rc.confirmedAt).toLocaleDateString(lang === 'en' ? 'en-US' : 'vi-VN') : t.statusUnavailable}</td>
                    <td>
                      <span className="lv-ca-tag">
                        {t.receiptIssued}
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
      {!isArchived && <section className="lv-ca-card" aria-labelledby="action-heading">
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
                    : t.step1DescPending}
                </p>
              </div>

              <WorkflowActionHint id="close-action-blocked" reason={closeBlock} />
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
                  aria-describedby={closeBlock ? 'close-action-blocked' : undefined}
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
                  {lang === 'en' ? 'Complete case' : 'Hoàn tất hồ sơ'}
                </strong>
                <p style={{ margin: '4px 0 0', fontSize: '13px', color: '#64748b' }}>
                  {t.step2Desc}
                </p>
              </div>

              <WorkflowActionHint id="archive-action-blocked" reason={archiveBlock} />
              <button
                type="button"
                className="lv-ca-btn-primary"
                onClick={handleArchiveCase}
                aria-describedby={archiveBlock ? 'archive-action-blocked' : undefined}
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
      </section>}
    </div>
  );
}
