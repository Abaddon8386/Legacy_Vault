import { useEffect, useRef, useState } from 'react';
import LanguageToggle from '../../components/common/LanguageToggle.jsx';
import { fetchStaffCases } from './staffCaseService.js';
import { useStaffSessionExpiry, staffAuthFeedback } from './staffFeedback.js';
import { listLiveSessions, getLiveSession, openLiveSession, cancelLiveSession, isHandoverId, handoverUrl } from './liveHandoverService.js';
import './LiveHandoverPage.css';

function errorText(error, en) {
  const auth = staffAuthFeedback(error, en ? 'en' : 'vi');
  if (auth) return `${auth.title}. ${auth.description}`;
  const texts = {
    HANDOVER_SESSION_ALREADY_OPEN: ['Đã có phiên mở. Tải lại để chọn phiên hiện có.', 'A session is already open. Reload to select it.'],
    HANDOVER_SESSION_INVALID_STATE: ['Hồ sơ/kho chưa đủ điều kiện hoặc phiên đã thay đổi. Tải lại trước khi thao tác.', 'Case/vault is not eligible or the session has changed. Reload before continuing.'],
    RESOURCE_NOT_FOUND: ['Không tìm thấy hoặc hồ sơ/phiên không được giao cho bạn. Hãy nhận hồ sơ ở danh sách nếu phù hợp.', 'Case/session not found or not assigned to you. Claim an eligible case in the case queue.'],
    INVALID_RESPONSE: ['Dữ liệu máy chủ không hợp lệ. Chưa xác nhận thao tác thành công.', 'Invalid server response. The action has not been confirmed.'],
    LEGAL_APPROVAL_REQUIRED: ['Cần phê duyệt Legal còn hiệu lực trước khi mở phiên.', 'A current Legal approval is required before opening a session.'],
    LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ pháp lý đang tạm giữ; chưa thể mở phiên bàn giao.', 'The legal workflow is on hold; a handover session cannot be opened.'],
  };
  return texts[error?.code]?.[en ? 1 : 0] || (en ? 'Unable to complete the request. Reload to check the latest state before retrying.' : 'Chưa thực hiện được yêu cầu. Tải lại để kiểm tra trạng thái mới nhất trước khi thử lại.');
}

function CasePicker({ accessToken, lang, onChoose, onError }) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    const c = new AbortController();
    fetchStaffCases({ accessToken, lang, page, size: 5, signal: c.signal }).then(value => {
      if (!c.signal.aborted) { setResult({ ...value, requestPage: page, retry }); setError(null); }
    }).catch(err => { if (!c.signal.aborted) { setError({ err, page, retry }); errorRef.current(err); } });
    return () => c.abort();
  }, [accessToken, lang, page, retry]);
  const current = result?.requestPage === page && result?.retry === retry ? result : null;
  const failed = error?.page === page && error?.retry === retry ? error.err : null;
  return <section>
    <h2>{en ? 'Select a case' : 'Chọn hồ sơ'}</h2>
    <p>{en ? 'Select from the staff queue. Sessions are available only for cases assigned to you.' : 'Chọn từ danh sách staff. Chỉ hồ sơ đã giao cho bạn mới tải được phiên bàn giao.'}</p>
    {failed ? <p role="alert">{errorText(failed, en)}</p> : !current ? <p role="status">{en ? 'Loading cases…' : 'Đang tải hồ sơ…'}</p> : <ul>{current.content.map(item => <li key={item.caseId}>
      <button type="button" onClick={() => onChoose(item.caseId)}>{item.caseNumber} — {item.vaultName} — {item.ownerName}</button>
    </li>)}</ul>}
    {current?.content.length === 0 && <p>{en ? 'No cases on this page.' : 'Không có hồ sơ ở trang này.'}</p>}
    <button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{en ? 'Previous' : 'Trước'}</button>
    <span>{page + 1}</span>
    <button disabled={!current || page + 1 >= current.totalPages} onClick={() => setPage(p => p + 1)}>{en ? 'Next' : 'Sau'}</button>
    <button onClick={() => setRetry(v => v + 1)}>{en ? 'Reload cases' : 'Tải lại danh sách'}</button>
  </section>;
}

function Sessions({ caseId, requestedSessionId, accessToken, lang, onSession, onError, mode, reload }) {
  const en = lang === 'en';
  const [state, setState] = useState({ loading: true, sessions: [], selected: null, error: null });
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useState('');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const controller = useRef(null);
  const lock = useRef(false);
  const callbacks = useRef({ onSession, onError });
  useEffect(() => { callbacks.current = { onSession, onError }; }, [onSession, onError]);
  useEffect(() => {
    const c = new AbortController(); controller.current = c; lock.current = true;
    async function load() {
      try {
        const sessions = await listLiveSessions(caseId, { accessToken, signal: c.signal });
        const selectedId = requestedSessionId || sessions.find(item => item.status === 'OPEN')?.sessionId;
        const selected = selectedId ? await getLiveSession(caseId, selectedId, { accessToken, signal: c.signal }) : null;
        if (!c.signal.aborted) {
          setState({ loading: false, sessions, selected, error: null });
          callbacks.current.onSession(selected?.sessionId || null);
        }
      } catch (error) {
        if (!c.signal.aborted) { setState({ loading: false, sessions: [], selected: null, error }); callbacks.current.onError(error); }
      } finally { if (!c.signal.aborted) lock.current = false; }
    }
    load();
    return () => { c.abort(); controller.current?.abort(); };
    // The parent remounts this component for case, token and explicit reload changes.
  }, [caseId, accessToken, requestedSessionId]);
  async function act(action) {
    if (lock.current) return;
    lock.current = true; const c = new AbortController(); controller.current = c;
    setPending(true); setNotice(''); setConfirmCancel(false);
    try {
      const value = await action({ accessToken, lang, signal: c.signal });
      if (!c.signal.aborted) {
        setState(prev => ({ ...prev, selected: value, error: null, sessions: [value, ...prev.sessions.filter(item => item.sessionId !== value.sessionId)] }));
        callbacks.current.onSession(value.sessionId);
        setNotice(en ? 'Server confirmed the session.' : 'Máy chủ đã xác nhận phiên.');
      }
    } catch (error) {
      if (!c.signal.aborted) { setState(prev => ({ ...prev, error })); callbacks.current.onError(error); }
    } finally { if (!c.signal.aborted) { setPending(false); lock.current = false; } }
  }
  const { selected, sessions, error, loading } = state;
  const openExists = sessions.some(item => item.status === 'OPEN');
  const statuses = en ? { OPEN: 'Open', COMPLETED: 'Completed', CANCELLED: 'Cancelled' } : { OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
  return <section aria-busy={loading || pending}>
    <h2>{en ? 'Handover sessions' : 'Phiên bàn giao'}</h2>
    {(loading || pending) && <p role="status"><progress aria-label={en ? 'Processing' : 'Đang xử lý'} /> {en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{errorText(error, en)}</p>}
    {notice && <p role="status">{notice}</p>}
    <button disabled={pending} onClick={reload}>{en ? 'Reload sessions' : 'Tải lại phiên'}</button>
    <p>{en ? 'Opening a session requires an assigned OPEN case, an eligible unlocked vault and current Legal approval. The server checks these conditions.' : 'Mở phiên cần hồ sơ OPEN được giao cho bạn, kho đã mở khóa đúng trạng thái và phê duyệt Legal còn hiệu lực. Máy chủ kiểm tra các điều kiện này.'}</p>
    <button disabled={loading || pending || Boolean(error) || openExists || selected?.status === 'COMPLETED' || mode === 'accounts'} onClick={() => act(options => openLiveSession(caseId, options))}>{en ? 'Open handover session' : 'Mở phiên bàn giao'}</button>
    {!loading && !error && sessions.length === 0 && <p>{en ? 'No sessions yet.' : 'Chưa có phiên bàn giao.'}</p>}
    <ul>{sessions.map(item => <li key={item.sessionId}>
      <button disabled={pending || loading || Boolean(error)} onClick={() => act(options => getLiveSession(caseId, item.sessionId, options))}>{statuses[item.status]} — {item.openedAt} — {item.sessionId}</button>
    </li>)}</ul>
    {selected && <div>
      <h3>{en ? 'Selected session' : 'Phiên đang xem'}</h3>
      <p>{statuses[selected.status]} — {selected.sessionId}</p>
      <p>{en ? 'Opened (server time)' : 'Mở lúc (giờ máy chủ)'}: {selected.openedAt}</p>
      {selected.closedAt && <p>{en ? 'Closed (server time)' : 'Đóng lúc (giờ máy chủ)'}: {selected.closedAt}</p>}
      <a href={handoverUrl(mode === 'accounts' ? '/staff/handover' : '/staff/beneficiary-accounts', caseId, selected.sessionId)}>{mode === 'accounts' ? (en ? 'Back to session' : 'Về phiên bàn giao') : (en ? 'Beneficiary accounts at counter' : 'Tài khoản người thụ hưởng tại quầy')}</a>
      {' · '}<a href={handoverUrl('/staff/asset-handover', caseId, selected.sessionId)}>{en ? 'Asset handover (integration PS-97)' : 'Bàn giao tài sản (chờ tích hợp PS-97)'}</a>
      <div><button disabled={pending || loading || Boolean(error) || selected.status !== 'OPEN' || mode === 'accounts'} onClick={() => setConfirmCancel(true)}>{en ? 'Cancel session…' : 'Hủy phiên…'}</button></div>
      {confirmCancel && <div role="group" aria-label={en ? 'Confirm cancellation' : 'Xác nhận hủy phiên'}>
        <p>{en ? 'Cancel this open session?' : 'Hủy phiên đang mở này?'}</p>
        <button disabled={pending} onClick={() => act(options => cancelLiveSession(caseId, selected.sessionId, options))}>{en ? 'Confirm cancellation' : 'Xác nhận hủy'}</button>
        <button onClick={() => setConfirmCancel(false)}>{en ? 'Keep session' : 'Giữ phiên'}</button>
      </div>}
    </div>}
    <aside role="note"><h3>{en ? 'Awaiting counter data — PS-88' : 'Chờ dữ liệu tại quầy — PS-88'}</h3>
      <p>{en ? 'The server has account creation/linking APIs, but the authorized beneficiary list, identity and invitation context are not available yet. These actions remain disabled; no fabricated recipient or UUID entry is used.' : 'Máy chủ đã có API tạo/liên kết tài khoản, nhưng chưa bàn giao danh sách người thụ hưởng, trạng thái xác minh và mã mời theo quyền. Các thao tác này chưa mở; không dùng người nhận giả hoặc yêu cầu nhập UUID.'}</p>
      <p>{en ? 'A recipient who declines an account follows the offline process with required evidence. No account is automatically created.' : 'Người nhận không muốn tài khoản vẫn theo quy trình bên ngoài với bằng chứng bắt buộc. Không tự tạo tài khoản.'}</p>
      <button disabled>{en ? 'Create / link beneficiary account' : 'Tạo / liên kết tài khoản người thụ hưởng'}</button>
    </aside>
  </section>;
}

export default function LiveHandoverPage(props) {
  // Replacing the authenticated token discards every state/request from the old session.
  return <LiveHandoverContent key={props.accessToken} {...props} />;
}
function LiveHandoverContent({ accessToken, lang = 'vi', onLogout, onToggleLang, mode = 'sessions' }) {
  const en = lang === 'en';
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const [caseId, setCaseId] = useState(() => isHandoverId(query.get('caseId')) ? query.get('caseId') : null);
  const [requested, setRequested] = useState(() => isHandoverId(query.get('caseId')) && isHandoverId(query.get('sessionId')) ? query.get('sessionId') : null);
  const [revision, setRevision] = useState(0);
  const notify = useStaffSessionExpiry({ accessToken, onUnauthorized: onLogout });
  const keepContext = sessionId => {
    const url = new URL(window.location.href);
    if (caseId) url.searchParams.set('caseId', caseId); else url.searchParams.delete('caseId');
    if (caseId && sessionId) url.searchParams.set('sessionId', sessionId); else url.searchParams.delete('sessionId');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
  };
  return <main className="lv-live-handover">
    <header><a href="/staff/cases">{en ? 'Staff cases' : 'Danh sách hồ sơ'}</a><LanguageToggle lang={lang} onToggleLang={onToggleLang} /><button onClick={onLogout}>{en ? 'Sign out' : 'Đăng xuất'}</button></header>
    <h1>{mode === 'accounts' ? (en ? 'Beneficiary accounts at counter' : 'Tài khoản người thụ hưởng tại quầy') : (en ? 'Counter handover sessions' : 'Phiên bàn giao tại quầy')}</h1>
    {!caseId ? <CasePicker accessToken={accessToken} lang={lang} onError={notify} onChoose={id => {
      setCaseId(id); setRequested(null);
      window.history.replaceState(window.history.state, '', handoverUrl(window.location.pathname, id));
    }} /> : <>
      <p>{en ? 'Case' : 'Hồ sơ'}: {caseId}</p>
      <button onClick={() => { keepContext(null); setCaseId(null); setRequested(null); window.history.replaceState(window.history.state, '', window.location.pathname); }}>{en ? 'Choose another case' : 'Chọn hồ sơ khác'}</button>
      <Sessions key={`${caseId}:${revision}`} caseId={caseId} requestedSessionId={requested} accessToken={accessToken} lang={lang} mode={mode} onError={notify} onSession={keepContext}
        reload={() => { setRequested(new URLSearchParams(window.location.search).get('sessionId')); setRevision(v => v + 1); }} />
    </>}
  </main>;
}
