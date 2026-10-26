import { useEffect, useRef, useState } from 'react';
import { decideLegalApproval, loadLegalContext, unlockLegalVault } from './legalLiveService.js';
import { LegalRecordDetails } from './LegalRecordDetails.jsx';
import { legalBlocker, legalDate, legalReadOnly, legalStatus } from './legalPresentation.js';
import { LEGAL_NAVIGATION_REGISTRY, legalStepTitle } from '../../utils/legalNavigation.js';
import { Modal } from '../../components/common/Modal.jsx';
import LegalEvidenceFiles from './LegalEvidenceFiles.jsx';
import LegalAllocations from './LegalAllocations.jsx';
import { ArrowRight, FileCheck2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import { legalBlockedReason } from '../../utils/workflowGuidance.js';

// Exclude evaluatedAt: each read has a new clock value, not a new approval scope.
function legalDecisionScope(value) {
  const snapshot = value.snapshot;
  return JSON.stringify([value.caseId, value.vaultId, value.caseStatus, value.vaultStatus,
    value.basisDossier?.id, value.basisDossier?.route, value.basisDossier?.status,
    snapshot?.currentVersion, snapshot?.requiredVersion, snapshot?.sha256Hash?.toLowerCase(), snapshot?.allocationHash?.toLowerCase(),
    snapshot?.disputeStatus, snapshot?.reviewStatus, snapshot?.reviewFresh, snapshot?.approvalCurrent,
    snapshot?.courtResult, snapshot?.latestDecision?.id, snapshot?.latestDecision?.result,
    value.capabilities.approval.allowed, value.capabilities.approval.blockedReason,
    value.capabilities.unlock.allowed, value.capabilities.unlock.blockedReason]);
}

export default function LegalFinalDecision({ session, context, step, lang, draft, setDraft, onReload, onSaved, onUnauthorized, onDenied, onContextChanged }) {
  const en = lang === 'en', unlocking = step === 'controlled-unlock';
  const { decision = '', reason = '', confirmed = false } = draft;
  const setDecision = value => setDraft(previous => ({ ...previous, decision: value }));
  const setReason = value => setDraft(previous => ({ ...previous, reason: value }));
  const setConfirmed = value => setDraft(previous => ({ ...previous, confirmed: value }));
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const controller = useRef(null), lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const capability = context.capabilities[unlocking ? 'unlock' : 'approval'];
  const readOnly = legalReadOnly(context);
  const allowed = capability.allowed && !needsReload && !pending && !readOnly;
  const complete = unlocking ? confirmed : ['APPROVE', 'REJECT'].includes(decision) && (decision !== 'REJECT' || reason.trim());
  const blocker = legalBlocker(capability.blockedReason, en);
  const blockerPath = LEGAL_NAVIGATION_REGISTRY.find(item => item.id === blocker.step)?.path;
  const blockerUrl = blockerPath ? `${blockerPath}?${new URLSearchParams({ caseId: context.caseId, lang })}` : null;
  const documentVersion = context.basisDossier?.versions?.find(item => item.version === context.snapshot?.currentVersion);
  const blocked = pending ? (en ? 'Wait for the current operation.' : 'Chờ thao tác hiện tại hoàn tất.')
    : needsReload ? (en ? 'Reload the record before continuing.' : 'Tải lại hồ sơ trước khi tiếp tục.')
      : !capability.allowed ? legalBlockedReason(context, unlocking ? 'unlock' : 'approval', lang)
        : !complete ? unlocking ? (en ? 'Confirm the unlocking checkbox.' : 'Đánh dấu xác nhận mở khóa.')
          : decision === 'REJECT' ? (en ? 'Enter the rejection reason.' : 'Nhập lý do từ chối.')
            : (en ? 'Select a decision.' : 'Chọn quyết định.') : '';
  async function submit() {
    if (!allowed || !complete || lock.current) return;
    setConfirmOpen(false);
    lock.current = true;
    const current = new AbortController(); controller.current = current;
    setPending(true); setError(null); setResult(null);
    const options = { accessToken: session.accessToken, roles: session.user.roles, userId: session.user.id, lang, signal: current.signal };
    try {
      const fresh = await loadLegalContext(context.caseId, options);
      if (current.signal.aborted) return;
      if (legalDecisionScope(fresh) !== legalDecisionScope(context) || !fresh.capabilities[unlocking ? 'unlock' : 'approval'].allowed) {
        throw Object.assign(new Error('LEGAL_DECISION_STALE'), { status: 409 });
      }
      const receipt = unlocking ? await unlockLegalVault(context.caseId, { ...options, vaultId: context.vaultId })
        : await decideLegalApproval(context.caseId, { decision, reason, versionNo: context.snapshot.currentVersion,
          sha256Hash: context.snapshot.sha256Hash, allocationHash: context.snapshot.allocationHash }, { ...options, dossierId: context.snapshot.dossierId });
      if (current.signal.aborted) return;
      setResult(receipt); setNeedsReload(true);
      onSaved(receipt);
    } catch (failure) {
      if (current.signal.aborted) return;
      setError(failure); setNeedsReload(true); onContextChanged?.();
      if (failure.status === 401) onUnauthorized?.();
      if (failure.status === 403) onDenied?.(failure);
    } finally {
      if (!current.signal.aborted) { lock.current = false; setPending(false); }
    }
  }
  const denied = error && [401, 403, 404].includes(error.status);
  return <div className={`lv-legal-workspace${readOnly || denied ? ' is-readonly' : ''}`} aria-busy={pending}>
    {pending && <p role="status">{en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{error.status === 409
      ? (en ? 'The record changed or is no longer eligible. Reload before continuing.' : 'Hồ sơ đã thay đổi hoặc không còn đủ điều kiện. Hãy tải lại trước khi tiếp tục.')
      : (en ? 'The operation could not be confirmed. Reload the record before retrying.' : 'Chưa xác nhận được kết quả thao tác. Hãy tải lại hồ sơ trước khi thử lại.')}</p>}
    {!denied && <>
      <section className="lv-legal-live__card lv-legal-documents">
      <header className="lv-legal-card-heading"><h2><FileCheck2 size={20} aria-hidden="true" />{en ? 'Case assessment' : 'Thông tin thẩm định'}</h2>
        {(error || needsReload) && <button type="button" disabled={pending} onClick={onReload}><RefreshCw size={16} aria-hidden="true" />{result ? (en ? 'View latest status' : 'Xem trạng thái mới') : (en ? 'Try again' : 'Thử lại')}</button>}
      </header>
      <LegalRecordDetails rows={[[en ? 'Case' : 'Hồ sơ', context.caseNumber], [en ? 'Status' : 'Trạng thái', legalStatus(context.caseStatus === 'CANCELLED' ? 'CANCELLED' : context.vaultStatus, en)],
        ...(context.snapshot ? [[en ? 'Document version' : 'Phiên bản hồ sơ', context.snapshot.currentVersion],
          [en ? 'Court assessment' : 'Kết luận thẩm định quyết định tòa án', legalStatus(context.snapshot.courtResult, en)],
          [en ? 'Current approval' : 'Phê duyệt còn hiệu lực', context.snapshot.approvalCurrent ? (en ? 'Yes' : 'Có') : (en ? 'No' : 'Không')]] : [])]} />
      {documentVersion && <LegalAllocations version={documentVersion} lang={lang} />}
      {documentVersion?.forwardStatus === 'FORWARDED' && <LegalEvidenceFiles inlineOnDesktop kind="basis" caseId={context.caseId} versionNo={documentVersion.version}
        file={{ contentType: documentVersion.contentType, sizeBytes: documentVersion.sizeBytes, sha256: documentVersion.sha256 }}
        accessToken={session.accessToken} lang={lang} onUnauthorized={onUnauthorized} onDenied={failure => { setError(failure); setNeedsReload(true); onDenied?.(failure); }} />}
      {readOnly && <p className="lv-legal-live__notice" role="status">{en ? 'This stage has ended. Information is available for reference only.' : 'Giai đoạn xử lý đã kết thúc. Thông tin được giữ lại để tra cứu, không thể chỉnh sửa.'}</p>}
      {context.basisDossier?.route === 'NOTARIAL' && <p>{en ? 'Legacy notarial record — read-only.' : 'Hồ sơ công chứng cũ — chỉ đọc.'}</p>}
      </section>
      {!readOnly && <section className="lv-legal-live__card lv-legal-action-panel">
        <header className="lv-legal-card-heading"><h2>{unlocking ? <LockKeyhole size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}{unlocking ? (en ? 'Controlled unlock' : 'Mở khóa có kiểm soát') : (en ? 'Approval decision' : 'Quyết định phê duyệt')}</h2></header>
        {!capability.allowed && <div className="lv-legal-live__notice" role="status"><div><strong>{en ? 'This record does not currently meet the processing conditions.' : 'Hồ sơ hiện chưa đáp ứng điều kiện xử lý.'}</strong><p>{blocker.text}</p>{blockerUrl && <a href={blockerUrl}>{legalStepTitle(blocker.step, lang)}<ArrowRight size={16} aria-hidden="true" /></a>}</div></div>}
        <form onSubmit={event => { event.preventDefault(); if (allowed && complete) setConfirmOpen(true); }}>
        {unlocking ? <label className="lv-legal-confirm"><input type="checkbox" checked={confirmed} disabled={!allowed} onChange={event => setConfirmed(event.target.checked)} />
          {en ? 'Confirm controlled unlocking for this case.' : 'Xác nhận mở khóa có kiểm soát cho hồ sơ này.'}</label>
          : <><label>{en ? 'Decision' : 'Quyết định'}<select value={decision} disabled={!allowed} required onChange={event => setDecision(event.target.value)}>
            <option value="">{en ? 'Select' : 'Chọn'}</option><option value="APPROVE">{en ? 'Approve' : 'Chấp thuận'}</option>
            <option value="REJECT">{en ? 'Reject' : 'Từ chối'}</option></select></label>
          <label>{en ? 'Reason (required for rejection)' : 'Lý do (bắt buộc khi từ chối)'}<textarea value={reason} maxLength={1000}
            required={decision === 'REJECT'} disabled={!allowed} onChange={event => setReason(event.target.value)} /></label></>}
        <button type="submit" disabled={!allowed || !complete} aria-describedby={blocked ? 'legal-action-blocked' : undefined}>{unlocking ? (en ? 'Unlock vault' : 'Mở khóa kho') : (en ? 'Record decision' : 'Ghi nhận quyết định')}</button>
        <WorkflowActionHint id="legal-action-blocked" reason={blocked} />
      </form>
      {result && <p className="lv-legal-live__success" role="status">{en ? 'Decision saved. Select “View latest status” to continue.' : 'Đã lưu quyết định. Chọn “Xem trạng thái mới” để tiếp tục.'}
        {' '}{legalDate(result.decidedAt || result.unlockedAt)}</p>}
      </section>}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={unlocking ? (en ? 'Confirm vault unlocking' : 'Xác nhận mở khóa kho') : (en ? 'Confirm your decision' : 'Xác nhận quyết định')} closeLabel={en ? 'Close' : 'Đóng'}>
        <p>{unlocking ? (en ? 'Unlocking allows Staff to begin the asset handover process. Check that this is the correct case.' : 'Mở khóa cho phép nhân viên bắt đầu bàn giao tài sản. Hãy kiểm tra đúng hồ sơ trước khi xác nhận.')
          : decision === 'REJECT' ? (en ? 'Rejecting blocks this version from being unlocked. Your reason will be recorded in the case history.' : 'Từ chối sẽ chặn mở khóa theo phiên bản này. Lý do của bạn sẽ được lưu vào lịch sử hồ sơ.')
          : (en ? 'Approval applies to the current document version and asset allocations. Unlocking remains a separate action.' : 'Phê duyệt áp dụng cho phiên bản giấy tờ và thông tin phân chia hiện tại. Mở khóa vẫn là một thao tác riêng.')}</p>
        <LegalRecordDetails rows={[[en ? 'Case' : 'Hồ sơ', context.caseNumber], [en ? 'Version' : 'Phiên bản', context.snapshot?.currentVersion], ...(!unlocking ? [[en ? 'Decision' : 'Quyết định', decision === 'REJECT' ? (en ? 'Reject' : 'Từ chối') : (en ? 'Approve' : 'Chấp thuận')], [en ? 'Reason' : 'Lý do', reason || '—']] : [])]} />
        <div className="lv-legal-dialog-actions"><button type="button" onClick={() => setConfirmOpen(false)}>{en ? 'Go back' : 'Quay lại kiểm tra'}</button>
          <button type="button" className={decision === 'REJECT' && !unlocking ? 'lv-legal-danger' : 'lv-legal-primary'} data-legal-confirm onClick={submit}>{en ? 'Confirm decision' : 'Xác nhận quyết định'}</button></div>
      </Modal>
    </>}
    {denied && <button type="button" disabled={pending} onClick={onReload}><RefreshCw size={16} aria-hidden="true" />{en ? 'Try again' : 'Thử lại'}</button>}
  </div>;
}
