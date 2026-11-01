import { useEffect, useRef, useState } from 'react';
import { classifyLegalDossier, holdLegalDossier, loadLegalContext } from './legalLiveService.js';
import { legalReadOnly } from './legalPresentation.js';

function scope(context) {
  const dossier = context.basisDossier;
  return JSON.stringify([context.caseId, context.caseStatus, context.vaultStatus, dossier?.id,
    dossier?.route, dossier?.status, dossier?.requiredVersion, dossier?.disputeStatus, dossier?.routeReason,
    dossier?.versions.map(item => [item.version, item.sha256, item.forwardStatus]), context.snapshot]);
}

export default function LegalHoldControls({ context, session, lang = 'vi', disabled, claimOperation, releaseOperation,
  onComplete, onUnauthorized, onDenied }) {
  const en = lang === 'en', dossier = context.basisDossier;
  const resume = dossier?.route === 'ON_HOLD' && dossier.status === 'DRAFT' && context.vaultStatus === 'ON_HOLD';
  const hold = ['COURT', 'NOTARIAL'].includes(dossier?.route) && ['AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION'].includes(context.vaultStatus);
  const eligible = context.caseStatus === 'OPEN' && !legalReadOnly(context) && (resume || hold);
  const [expanded, setExpanded] = useState(false), [reason, setReason] = useState(''), [choice, setChoice] = useState('');
  const [pending, setPending] = useState(false), [error, setError] = useState(null);
  const request = useRef(null), lock = useRef(false);
  useEffect(() => () => request.current?.abort(), []);
  async function submit(event) {
    event.preventDefault();
    if (!eligible || disabled || pending || error || lock.current || !choice || !reason.trim() || reason.trim().length > 1000) return;
    if (!claimOperation()) return;
    lock.current = true; setPending(true);
    const controller = new AbortController(); request.current = controller;
    const options = { accessToken: session.accessToken, roles: session.user.roles, userId: session.user.id, lang, signal: controller.signal };
    try {
      const fresh = await loadLegalContext(context.caseId, options);
      if (controller.signal.aborted) return;
      if (scope(fresh) !== scope(context)) throw Object.assign(new Error('STALE_CONTEXT'), { status: 409 });
      const receipt = resume
        ? await classifyLegalDossier(context.caseId, { route: choice, routeReason: reason }, { ...options, reclassification: true })
        : await holdLegalDossier(context.caseId, { cause: choice, reason }, options);
      if (!controller.signal.aborted) onComplete({ ...receipt, holdAction: resume ? 'resumed' : 'held' });
    } catch (failure) {
      if (controller.signal.aborted) return;
      setError(failure);
      if (failure.status === 401) onUnauthorized?.();
      if (failure.status === 403) onDenied?.(failure);
    } finally {
      if (!controller.signal.aborted) { lock.current = false; setPending(false); releaseOperation(); }
    }
  }
  if (!eligible) return null;
  return <section className="lv-legal-step-data lv-surface-card" aria-label={en ? 'Pause or resume case processing' : 'Tạm dừng hoặc tiếp tục xử lý hồ sơ'}>
    {resume ? <><h2>{en ? 'Resume case processing' : 'Tiếp tục xử lý hồ sơ'}</h2>
      <p>{en ? 'The case is on hold. Review the reason and the available documents before resuming.' : 'Hồ sơ đang tạm dừng. Kiểm tra lý do và giấy tờ hiện có trước khi tiếp tục xử lý.'}</p>
      {dossier.routeReason && <p>{en ? 'Hold reason: ' : 'Lý do tạm dừng: '}{dossier.routeReason}</p>}</>
      : <button type="button" disabled={disabled || pending} onClick={() => setExpanded(value => !value)} aria-expanded={expanded}>
        {en ? 'Place case on hold' : 'Tạm dừng xử lý'}</button>}
    {(resume || expanded) && <form className="lv-distribution-form" onSubmit={submit}>
      <label>{resume ? (en ? 'Resume with these documents' : 'Tiếp tục xử lý theo giấy tờ') : (en ? 'Cause' : 'Nguyên nhân')}
        <select required value={choice} disabled={disabled || pending || !!error} onChange={event => setChoice(event.target.value)}>
          <option value="">{en ? 'Select' : 'Chọn'}</option>
          {resume ? <><option value="NOTARIAL">{en ? 'Notarial documents' : 'Hồ sơ công chứng'}</option><option value="COURT">{en ? 'Court documents' : 'Giấy tờ Tòa án'}</option></>
            : <><option value="NEW_DISPUTE">{en ? 'New dispute' : 'Tranh chấp mới'}</option><option value="INSUFFICIENT_EVIDENCE">{en ? 'Insufficient evidence' : 'Thiếu chứng cứ'}</option></>}
        </select>
      </label>
      <label>{en ? 'Reason (required)' : 'Lý do (bắt buộc)'}<textarea required maxLength={1000} value={reason}
        disabled={disabled || pending || !!error} onChange={event => setReason(event.target.value)} /></label>
      <button type="submit" className={resume ? 'lv-decision--positive' : undefined} disabled={disabled || pending || !!error || !choice || !reason.trim()}>
        {resume ? (en ? 'Resume processing' : 'Tiếp tục xử lý') : (en ? 'Confirm hold' : 'Xác nhận tạm dừng')}</button>
    </form>}
    {pending && <p role="status">{en ? 'Saving the case status…' : 'Đang lưu trạng thái hồ sơ…'}</p>}
    {error && <div role="alert"><p>{error.status === 409
      ? (en ? 'The case changed. Reload and review the latest state before continuing.' : 'Hồ sơ đã thay đổi. Tải lại và kiểm tra trạng thái mới nhất trước khi tiếp tục.')
      : (en ? 'The operation could not be confirmed. Your reason is kept. Reload before retrying.' : 'Chưa xác nhận được thao tác. Lý do đã nhập được giữ lại. Tải lại hồ sơ trước khi thử lại.')}</p>
      <button type="button" onClick={() => onComplete()}>{en ? 'Reload case' : 'Tải lại hồ sơ'}</button></div>}
  </section>;
}
