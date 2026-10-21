import { useEffect, useRef, useState } from 'react';
import { decideLegalApproval, loadLegalContext, unlockLegalVault } from './legalLiveService.js';

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

export default function LegalFinalDecision({ session, context, step, lang, onReload, onUnauthorized, onDenied }) {
  const en = lang === 'en', unlocking = step === 'controlled-unlock';
  const [decision, setDecision] = useState('');
  const [reason, setReason] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [needsReload, setNeedsReload] = useState(false);
  const controller = useRef(null), lock = useRef(false);
  useEffect(() => () => controller.current?.abort(), []);
  const capability = context.capabilities[unlocking ? 'unlock' : 'approval'];
  const allowed = capability.allowed && !needsReload && !pending;
  const complete = unlocking ? confirmed : ['APPROVE', 'REJECT'].includes(decision) && (decision !== 'REJECT' || reason.trim());
  async function submit(event) {
    event.preventDefault();
    if (!allowed || !complete || lock.current) return;
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
    } catch (failure) {
      if (current.signal.aborted) return;
      setError(failure); setNeedsReload(true);
      if (failure.status === 401) onUnauthorized?.();
      if (failure.status === 403) onDenied?.(failure);
    } finally {
      if (!current.signal.aborted) { lock.current = false; setPending(false); }
    }
  }
  const denied = error && [401, 403, 404].includes(error.status);
  return <section className="lv-legal-live__card" aria-busy={pending}>
    {pending && <p role="status">{en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{error.status === 409
      ? (en ? 'The record changed or is no longer eligible. Reload before continuing.' : 'Hồ sơ đã thay đổi hoặc không còn đủ điều kiện. Hãy tải lại trước khi tiếp tục.')
      : (en ? 'The operation could not be confirmed. Reload the record before retrying.' : 'Chưa xác nhận được kết quả thao tác. Hãy tải lại hồ sơ trước khi thử lại.')}</p>}
    {!denied && <>
      <p>{context.caseNumber} · {context.vaultStatus}</p>
      {context.snapshot && <p>{en ? 'Basis version' : 'Phiên bản căn cứ'}: {context.snapshot.currentVersion}
        {' · '}{en ? 'Court assessment' : 'Kết luận tòa'}: {context.snapshot.courtResult || '—'}
        {' · '}{en ? 'Current approval' : 'Phê duyệt còn hiệu lực'}: {context.snapshot.approvalCurrent ? (en ? 'Yes' : 'Có') : (en ? 'No' : 'Không')}</p>}
      {!capability.allowed && <p role="status">{en ? 'This record does not currently meet the processing conditions. Reload after the required verification steps are completed.' : 'Hồ sơ hiện chưa đáp ứng điều kiện xử lý. Hãy tải lại sau khi hoàn tất các bước thẩm định cần thiết.'}</p>}
      {context.basisDossier?.route === 'NOTARIAL' && <p>{en ? 'Legacy notarial record — read-only.' : 'Hồ sơ công chứng cũ — chỉ đọc.'}</p>}
      <form onSubmit={submit}>
        {unlocking ? <label><input type="checkbox" checked={confirmed} disabled={!allowed} onChange={event => setConfirmed(event.target.checked)} />
          {en ? 'Confirm controlled unlocking for this case.' : 'Xác nhận mở khóa có kiểm soát cho hồ sơ này.'}</label>
          : <><label>{en ? 'Decision' : 'Quyết định'}<select value={decision} disabled={!allowed} required onChange={event => setDecision(event.target.value)}>
            <option value="">{en ? 'Select' : 'Chọn'}</option><option value="APPROVE">{en ? 'Approve' : 'Chấp thuận'}</option>
            <option value="REJECT">{en ? 'Reject' : 'Từ chối'}</option></select></label>
          <label>{en ? 'Reason (required for rejection)' : 'Lý do (bắt buộc khi từ chối)'}<textarea value={reason} maxLength={1000}
            required={decision === 'REJECT'} disabled={!allowed} onChange={event => setReason(event.target.value)} /></label></>}
        <button type="submit" disabled={!allowed || !complete}>{unlocking ? (en ? 'Unlock vault' : 'Mở khóa kho') : (en ? 'Record decision' : 'Ghi nhận quyết định')}</button>
      </form>
      {result && <p role="status">{en ? 'The server confirmed the operation. Reload before continuing.' : 'Máy chủ đã xác nhận thao tác. Tải lại trước khi tiếp tục.'}
        {' '}{result.decidedAt || result.unlockedAt}</p>}
    </>}
    <button type="button" disabled={pending} onClick={onReload}>{en ? 'Reload record' : 'Tải lại hồ sơ'}</button>
  </section>;
}
