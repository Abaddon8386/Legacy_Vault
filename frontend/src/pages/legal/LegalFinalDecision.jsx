import { useEffect, useRef, useState } from 'react';
import { decideLegalApproval, loadLegalContext, unlockLegalVault } from './legalLiveService.js';
import { LegalRecordDetails } from './LegalRecordDetails.jsx';
import { legalBlocker, legalDate, legalReadOnly, legalStatus } from './legalPresentation.js';
import { LEGAL_NAVIGATION_REGISTRY, legalStepTitle } from '../../utils/legalNavigation.js';
import { Modal } from '../../components/common/Modal.jsx';
import LegalEvidenceFiles from './LegalEvidenceFiles.jsx';
import ChoiceButtons from '../../components/common/ChoiceButtons.jsx';
import LegalAllocations from './LegalAllocations.jsx';
import { ArrowRight, FileCheck2, LockKeyhole, RefreshCw, ShieldCheck } from 'lucide-react';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import { legalBlockedReason } from '../../utils/workflowGuidance.js';

/**
 * Tạo chuỗi JSON đại diện "phạm vi quyết định" của hồ sơ (trạng thái case/kho, hồ sơ căn cứ, snapshot, capability approval/unlock) để so sánh trước và sau khi tải lại.
 * Loại trường evaluatedAt vì mỗi lần đọc có đồng hồ mới nhưng không phải phạm vi phê duyệt mới.
 *
 * @param {object} value Ngữ cảnh hồ sơ từ loadLegalContext.
 * @returns {string} Chuỗi JSON.
 */
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

/**
 * Bước cuối của Legal: "Quyết định phê duyệt" (step approval-review) hoặc "Xác nhận mở khóa" (step controlled-unlock), được LegalDistributionFinalWorkspace render.
 * Hiển thị thông tin thẩm định (phiên bản, kết luận tòa án, phê duyệt còn hiệu lực, lý do từ chối gần nhất), phân bổ (LegalAllocations) và tệp văn bản (LegalEvidenceFiles).
 * Quy trình ghi: bấm nút mở hộp thoại xác nhận (Modal) -> submit(): tải lại ngữ cảnh (loadLegalContext), so sánh legalDecisionScope và capability; lệch thì báo 409 (LEGAL_DECISION_STALE);
 * chạy beforeCommit (preflight workflow); rồi gọi unlockLegalVault (POST .../verification-cases/{caseId}/unlock) hoặc decideLegalApproval (POST .../basis-dossier/decision với versionNo, sha256Hash, allocationHash).
 * Nếu capability bị chặn thì hiển thị lý do (legalBlocker) và liên kết tới bước cần quay lại. Có khóa lock chống gửi trùng; 401 -> onUnauthorized, 403 -> onDenied.
 *
 * @param {object} props
 * @param {object} props.session Phiên đăng nhập.
 * @param {object} props.context Ngữ cảnh hồ sơ (capabilities, snapshot, basisDossier...).
 * @param {'approval-review'|'controlled-unlock'} props.step Bước.
 * @param {'vi'|'en'} props.lang Ngôn ngữ.
 * @param {{decision?: string, reason?: string, confirmed?: boolean}} props.draft Bản nháp.
 * @param {Function} props.setDraft Cập nhật bản nháp.
 * @param {() => void} props.onReload Tải lại ngữ cảnh.
 * @param {(receipt: object) => void} props.onSaved Callback khi ghi thành công.
 * @param {() => void} [props.onUnauthorized] 401.
 * @param {(error: Error) => void} [props.onDenied] 403.
 * @param {() => void} [props.onContextChanged] Báo ngữ cảnh đã đổi (làm hướng dẫn cũ).
 * @param {(pending: boolean) => void} [props.onPendingChange] Báo trạng thái đang ghi.
 * @param {boolean} [props.workflowReadOnly=false] Workflow chưa tới bước này nên chỉ xem.
 * @param {Function} [props.beforeCommit] Kiểm tra trước khi ghi (fresh, options).
 * @returns {JSX.Element}
 */
export default function LegalFinalDecision({ session, context, step, lang, draft, setDraft, onReload, onSaved, onUnauthorized, onDenied, onContextChanged, onPendingChange, workflowReadOnly = false, beforeCommit }) {
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
  useEffect(() => () => { controller.current?.abort(); onPendingChange?.(false); }, [onPendingChange]);
  const capability = context.capabilities[unlocking ? 'unlock' : 'approval'];
  const currentDecision = context.basisDossier?.currentDecision;
  const isRejected = currentDecision?.status === 'LEGAL_REJECTED' || context.snapshot?.latestDecision?.result === 'LEGAL_REJECTED';
  const rejectionReason = currentDecision?.reason || (isRejected ? (context.snapshot?.latestDecision?.reason || '') : '');
  const readOnly = legalReadOnly(context) || workflowReadOnly;
  const allowed = capability.allowed && !needsReload && !pending && !readOnly;
  const complete = unlocking ? confirmed : ['APPROVE', 'REJECT'].includes(decision) && Boolean(reason.trim());
  const blocker = legalBlocker(capability.blockedReason, en);
  const blockerPath = LEGAL_NAVIGATION_REGISTRY.find(item => item.id === blocker.step)?.path;
  const blockerUrl = blockerPath ? `${blockerPath}?${new URLSearchParams({ caseId: context.caseId, lang })}` : null;
  const documentVersion = context.basisDossier?.versions?.find(item => item.version === context.snapshot?.currentVersion);
  const blocked = pending ? (en ? 'Wait for the current operation.' : 'Chờ thao tác hiện tại hoàn tất.')
    : needsReload ? (en ? 'Reload the record before continuing.' : 'Tải lại hồ sơ trước khi tiếp tục.')
      : !capability.allowed ? legalBlockedReason(context, unlocking ? 'unlock' : 'approval', lang)
        : !complete ? unlocking ? (en ? 'Tick the box to unlock.' : 'Tích ô xác nhận để mở khóa')
          : ['APPROVE', 'REJECT'].includes(decision) ? (en ? 'Enter the decision reason.' : 'Nhập lý do cho quyết định.')
            : (en ? 'Select a decision.' : 'Chọn quyết định.') : '';
  /** Thực hiện phê duyệt/từ chối hoặc mở khóa sau khi người dùng xác nhận trong hộp thoại: kiểm tra điều kiện, tải lại ngữ cảnh để phát hiện thay đổi (409), chạy beforeCommit rồi gọi API ghi; thành công thì lưu kết quả, bắt buộc tải lại và gọi onSaved. */
  async function submit() {
    if (!allowed || !complete || lock.current) return;
    setConfirmOpen(false);
    lock.current = true; onPendingChange?.(true);
    const current = new AbortController(); controller.current = current;
    setPending(true); setError(null); setResult(null);
    const options = { accessToken: session.accessToken, roles: session.user.roles, userId: session.user.id, lang, signal: current.signal };
    try {
      const fresh = await loadLegalContext(context.caseId, options);
      if (current.signal.aborted) return;
      if (legalDecisionScope(fresh) !== legalDecisionScope(context) || !fresh.capabilities[unlocking ? 'unlock' : 'approval'].allowed) {
        throw Object.assign(new Error('LEGAL_DECISION_STALE'), { status: 409 });
      }
      await beforeCommit?.(fresh, options);
      if (current.signal.aborted) return;
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
      if (!current.signal.aborted) { lock.current = false; setPending(false); onPendingChange?.(false); }
    }
  }
  const denied = error && [401, 403, 404].includes(error.status);
  return <div className={`lv-legal-workspace${readOnly || denied ? ' is-readonly' : ''}`} aria-busy={pending}>
    {pending && <p role="status">{en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{error.status === 409
      ? (en ? 'The record changed or is no longer eligible. Reload before continuing.' : 'Hồ sơ đã thay đổi hoặc không còn đủ điều kiện. Hãy tải lại trước khi tiếp tục.')
      : (en ? 'The operation could not be confirmed. Reload the record before retrying.' : 'Chưa xác nhận được kết quả thao tác. Hãy tải lại hồ sơ trước khi thử lại.')}</p>}
    {!denied && <>
      <section className="lv-legal-live__card lv-legal-documents lv-surface-card">
      <header className="lv-legal-card-heading"><h2><FileCheck2 size={20} aria-hidden="true" />{en ? 'Case assessment' : 'Thông tin thẩm định'}</h2>
        {(error || needsReload) && <button type="button" disabled={pending} onClick={onReload}><RefreshCw size={16} aria-hidden="true" />{result ? (en ? 'View latest status' : 'Xem trạng thái mới') : (en ? 'Try again' : 'Thử lại')}</button>}
      </header>
      <LegalRecordDetails rows={[[en ? 'Case' : 'Hồ sơ', context.caseNumber], [en ? 'Status' : 'Trạng thái', legalStatus(context.caseStatus === 'CANCELLED' ? 'CANCELLED' : context.vaultStatus, en)],
        ...(context.snapshot ? [[en ? 'Document version' : 'Phiên bản hồ sơ', context.snapshot.currentVersion],
          ...(context.basisDossier?.route === 'COURT' ? [[en ? 'Court assessment' : 'Kết luận thẩm định quyết định tòa án', legalStatus(context.snapshot.courtResult, en)]] : []),
          [en ? 'Current approval' : 'Phê duyệt còn hiệu lực', context.snapshot.approvalCurrent ? (en ? 'Yes' : 'Có') : (en ? 'No' : 'Không')],
          ...(isRejected ? [
            [en ? 'Latest decision' : 'Quyết định gần nhất', en ? 'Rejected' : 'Từ chối'],
            ...(rejectionReason ? [[en ? 'Rejection reason' : 'Lý do từ chối', rejectionReason]] : []),
          ] : [])] : [])]} />
      {isRejected && rejectionReason && (
        <div className="lv-legal-live__notice lv-legal-rejection-notice" role="status">
          <div>
            <strong>{en ? 'Latest rejection reason: ' : 'Lý do từ chối gần nhất: '}</strong>
            <p>{rejectionReason}</p>
          </div>
        </div>
      )}
      {documentVersion && <LegalAllocations version={documentVersion} lang={lang} />}
      {documentVersion?.forwardStatus === 'FORWARDED' && <LegalEvidenceFiles kind="basis" caseId={context.caseId} versionNo={documentVersion.version}
        file={{ contentType: documentVersion.contentType, sizeBytes: documentVersion.sizeBytes, sha256: documentVersion.sha256 }}
        accessToken={session.accessToken} lang={lang} onUnauthorized={onUnauthorized} onDenied={failure => { setError(failure); setNeedsReload(true); onDenied?.(failure); }} />}
      {readOnly && <p className="lv-legal-live__notice" role="status">
        {isRejected
          ? (en ? 'This document version was rejected. Legal can open the supplementation step above.' : 'Phiên bản hồ sơ này đã bị từ chối. Ban Pháp lý có thể mở bước bổ sung ở trên.')
          : workflowReadOnly && !legalReadOnly(context)
            ? (en ? 'This step is not ready. You can review the documents while awaiting the preceding decisions.' : 'Hồ sơ chưa đến bước này. Bạn có thể xem giấy tờ trong khi chờ các bước trước hoàn tất.')
            : (en ? 'This stage has ended. Information is available for reference only.' : 'Giai đoạn xử lý đã kết thúc. Thông tin được giữ lại để tra cứu, không thể chỉnh sửa.')}
      </p>}
      {context.basisDossier?.route === 'NOTARIAL' && <p>{en ? 'Distribution based on notarized documents.' : 'Phân chia theo hồ sơ công chứng.'}</p>}
      </section>
      {!readOnly && <section className="lv-legal-live__card lv-legal-action-panel lv-surface-card">
        <header className="lv-legal-card-heading"><h2>{unlocking ? <LockKeyhole size={20} aria-hidden="true" /> : <ShieldCheck size={20} aria-hidden="true" />}{unlocking ? (en ? 'Confirm unlock' : 'Xác nhận mở khóa') : (en ? 'Approval decision' : 'Quyết định phê duyệt')}</h2></header>
        {!capability.allowed && <div className="lv-legal-live__notice" role="status"><div><strong>{en ? 'This record does not currently meet the processing conditions.' : 'Hồ sơ hiện chưa đáp ứng điều kiện xử lý.'}</strong><p>{blocker.text}</p>{blockerUrl && <a href={blockerUrl}>{legalStepTitle(blocker.step, lang)}<ArrowRight size={16} aria-hidden="true" /></a>}</div></div>}
        <form onSubmit={event => { event.preventDefault(); if (allowed && complete) setConfirmOpen(true); }}>
        {unlocking ? <label className="lv-legal-confirm"><input type="checkbox" checked={confirmed} disabled={!allowed} onChange={event => setConfirmed(event.target.checked)} />
          {en ? 'Confirm unlocking this vault' : 'Xác nhận mở khóa kho này'}</label>
          : <><ChoiceButtons title={en ? 'Decision' : 'Quyết định'} value={decision} disabled={!allowed} onChange={setDecision}
            options={[['APPROVE', en ? 'Approve' : 'Chấp thuận'], ['REJECT', en ? 'Reject' : 'Từ chối']]} />
          <label><span>{en ? 'Reason' : 'Lý do'}<span className="lv-required-mark" aria-hidden="true">*</span></span><textarea value={reason} maxLength={1000}
            required disabled={!allowed} onChange={event => setReason(event.target.value)} /></label></>}
        <button type="submit" className={decision === 'REJECT' && !unlocking ? 'lv-decision--negative' : 'lv-decision--positive'} disabled={!allowed || !complete} aria-describedby={blocked ? 'legal-action-blocked' : undefined}>{unlocking ? (en ? 'Unlock vault' : 'Mở khóa kho') : (en ? 'Record decision' : 'Ghi nhận quyết định')}</button>
        <WorkflowActionHint id="legal-action-blocked" reason={blocked} />
      </form>
      {result && <p className="lv-legal-live__success" role="status">{en ? 'Decision saved' : 'Đã lưu quyết định'}
        {' '}{legalDate(result.decidedAt || result.unlockedAt)}</p>}
      </section>}
      <Modal isOpen={confirmOpen} onClose={() => setConfirmOpen(false)} title={unlocking ? (en ? 'Confirm vault unlocking' : 'Xác nhận mở khóa kho') : (en ? 'Confirm your decision' : 'Xác nhận quyết định')} closeLabel={en ? 'Close' : 'Đóng'}>
        <p>{unlocking ? (en ? 'Unlocking allows Staff to begin the asset handover process. Check that this is the correct case.' : 'Mở khóa cho phép nhân viên bắt đầu bàn giao tài sản. Hãy kiểm tra đúng hồ sơ trước khi xác nhận.')
          : decision === 'REJECT' ? (en ? 'Rejecting blocks this version from being unlocked. Your reason will be recorded in the case history.' : 'Từ chối sẽ chặn mở khóa theo phiên bản này. Lý do của bạn sẽ được lưu vào lịch sử hồ sơ.')
          : (en ? 'Approval applies to the current document version and asset allocations. Unlocking remains a separate action.' : 'Phê duyệt áp dụng cho phiên bản giấy tờ và thông tin phân chia hiện tại. Mở khóa vẫn là một thao tác riêng.')}</p>
        <LegalRecordDetails rows={[[en ? 'Case' : 'Hồ sơ', context.caseNumber], [en ? 'Version' : 'Phiên bản', context.snapshot?.currentVersion], ...(!unlocking ? [[en ? 'Decision' : 'Quyết định', decision === 'REJECT' ? (en ? 'Reject' : 'Từ chối') : (en ? 'Approve' : 'Chấp thuận')], [en ? 'Reason' : 'Lý do', reason || '—']] : [])]} />
        <div className="lv-legal-dialog-actions"><button type="button" onClick={() => setConfirmOpen(false)}>{en ? 'Go back' : 'Quay lại kiểm tra'}</button>
          <button type="button" className={decision === 'REJECT' && !unlocking ? 'lv-legal-danger lv-decision--negative' : 'lv-legal-primary lv-decision--positive'} data-legal-confirm onClick={submit}>{en ? 'Confirm decision' : 'Xác nhận quyết định'}</button></div>
      </Modal>
    </>}
    {denied && <button type="button" disabled={pending} onClick={onReload}><RefreshCw size={16} aria-hidden="true" />{en ? 'Try again' : 'Thử lại'}</button>}
  </div>;
}
