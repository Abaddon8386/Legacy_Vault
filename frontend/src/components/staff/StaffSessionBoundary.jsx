import { cloneElement, useEffect, useRef, useState } from 'react';
import { loadStaffCase } from '../../pages/staff/staffLiveService.js';
import { getLiveSession, isHandoverId, listLiveSessions } from '../../pages/staff/liveHandoverService.js';
import { formatStaffSession } from '../../utils/caseReference.js';
import { staffSessionPrerequisite, workflowFailure } from '../../utils/workflowFeedback.js';
import { loadDistributionWorkflow } from '../../workflows/distributionWorkflowService.js';
import StaffCaseSelectorModal from './StaffCaseSelectorModal.jsx';
import './StaffSessionBoundary.css';
import StaffGroupHandover from './StaffGroupHandover.jsx';

export default function StaffSessionBoundary(props) {
  if (props.preview && !props.accessToken) return props.children;
  return <SessionScope key={JSON.stringify([props.caseId, props.sessionId, props.accessToken, props.revision])} {...props} />;
}

function SessionScope({children, caseId, sessionId, accessToken, lang = 'vi', requireSession = true,
  onCaseChange, onSessionChange, onUnauthorized, operation = 'view'}) {
  const en = lang === 'en';
  const [result, setResult] = useState(null);
  const [attempt, setAttempt] = useState(0);
  const [selector, setSelector] = useState(false);
  const callbacks = useRef({onSessionChange, onUnauthorized, lang});
  useEffect(() => { callbacks.current = {onSessionChange, onUnauthorized, lang}; }, [onSessionChange, onUnauthorized, lang]);
  useEffect(() => {
    if (!isHandoverId(caseId)) return;
    const controller = new AbortController();
    const options = {accessToken, lang:callbacks.current.lang, signal:controller.signal};
    async function load() {
      try {
        let item = await loadStaffCase(caseId, options);
        if (controller.signal.aborted) return;
        if (item.assignmentStatus === 'UNASSIGNED_CLAIMABLE') {
          setResult({attempt, kind:'unassigned', item}); return;
        }
        if (sessionId) {
          const selected = await getLiveSession(caseId, sessionId, options);
          if (!controller.signal.aborted) setResult({attempt, item, selected, kind:operation === 'delivery' && selected.status !== 'OPEN' ? 'ended' : 'ready'});
          return;
        }
        if (['AWAITING_LEGAL_BASIS','LEGAL_BASIS_VERIFICATION'].includes(item.vaultStatus)) {
          const distributionWorkflow = await loadDistributionWorkflow(caseId, 'STAFF', options);
          if (controller.signal.aborted) return;
          item = {...item, distributionWorkflow};
        }
        if (!requireSession) {
          const waiting = staffSessionPrerequisite(item, callbacks.current.lang);
          const ready = !item.vaultStatus || ['UNLOCKED','HANDOVER_IN_PROGRESS','ARCHIVED'].includes(item.vaultStatus);
          setResult({attempt, item, kind:ready ? 'ready' : 'waiting', waiting}); return;
        }
        const sessions = await listLiveSessions(caseId, options);
        if (controller.signal.aborted) return;
        const selected = sessions.find(value => value.status === 'OPEN') || (sessions.length === 1 ? sessions[0] : null);
        if (selected) {
          // Persist the recovered selection so sidebar navigation keeps the same scope.
          const url = new URL(window.location.href);
          url.searchParams.set('sessionId', selected.sessionId);
          window.history.replaceState(window.history.state, '', url.pathname + url.search);
          setResult({attempt, kind:operation === 'delivery' && selected.status !== 'OPEN' ? 'ended' : 'ready', item, selected});
          callbacks.current.onSessionChange?.(selected.sessionId);
        } else setResult({attempt, kind:sessions.length ? 'choose-session' : 'waiting', item, sessions});
      } catch (error) {
        if (!controller.signal.aborted) {
          setResult({attempt, kind:'failure', error});
          if (error.status === 401) callbacks.current.onUnauthorized?.();
        }
      }
    }
    load();
    return () => controller.abort();
  }, [caseId, sessionId, accessToken, requireSession, operation, attempt]);
  const current = result?.attempt === attempt ? result : null;
  if (isHandoverId(caseId) && current?.kind === 'ready') {
    const selectedSessionId=current.selected?.sessionId || sessionId || '';
    const content=cloneElement(children,{caseItem:current.item,sessionId:selectedSessionId});
    return operation==='delivery' ? <StaffGroupHandover caseId={caseId} sessionId={selectedSessionId} accessToken={accessToken} lang={lang} onUnauthorized={onUnauthorized}>{content}</StaffGroupHandover> : content;
  }
  const failure = current?.kind === 'failure' ? workflowFailure(current.error, lang) : null;
  const waiting = current?.kind === 'waiting' ? staffSessionPrerequisite(current.item, lang) : null;
  const caseUrl = '/staff/cases' + (isHandoverId(caseId) ? `?caseId=${encodeURIComponent(caseId)}` : '');
  return <>
    <section className={`lv-staff-context-state${failure ? ' is-'+failure.kind : ''}`} role={failure && ['system','access'].includes(failure.kind) ? 'alert' : 'status'}>
      <h1>{!isHandoverId(caseId) ? (en ? 'Select a case first' : 'Chọn hồ sơ để tiếp tục')
        : !current ? (en ? 'Checking case and session…' : 'Đang kiểm tra hồ sơ và phiên…')
        : current.kind === 'unassigned' ? (en ? 'Staff must claim this case first' : 'Staff chưa nhận xử lý hồ sơ')
        : current.kind === 'choose-session' ? (en ? 'Select a handover session' : 'Chọn phiên bàn giao cần xem')
        : current.kind === 'ended' ? (en ? 'This session has ended' : 'Phiên này đã kết thúc bàn giao')
        : failure?.title || waiting?.title}</h1>
      <p>{!isHandoverId(caseId) ? (en ? 'Choose the case you want to work on from the list.' : 'Chọn hồ sơ bạn muốn xử lý từ danh sách.')
        : current?.kind === 'unassigned' ? (en ? 'Claim the case in the case queue before working on its handover.' : 'Nhận hồ sơ tại danh sách ca xác minh trước khi làm các bước bàn giao.')
        : current?.kind === 'ended' ? (en ? 'No further delivery is allowed. View the receipt records or case completion history.' : 'Không bàn giao thêm trong phiên này. Bạn có thể xem ký nhận hoặc lịch sử hoàn tất hồ sơ.')
        : failure?.description || waiting?.description}</p>
      {current?.kind === 'choose-session' && <label>{en ? 'Handover session' : 'Phiên bàn giao'}<select defaultValue="" onChange={event => onSessionChange?.(event.target.value)}>
        <option value="">{en ? 'Select a session' : 'Chọn phiên'}</option>{current.sessions.map(value => <option key={value.sessionId} value={value.sessionId}>{formatStaffSession(value, lang)}</option>)}
      </select></label>}
      <div className="lv-staff-context-state__actions">
        {(!isHandoverId(caseId) || failure) && <button type="button" onClick={() => setSelector(true)}>{en ? 'Choose case' : 'Chọn hồ sơ'}</button>}
        {current?.kind === 'unassigned' && <a href={caseUrl}>{en ? 'Go to case intake' : 'Đến hồ sơ để nhận xử lý'}</a>}
        {current?.kind === 'ended' && <a href={`/staff/beneficiary-confirmation?caseId=${encodeURIComponent(caseId)}&sessionId=${encodeURIComponent(current.selected.sessionId)}`}>{en ? 'View receipt records' : 'Xem lịch sử ký nhận'}</a>}
        {waiting && <a href={`${waiting.destination === 'basis' ? '/staff/legal-documents' : '/staff/handover'}?caseId=${encodeURIComponent(caseId)}`}>{waiting.destination === 'basis' ? (en ? 'View pending requirements' : 'Xem bước đang chờ') : (en ? 'Go to counter handover' : 'Đến bàn giao tại quầy')}</a>}
        {current && <button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Check latest status' : 'Kiểm tra trạng thái mới'}</button>}
      </div>
    </section>
    <StaffCaseSelectorModal isOpen={selector} onClose={() => setSelector(false)} onSelectCase={onCaseChange}
      accessToken={accessToken} lang={lang} currentCaseId={caseId} onUnauthorized={onUnauthorized} />
  </>;
}
