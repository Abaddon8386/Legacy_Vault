import ChoiceButtons from '../../components/common/ChoiceButtons.jsx';
import { useEffect, useRef, useState } from 'react';
import { classifyLegalDossier, holdLegalDossier, loadLegalContext } from './legalLiveService.js';
import { legalReadOnly } from './legalPresentation.js';

/**
 * Tạo "dấu vân tay" JSON của ngữ cảnh hồ sơ (case, trạng thái, hồ sơ căn cứ, các phiên bản và hash, snapshot) để so sánh trước/sau khi tải lại.
 * Nếu khác nhau tại thời điểm gửi thì thao tác bị hủy với lỗi STALE_CONTEXT (409), tránh tạm dừng/tiếp tục trên dữ liệu cũ.
 *
 * @param {object} context Ngữ cảnh hồ sơ Legal.
 * @returns {string} Chuỗi JSON.
 */
function scope(context) {
  const dossier = context.basisDossier;
  return JSON.stringify([context.caseId, context.caseStatus, context.vaultStatus, dossier?.id,
    dossier?.route, dossier?.status, dossier?.requiredVersion, dossier?.disputeStatus, dossier?.routeReason,
    dossier?.versions.map(item => [item.version, item.sha256, item.forwardStatus]), context.snapshot]);
}

/**
 * Điều khiển "Tạm dừng / Tiếp tục xử lý hồ sơ" của Legal, hiển thị trong LegalLiveWorkflow.
 * - Chế độ hold: khi hồ sơ căn cứ có route COURT hoặc NOTARIAL và kho ở AWAITING_LEGAL_BASIS/LEGAL_BASIS_VERIFICATION; chọn nguyên nhân (NEW_DISPUTE, INSUFFICIENT_EVIDENCE) + lý do (tối đa 1000 ký tự)
 *   rồi gọi holdLegalDossier(caseId, {cause, reason}).
 * - Chế độ resume: khi route === 'ON_HOLD', dossier DRAFT và kho ON_HOLD; chọn lại căn cứ (NOTARIAL/COURT) + lý do rồi gọi classifyLegalDossier(caseId, {route, routeReason}, {reclassification: true}).
 * Trước khi gửi nó tải lại ngữ cảnh bằng loadLegalContext và so sánh scope(); nếu khác thì báo 409. Dùng AbortController và khóa lock để chống gửi trùng; 401 -> onUnauthorized, 403 -> onDenied.
 * Chỉ hiển thị khi case OPEN, không ở chế độ chỉ xem; nếu không đủ điều kiện chỉ trả về thanh công cụ (toolbar).
 *
 * @param {object} props
 * @param {React.ReactNode} [props.toolbar] Thanh nút của cha, luôn được hiển thị.
 * @param {object} props.context Ngữ cảnh hồ sơ (caseId, caseStatus, vaultStatus, basisDossier, snapshot).
 * @param {{accessToken: string, user: {id: string, roles: string[]}}} props.session Phiên đăng nhập.
 * @param {'vi'|'en'} [props.lang='vi'] Ngôn ngữ.
 * @param {boolean} [props.disabled] Khóa toàn bộ form.
 * @param {() => boolean} props.claimOperation Xin quyền thực hiện thao tác (chặn thao tác song song ở cha).
 * @param {() => void} props.releaseOperation Trả quyền sau khi xong.
 * @param {(receipt?: object) => void} props.onComplete Gọi khi xong (kèm holdAction 'held'/'resumed') hoặc khi bấm "Tải lại hồ sơ" (không tham số).
 * @param {() => void} [props.onUnauthorized] Khi API trả 401.
 * @param {(error: Error) => void} [props.onDenied] Khi API trả 403.
 * @param {object} [props.draft] Bản nháp do cha giữ (tùy chọn).
 * @param {Function} [props.onDraftChange] Cập nhật bản nháp.
 * @param {(pending: boolean) => void} [props.onPendingChange] Báo trạng thái đang xử lý.
 * @returns {JSX.Element|null} Form tạm dừng/tiếp tục hoặc thanh công cụ.
 */
export default function LegalHoldControls({ toolbar, context, session, lang = 'vi', disabled, claimOperation, releaseOperation,
  onComplete, onUnauthorized, onDenied, draft, onDraftChange, onPendingChange }) {
  const en = lang === 'en', dossier = context.basisDossier;
  const resume = dossier?.route === 'ON_HOLD' && dossier.status === 'DRAFT' && context.vaultStatus === 'ON_HOLD';
  const hold = ['COURT', 'NOTARIAL'].includes(dossier?.route) && ['AWAITING_LEGAL_BASIS', 'LEGAL_BASIS_VERIFICATION'].includes(context.vaultStatus);
  const eligible = context.caseStatus === 'OPEN' && !legalReadOnly(context) && (resume || hold);
  const [localDraft, setLocalDraft] = useState({ expanded: false, reason: '', choice: '' });
  const mode = resume ? 'resume' : 'hold';
  const storedDraft = draft || localDraft;
  const { expanded = false, reason = '', choice = '' } = storedDraft.mode === mode ? storedDraft : {};
  const updateDraft = onDraftChange || setLocalDraft;
  const setDraft = update => updateDraft(previous => ({ ...update(previous.mode === mode ? previous : {}), mode }));
  const setExpanded = value => setDraft(previous => ({ ...previous, expanded: value }));
  const setReason = value => setDraft(previous => ({ ...previous, reason: value }));
  const setChoice = value => setDraft(previous => ({ ...previous, choice: value }));
  const [pending, setPending] = useState(false), [error, setError] = useState(null);
  const request = useRef(null), lock = useRef(false);
  useEffect(() => () => { request.current?.abort(); onPendingChange?.(false); }, [onPendingChange]);
  /**
   * Gửi thao tác tạm dừng hoặc tiếp tục: kiểm tra điều kiện, claimOperation, tải lại ngữ cảnh để phát hiện thay đổi (409), gọi holdLegalDossier hoặc classifyLegalDossier, rồi onComplete(receipt).
   * Lỗi được lưu vào state error (lý do đã nhập được giữ lại).
   */
  async function submit(event) {
    event.preventDefault();
    if (!eligible || disabled || pending || error || lock.current || !choice || !reason.trim() || reason.trim().length > 1000) return;
    if (!claimOperation()) return;
    lock.current = true; setPending(true); onPendingChange?.(true);
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
      if (!controller.signal.aborted) { lock.current = false; setPending(false); releaseOperation(); onPendingChange?.(false); }
    }
  }
  if (!eligible) return toolbar ? <div className="lv-legal-action-row">{toolbar}</div> : null;
  return <section className="lv-legal-step-data lv-legal-hold-controls" aria-label={en ? 'Pause or resume case processing' : 'Tạm dừng hoặc tiếp tục xử lý hồ sơ'}>
    {resume ? <><h2>{en ? 'Resume case processing' : 'Tiếp tục xử lý hồ sơ'}</h2>
      <p>{en ? 'The case is on hold. Review the reason and the available documents before resuming.' : 'Hồ sơ đang tạm dừng. Kiểm tra lý do và giấy tờ hiện có trước khi tiếp tục xử lý.'}</p>
      {dossier.routeReason && <p>{en ? 'Hold reason: ' : 'Lý do tạm dừng: '}{dossier.routeReason}</p>}</>
      : <div className="lv-legal-action-row">{toolbar}<button type="button" className="lv-decision--hold" disabled={disabled || pending} onClick={() => setExpanded(!expanded)} aria-expanded={expanded}>
        {en ? 'Place case on hold' : 'Tạm dừng xử lý'}</button></div>}
    {(resume || expanded) && <form className="lv-distribution-form" onSubmit={submit}>
      <ChoiceButtons title={resume ? (en ? 'Resume with these documents' : 'Tiếp tục xử lý theo giấy tờ') : (en ? 'Cause' : 'Nguyên nhân')} value={choice}
        disabled={disabled || pending || !!error} onChange={setChoice} options={resume
          ? [['NOTARIAL', en ? 'Notarial documents' : 'Hồ sơ công chứng'], ['COURT', en ? 'Court documents' : 'Giấy tờ Tòa án']]
          : [['NEW_DISPUTE', en ? 'New dispute' : 'Tranh chấp mới'], ['INSUFFICIENT_EVIDENCE', en ? 'Insufficient evidence' : 'Thiếu chứng cứ']]} />
      <label><span>{en ? 'Reason' : 'Lý do'}<span className="lv-required-mark" aria-hidden="true">*</span></span><textarea required maxLength={1000} value={reason}
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
