import { useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import { ApiError } from '../../api/http.js';
import { LEGAL_NAVIGATION_REGISTRY } from '../../utils/legalNavigation.js';
import { workflowFailure } from '../../utils/workflowFeedback.js';
import { workflowNotificationStatus } from '../../utils/workflowNotificationFeedback.js';
import { decideReopenRequest, loadGroupHandoverEvents, loadLegalGroupHandover, loadReopenRequests } from '../../services/legalGroupHandoverService.js';
import { loadDistributionWorkflow } from '../../workflows/distributionWorkflowService.js';
import { legalDate } from './legalPresentation.js';
import './LegalHandoverReopen.css';

const unlockPath = LEGAL_NAVIGATION_REGISTRY.find(item => item.id === 'controlled-unlock').path;
const DECISION_TIMEOUT_MS = 20000;
const statusText = {
  UNCONFIRMED: ['Staff chưa ghi nhận người có mặt', 'Staff has not recorded attendance'],
  SUSPENDED: ['Toàn bộ bàn giao đang tạm khóa', 'The whole handover is suspended'],
  AWAITING_LEGAL: ['Đang chờ Legal xét yêu cầu mở lại', 'Awaiting Legal reopening decision'],
  READY: ['Đã đủ điều kiện về người nhận; chưa đồng nghĩa đã bàn giao', 'Recipient requirement satisfied; this does not mean delivered'],
};

const operationText = {
  ATTENDANCE: ['Staff ghi nhận người có mặt', 'Staff recorded attendance'],
  REQUEST: ['Staff gửi yêu cầu mở lại', 'Staff requested reopening'],
  APPROVE: ['Legal cho phép mở lại', 'Legal allowed reopening'],
  REJECT: ['Legal từ chối mở lại', 'Legal refused reopening'],
};

/** Reopen decisions never claim a result the server did not confirm; an unknown outcome is re-read before anything is retried. */
function reopenFailure(error, lang) {
  const en = lang === 'en';
  if (error?.code === 'TIMEOUT' || error?.code === 'NETWORK_ERROR') {
    return en ? 'No confirmation was received, so it is not known whether the decision was saved. The latest status has been reloaded; if the request is still pending you can send it again without creating a duplicate decision.'
      : 'Chưa nhận được xác nhận nên chưa biết quyết định đã lưu hay chưa. Trạng thái mới nhất đã được tải lại; nếu yêu cầu vẫn đang chờ, bạn có thể gửi lại mà không tạo quyết định trùng.';
  }
  if (['GROUP_HANDOVER_BLOCKED', 'GROUP_HANDOVER_STALE'].includes(error?.code)) {
    return en ? 'The request changed or is no longer valid (attendance, allocation or approval may have changed, or it was already handled). Nothing was saved from this action; the latest status has been reloaded.'
      : 'Yêu cầu đã thay đổi hoặc không còn hiệu lực (điểm danh, phân bổ hoặc phê duyệt có thể đã đổi, hoặc đã có người xử lý). Thao tác này chưa lưu gì; trạng thái mới nhất đã được tải lại.';
  }
  return workflowFailure(error, lang).description;
}

export default function LegalHandoverReopen({ session, lang = 'vi', caseId = '', onNavigate, onUnauthorized }) {
  return <ReopenScope key={`${session.accessToken}:${lang}`} session={session} lang={lang} caseId={caseId}
    onNavigate={onNavigate} onUnauthorized={onUnauthorized} />;
}

function ReopenScope({ session, lang, caseId, onNavigate, onUnauthorized }) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const [attempt, setAttempt] = useState(0);
  const [list, setList] = useState(null);
  const [opened, setOpened] = useState(null);
  const [outcome, setOutcome] = useState(null);
  const [selected, setSelected] = useState(null);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    if (!caseId) return undefined;
    const c = new AbortController();
    // The selected case has its own filtered read, so its request is found even when it is beyond the first page of the list.
    loadReopenRequests({ caseId, size: 1 }, { accessToken: session.accessToken, lang, signal: c.signal }).then(data => {
      if (!c.signal.aborted) setSelected({ caseId, attempt, item: data.content[0] ?? null, error: null });
    }).catch(error => {
      if (c.signal.aborted) return;
      setSelected({ caseId, attempt, item: null, error });
      if (error.status === 401) auth.current?.();
    });
    return () => c.abort();
  }, [caseId, session.accessToken, lang, attempt]);
  useEffect(() => {
    const c = new AbortController();
    loadReopenRequests({ page }, { accessToken: session.accessToken, lang, signal: c.signal }).then(data => {
      if (!c.signal.aborted) setList({ attempt, page, data, error: null });
    }).catch(error => {
      if (c.signal.aborted) return;
      setList({ attempt, page, data: null, error });
      if (error.status === 401) auth.current?.();
    });
    return () => c.abort();
  }, [session.accessToken, lang, page, attempt]);
  useEffect(() => {
    const refresh = () => setAttempt(value => value + 1);
    window.addEventListener('focus', refresh);
    window.addEventListener('lv-workflow-notifications-changed', refresh);
    return () => { window.removeEventListener('focus', refresh); window.removeEventListener('lv-workflow-notifications-changed', refresh); };
  }, []);
  const current = list?.attempt === attempt && list.page === page ? list : null;
  const items = list?.data?.content;
  const forCase = selected?.caseId === caseId && selected.attempt === attempt ? selected : null;
  const found = forCase ? forCase.item : items?.find(item => item.caseId === caseId);
  // A newer request of the same case replaces the opened one; the opened one is kept only once it was decided and left the list.
  const target = found ?? (opened?.caseId === caseId ? opened : null);
  const open = item => {
    setOpened(item); setOutcome(null);
    onNavigate?.(`${unlockPath}?${new URLSearchParams({ lang, caseId: item.caseId })}`);
  };
  return <section className="lv-legal-live__card lv-legal-reopen" aria-label={en ? 'Handover reopening requests' : 'Yêu cầu mở lại bàn giao'} aria-busy={!current}>
    <div className="lv-legal-reopen__head">
      <h2>{en ? 'Handover reopening requests' : 'Yêu cầu mở lại bàn giao'}</h2>
      <button type="button" disabled={!current} onClick={() => setAttempt(value => value + 1)}><RefreshCw size={16} aria-hidden="true" />{en ? 'Refresh' : 'Cập nhật'}</button>
    </div>
    <p className="lv-legal-reopen__note">{en ? 'Staff has recorded that everyone is present and asks to reopen. Only Legal decides; allowing it does not mean any asset has been delivered.'
      : 'Staff đã ghi nhận đủ người nhận và đề nghị mở lại. Chỉ Legal quyết định; cho phép mở lại không đồng nghĩa đã bàn giao tài sản.'}</p>
    {outcome?.caseId === caseId && <FeedbackNotice tone="success" title={outcome.decision === 'APPROVE' ? (en ? 'Reopening allowed.' : 'Đã cho phép mở lại bàn giao.') : (en ? 'Reopening refused.' : 'Đã từ chối mở lại bàn giao.')}>
      <p>{workflowNotificationStatus(outcome, 'STAFF', lang).trim()}</p>
    </FeedbackNotice>}
    {!list && <p role="status">{en ? 'Loading requests…' : 'Đang tải yêu cầu…'}</p>}
    {current?.error && <div role="alert"><p>{workflowFailure(current.error, lang).description}</p>
      <button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Try again' : 'Thử lại'}</button></div>}
    {items?.length === 0 && !current?.error && <p>{en ? 'No reopening request is waiting for Legal.' : 'Hiện không có yêu cầu mở lại nào đang chờ Legal xét.'}</p>}
    {!!items?.length && <ul className="lv-legal-reopen__list">{items.map(item => <li key={item.requestId} aria-current={item.caseId === caseId ? 'true' : undefined}>
      <div><strong>{item.caseNumber}</strong> · {item.vaultName}</div>
      <p>{en ? 'Requested by ' : 'Staff yêu cầu: '}{item.requestedBy.fullName} · {legalDate(item.requestedAt)}</p>
      <p>{en ? `Present ${item.presentRecipients}/${item.requiredRecipients} recipients · delivered ${item.deliveredAssets}/${item.totalAssets} assets`
        : `Đã có mặt ${item.presentRecipients}/${item.requiredRecipients} người nhận · đã giao ${item.deliveredAssets}/${item.totalAssets} tài sản`}</p>
      <button type="button" className="lv-legal-primary" onClick={() => open(item)}>{en ? 'Review request' : 'Xem và xét yêu cầu'}</button>
    </li>)}</ul>}
    {list?.data?.totalPages > 1 && <div role="group" aria-label={en ? 'Request pages' : 'Trang yêu cầu'} className="lv-legal-reopen__pages">
      <button type="button" disabled={!current || page === 0} onClick={() => setPage(value => value - 1)}>{en ? 'Previous' : 'Trước'}</button>
      <span>{page + 1} / {list.data.totalPages}</span>
      <button type="button" disabled={!current || page + 1 >= list.data.totalPages} onClick={() => setPage(value => value + 1)}>{en ? 'Next' : 'Sau'}</button>
    </div>}
    {target && <ReopenDetail key={target.requestId} item={target} session={session} lang={lang}
      onDecided={result => { setOutcome({ ...result, caseId: target.caseId }); setOpened(target); }} onUnauthorized={onUnauthorized} />}
    {forCase?.error && <p role="alert">{workflowFailure(forCase.error, lang).description}</p>}
    {caseId && !target && forCase && !forCase.error && <p>{en ? 'The selected case has no reopening request waiting for Legal.' : 'Hồ sơ đang chọn hiện không có yêu cầu mở lại nào đang chờ Legal xét.'}</p>}
  </section>;
}

function ReopenDetail({ item, session, lang, onDecided, onUnauthorized }) {
  const en = lang === 'en';
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  // A failed decision stays visible across the re-read that follows it; only a read failure belongs to `error`.
  const [saveError, setSaveError] = useState(null);
  const lock = useRef(false);
  const mutation = useRef(null);
  const retry = useRef(null);
  const unmounted = useRef(false);
  const draftRevision = useRef(null);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => { unmounted.current = false; return () => { unmounted.current = true; mutation.current?.abort(); }; }, []);
  useEffect(() => {
    const c = new AbortController();
    const options = { accessToken: session.accessToken, lang, signal: c.signal };
    Promise.all([
      loadLegalGroupHandover(item.caseId, item.sessionId, options),
      // Recipient names come from the Legal-readable allocation of the same case; a missing one blocks the decision instead of showing an id.
      loadDistributionWorkflow(item.caseId, 'LEGAL', options).catch(() => null),
      // History is context for the decision; when it cannot be read the decision itself stays available.
      loadGroupHandoverEvents(item.caseId, item.sessionId, { size: 10 }, options).catch(() => null),
    ]).then(([view, workflow, history]) => {
      if (c.signal.aborted) return;
      if (draftRevision.current !== view.state.revision) { setReason(''); draftRevision.current = view.state.revision; }
      setResult({ attempt, view, workflow, history }); setError(null);
    }).catch(failure => {
      if (c.signal.aborted) return;
      setResult({ attempt, view: null, workflow: null, history: null }); setError(failure);
      if (failure.status === 401) auth.current?.();
    });
    return () => c.abort();
  }, [item.caseId, item.sessionId, session.accessToken, lang, attempt]);
  useEffect(() => {
    const focus = () => { if (!lock.current) setAttempt(value => value + 1); };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, []);
  const current = result?.attempt === attempt ? result : null;
  const view = current?.view;
  const names = new Map((current?.workflow?.allocation?.items || []).filter(row => row.recipientName.trim()).map(row => [row.beneficiaryId, row.recipientName.trim()]));
  const namesReady = !!view && view.requiredRecipientIds.every(id => names.has(id));
  const present = new Set(view?.attendance?.presentRecipientIds || []);
  const request = view?.request;
  const decidable = !!view && view.capabilities.canDecide && !!request && view.state.requestId === request.requestId && namesReady;

  async function save(decision) {
    if (lock.current || !decidable || !reason.trim()) return;
    lock.current = true; setBusy(true); setSaveError(null);
    const c = new AbortController(); mutation.current = c;
    let timedOut = false;
    const timer = setTimeout(() => { timedOut = true; c.abort(); }, DECISION_TIMEOUT_MS);
    const body = { caseId: item.caseId, sessionId: item.sessionId, requestId: request.requestId, decision,
      expectedRevision: view.state.revision, reason: reason.trim() };
    const fingerprint = JSON.stringify(body);
    if (retry.current?.fingerprint !== fingerprint) retry.current = { fingerprint, key: crypto.randomUUID() };
    try {
      const receipt = await decideReopenRequest(body, retry.current.key, { accessToken: session.accessToken, lang, signal: c.signal });
      if (unmounted.current) return;
      retry.current = null; setReason('');
      onDecided({ decision, notification: receipt.notification });
      window.dispatchEvent(new window.Event('lv-workflow-notifications-changed'));
      setAttempt(value => value + 1);
    } catch (failure) {
      if (unmounted.current || (c.signal.aborted && !timedOut)) return;
      const unknown = timedOut || failure.code === 'NETWORK_ERROR';
      const shown = timedOut ? new ApiError('TIMEOUT') : failure;
      setSaveError(shown);
      if (shown.status === 401) auth.current?.();
      if (failure.status === 409) retry.current = null;
      if (unknown || failure.status === 409) setAttempt(value => value + 1);
    } finally {
      clearTimeout(timer);
      if (!unmounted.current) { lock.current = false; setBusy(false); }
    }
  }

  return <div className="lv-legal-reopen__detail" aria-busy={busy || !current}>
    <h3>{item.caseNumber} · {item.vaultName}</h3>
    {error && <p role="alert">{workflowFailure(error, lang).description}</p>}
    {saveError && <p role="alert">{reopenFailure(saveError, lang)}</p>}
    {!current && !error && <p role="status">{en ? 'Loading the current handover status…' : 'Đang tải tình hình bàn giao hiện hành…'}</p>}
    {error && !view && <button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Try again' : 'Thử lại'}</button>}
    {view && <>
      <p role="status"><strong>{statusText[view.state.status]?.[en ? 1 : 0]}</strong></p>
      <p>{en ? `Delivered ${view.progress.deliveredAssets}/${view.progress.totalAssets} assets` : `Đã giao ${view.progress.deliveredAssets}/${view.progress.totalAssets} tài sản`}</p>
      {!namesReady ? <p role="alert">{en ? 'The current recipient list could not be confirmed. Refresh before deciding.' : 'Chưa xác nhận được danh sách người nhận hiện hành. Hãy cập nhật trước khi quyết định.'}</p>
        : <ul className="lv-legal-reopen__people" aria-label={en ? 'Recipients and attendance' : 'Người nhận và tình hình có mặt'}>
          {view.requiredRecipientIds.map(id => <li key={id}><span>{names.get(id)}</span>
            <span className={present.has(id) ? 'is-present' : 'is-absent'}>{present.has(id) ? (en ? 'Present' : 'Có mặt') : (en ? 'Not present' : 'Chưa có mặt')}</span></li>)}
        </ul>}
      {view.attendance && <div className="lv-legal-reopen__request"><h4>{en ? 'Latest attendance record' : 'Ghi nhận có mặt gần nhất của Staff'}</h4>
        <p>{view.attendance.recordedBy.fullName} · {legalDate(view.attendance.recordedAt)}</p><p>{view.attendance.reason}</p></div>}
      {request && <div className="lv-legal-reopen__request"><h4>{en ? 'Staff request' : 'Yêu cầu của Staff'}</h4>
        <p>{request.requestedBy.fullName} · {legalDate(request.requestedAt)}</p><p>{request.reason}</p></div>}
      {view.lastDecision && <div className="lv-legal-reopen__request"><h4>{en ? 'Latest Legal decision' : 'Quyết định gần nhất của Legal'}</h4>
        <p>{view.lastDecision.result === 'APPROVE' ? (en ? 'Reopening allowed' : 'Cho phép mở lại') : (en ? 'Reopening refused' : 'Từ chối mở lại')} · {view.lastDecision.decidedBy.fullName} · {legalDate(view.lastDecision.decidedAt)}</p>
        <p>{view.lastDecision.reason}</p></div>}
      <div className="lv-legal-reopen__history"><h4>{en ? 'History of locks, requests and decisions' : 'Lịch sử khóa, yêu cầu và quyết định'}</h4>
        {!current.history ? <p>{en ? 'The history could not be loaded.' : 'Chưa tải được lịch sử.'}</p>
          : !current.history.content.length ? <p>{en ? 'No events yet.' : 'Chưa có sự kiện nào.'}</p>
          : <ol>{current.history.content.map(event => <li key={event.eventId}>
            <strong>{operationText[event.operation][en ? 1 : 0]}</strong><span>{event.by.fullName} · {legalDate(event.at)}</span><span>{event.reason}</span></li>)}</ol>}
        {current.history?.totalElements > current.history?.content.length && <p>{en ? `Showing the latest ${current.history.content.length} of ${current.history.totalElements} events.` : `Đang hiển thị ${current.history.content.length} sự kiện mới nhất trong ${current.history.totalElements}.`}</p>}
      </div>
      {decidable ? <div className="lv-legal-reopen__decision">
        <label>{en ? 'Reason for your decision' : 'Lý do quyết định'}
          <textarea maxLength={1000} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} /></label>
        <div className="lv-legal-reopen__actions">
          <button type="button" className="lv-legal-primary" disabled={busy || !reason.trim()} onClick={() => save('APPROVE')}>{en ? 'Allow reopening' : 'Cho phép mở lại'}</button>
          <button type="button" className="lv-legal-danger" disabled={busy || !reason.trim()} onClick={() => save('REJECT')}>{en ? 'Refuse reopening' : 'Từ chối mở lại'}</button>
        </div></div>
        : view.state.status === 'AWAITING_LEGAL' && namesReady && <p role="status">{en ? 'This request can no longer be decided because attendance, allocation or approval changed. Staff must record attendance and request again.'
          : 'Yêu cầu này không còn xét được vì điểm danh, phân bổ hoặc phê duyệt đã thay đổi. Staff cần ghi nhận và gửi lại.'}</p>}
    </>}
  </div>;
}
