import { useEffect, useRef, useState } from 'react';
import { fetchStaffCases } from './staffCaseService.js';
import { useStaffSessionExpiry, staffAuthFeedback } from './staffFeedback.js';
import { listLiveSessions, getLiveSession, openLiveSession, cancelLiveSession, isHandoverId, handoverUrl } from './liveHandoverService.js';
import './LiveHandoverPage.css';
import { trackOwnerSurface } from '../../components/layout/ownerSurfaceMotion.js';
import '../../components/layout/OwnerSurfaces.css';
import StaffWorkflowGuide from '../../components/staff/StaffWorkflowGuide.jsx';
import { WorkflowActionHint } from '../../components/common/WorkflowGuide.jsx';
import StaffCaseLinkPanel from './StaffCaseLinkPanel.jsx';
import LegacyCounterBeneficiariesSection from './LegacyCounterBeneficiariesSection.jsx';

function sessionTime(value, en) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(en ? 'en-GB' : 'vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
}

function errorText(error, en, caseItem) {
  const auth = staffAuthFeedback(error, en ? 'en' : 'vi');
  if (auth) return `${auth.title}. ${auth.description}`;
  if ((error?.code === 'RESOURCE_NOT_FOUND' || error?.status === 404) && caseItem?.status === 'CLOSED') {
    return en
      ? 'This verification case is closed. Counter identity checks and account management are only available for open cases.'
      : 'Hồ sơ xác minh này đã đóng. Thao tác đối chiếu căn cước và quản lý tài khoản tại quầy chỉ áp dụng cho hồ sơ đang mở.';
  }
  const texts = {
    HANDOVER_SESSION_ALREADY_OPEN: ['Đã có phiên mở. Tải lại để chọn phiên hiện có.', 'A session is already open. Reload to select it.'],
    HANDOVER_SESSION_INVALID_STATE: [
      'Phiên bàn giao hoặc hồ sơ hiện không ở trạng thái cho phép thao tác này. Vui lòng kiểm tra lại phiên đang chọn hoặc mở phiên mới nếu phiên cũ đã kết thúc.',
      'This handover session or case is not in an eligible state for this action. Please check the selected session or open a new one if the previous session has ended.'
    ],
    RESOURCE_NOT_FOUND: ['Không tìm thấy hoặc hồ sơ/phiên không được giao cho bạn. Hãy nhận hồ sơ ở danh sách nếu phù hợp.', 'Case/session not found or not assigned to you. Claim an eligible case in the case queue.'],
    INVALID_RESPONSE: ['Dữ liệu máy chủ không hợp lệ. Chưa xác nhận thao tác thành công.', 'Invalid server response. The action has not been confirmed.'],
    LEGAL_APPROVAL_REQUIRED: [
      'Cần có phê duyệt Pháp lý còn hiệu lực trước khi mở phiên bàn giao. Nhân viên vui lòng kiểm tra tiến trình thẩm định tại mục Hồ sơ căn cứ.',
      'A valid Legal approval is required before opening a handover session. Staff should verify review progress in the Legal Basis Documents section.'
    ],
    LEGAL_WORKFLOW_ON_HOLD: [
      'Hồ sơ đang ở trạng thái Tạm dừng (ON_HOLD) từ Pháp lý. Nhân viên vui lòng kiểm tra mục Hồ sơ căn cứ để bổ sung giấy tờ phân chia theo yêu cầu trước khi mở phiên bàn giao.',
      'The dossier is ON HOLD by Legal. Staff should check the Legal Basis Documents page to supplement partition documents as requested before opening a handover session.'
    ],
  };
  return texts[error?.code]?.[en ? 1 : 0] || (en ? 'Unable to complete the request. Reload to check the latest state before retrying.' : 'Chưa thực hiện được yêu cầu. Tải lại để kiểm tra trạng thái mới nhất trước khi thử lại.');
}

function CasePicker({ accessToken, lang, onChoose, onError }) {
  const en = lang === 'en';
  const [page, setPage] = useState(0);
  const [retry, setRetry] = useState(0);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeQuery, setActiveQuery] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const errorRef = useRef(onError);
  useEffect(() => { errorRef.current = onError; }, [onError]);
  useEffect(() => {
    const c = new AbortController();
    fetchStaffCases({ accessToken, lang, page, size: 5, q: activeQuery, signal: c.signal }).then(value => {
      if (!c.signal.aborted) { setResult({ ...value, requestPage: page, retry, query: activeQuery }); setError(null); }
    }).catch(err => { if (!c.signal.aborted) { setError({ err, page, retry, query: activeQuery }); errorRef.current(err); } });
    return () => c.abort();
  }, [accessToken, lang, page, retry, activeQuery]);
  const current = result?.requestPage === page && result?.retry === retry && result?.query === activeQuery ? result : null;
  const failed = error?.page === page && error?.retry === retry && error?.query === activeQuery ? error.err : null;

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(0);
    setActiveQuery(searchQuery.trim());
  };

  return <section className="lv-live-case-picker">
    <h2>{en ? 'Select a case' : 'Chọn hồ sơ'}</h2>
    <form onSubmit={handleSearch} style={{ marginBottom: '1rem', display: 'flex', gap: '0.5rem' }}>
      <input
        type="search"
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
        placeholder={en ? 'Search case number, vault, owner…' : 'Tìm số hồ sơ, tên kho, chủ sở hữu…'}
      />
      <button type="submit">{en ? 'Search' : 'Tìm kiếm'}</button>
      {activeQuery && (
        <button type="button" onClick={() => { setSearchQuery(''); setActiveQuery(''); setPage(0); }}>
          {en ? 'Clear' : 'Xóa tìm kiếm'}
        </button>
      )}
    </form>
    {failed ? <p role="alert">{errorText(failed, en)}</p> : !current ? <p role="status">{en ? 'Loading cases…' : 'Đang tải hồ sơ…'}</p> : <ul>{current.content.map(item => <li key={item.caseId}>
      <button className="lv-live-case-option" type="button" onClick={() => onChoose(item.caseId, item)}><strong>{item.caseNumber}</strong><span>{item.vaultName}</span><small>{item.ownerName}</small></button>
    </li>)}</ul>}
    {current?.content.length === 0 && <p>{en ? 'No cases found.' : 'Không tìm thấy hồ sơ nào.'}</p>}
    <div className="lv-live-case-pagination"><button disabled={page === 0} onClick={() => setPage(p => p - 1)}>{en ? 'Previous' : 'Trước'}</button>
    <span>{page + 1}</span>
    <button disabled={!current || page + 1 >= current.totalPages} onClick={() => setPage(p => p + 1)}>{en ? 'Next' : 'Sau'}</button>
    <button onClick={() => setRetry(v => v + 1)}>{en ? 'Reload cases' : 'Tải lại danh sách'}</button>
    </div>
  </section>;
}

function Sessions({ caseId, caseItem, requestedSessionId, accessToken, lang, onSession, onError, mode, reload, counterLinkActions }) {
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
  const isCaseClosed = caseItem?.status === 'CLOSED';
  const openBlocked = loading || pending ? (en ? 'Wait for the session status check.' : 'Chờ kiểm tra trạng thái phiên.')
    : error ? (en ? 'Reload the session status before opening a new one.' : 'Tải lại trạng thái phiên trước khi mở mới.')
      : isCaseClosed ? (en ? 'This case is closed.' : 'Hồ sơ đã đóng.')
        : openExists ? (en ? 'An open session already exists. Select it below.' : 'Đã có phiên đang mở. Chọn phiên đó bên dưới.')
          : selected?.status === 'COMPLETED' ? (en ? 'This session is complete. Continue to closing and archiving.' : 'Phiên đã hoàn tất. Chuyển sang đóng và lưu trữ.')
            : mode === 'accounts' ? (en ? 'Open sessions from the handover page.' : 'Mở phiên tại trang bàn giao.') : '';
  const statuses = en ? { OPEN: 'Open', COMPLETED: 'Completed', CANCELLED: 'Cancelled' } : { OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
  return <section className="lv-session-panel" aria-busy={loading || pending}>
    <StaffWorkflowGuide current="handover" caseId={caseId} sessionId={selected?.sessionId} caseStatus={caseItem?.status}
      vaultStatus={caseItem?.vaultStatus} sessionStatus={selected?.status} loading={loading} error={error} lang={lang} />
    <div className="lv-session-panel-heading">
      <div>
        <h2>{en ? 'Handover sessions' : 'Phiên bàn giao'} <span className="lv-session-count">{sessions.length}</span></h2>
      </div>
      <button className="lv-live-secondary" disabled={pending} onClick={reload}>{en ? 'Reload sessions' : 'Tải lại phiên'}</button>
    </div>
    {(loading || pending) && <p role="status"><progress aria-label={en ? 'Processing' : 'Đang xử lý'} /> {en ? 'Processing…' : 'Đang xử lý…'}</p>}
    {error && <p role="alert">{errorText(error, en, caseItem)}</p>}
    {notice && <p role="status">{notice}</p>}
    <details className="lv-session-guidance"><summary>{en ? 'Requirements for a new session' : 'Điều kiện mở phiên mới'}</summary>
      <p>{en ? 'The case must be open and assigned to you, with the vault unlocked and a current Legal approval.' : 'Hồ sơ đang mở và được giao cho bạn; kho đã mở khóa và phê duyệt pháp lý còn hiệu lực.'}</p>
    </details>
    {isCaseClosed && (
      <p role="note" className="lv-live-closed-notice">
        {en ? 'This verification case is closed. New handover sessions cannot be opened.' : 'Hồ sơ xác minh này đã đóng. Không thể mở phiên bàn giao mới.'}
      </p>
    )}
    <button className="lv-live-primary" disabled={Boolean(openBlocked)} aria-describedby={openBlocked ? 'open-session-blocked' : undefined} onClick={() => act(options => openLiveSession(caseId, options))}>{en ? 'Open handover session' : 'Mở phiên bàn giao'}</button>
    <WorkflowActionHint id="open-session-blocked" reason={openBlocked} />
    {!loading && !error && sessions.length === 0 && <p>{en ? 'No sessions yet.' : 'Chưa có phiên bàn giao.'}</p>}
    <ul className="lv-session-list">{sessions.map((item, index) => <li key={item.sessionId}>
      <button className={`lv-session-choice${selected?.sessionId === item.sessionId ? ' is-selected' : ''}`} aria-pressed={selected?.sessionId === item.sessionId} disabled={pending || loading || Boolean(error)} onClick={() => act(options => getLiveSession(caseId, item.sessionId, options))}>
        <span className="lv-session-choice-label"><strong>{en ? 'Session' : 'Phiên'} {String(sessions.length - index).padStart(2, '0')}</strong><time dateTime={item.openedAt}>{sessionTime(item.openedAt, en)}</time></span>
        <span className={`lv-session-status lv-session-status--${item.status.toLowerCase()}`}>{statuses[item.status]}</span>
        <span className="lv-session-choice-action">{selected?.sessionId === item.sessionId ? (en ? 'Selected' : 'Đang xem') : (en ? 'View details →' : 'Xem chi tiết →')}</span>
      </button>
    </li>)}</ul>
    {selected && <div className="lv-session-detail lv-staff-glow">
      <h3>{en ? 'Selected session' : 'Phiên đang xem'}</h3>
      <div className="lv-session-detail-grid">
        <p><span>{en ? 'Status' : 'Trạng thái'}</span><strong>{statuses[selected.status]}</strong></p>
        <p><span>{en ? 'Opened' : 'Thời gian mở'}</span><strong>{sessionTime(selected.openedAt, en)}</strong></p>
        {selected.closedAt && <p><span>{en ? 'Closed' : 'Thời gian kết thúc'}</span><strong>{sessionTime(selected.closedAt, en)}</strong></p>}
      </div>
      {selected.status === 'CANCELLED' && (
        <div className="lv-session-cancelled-guidance" role="status" style={{
          padding: '12px 16px',
          backgroundColor: '#fffbeb',
          border: '1px solid #fef3c7',
          borderLeft: '4px solid #f59e0b',
          borderRadius: '8px',
          color: '#92400e',
          margin: '12px 0',
          fontSize: '13.5px',
          lineHeight: '1.5'
        }}>
          <strong>{en ? 'This session has been cancelled' : 'Phiên bàn giao này đã bị hủy'}</strong>
          <p style={{ margin: '4px 0 0' }}>
            {en
              ? 'No further asset deliveries can be made in this session. You can view its history, choose another active session, or open a new handover session above if conditions are met.'
              : 'Không thể tiếp tục bàn giao tài sản trong phiên đã hủy. Bạn có thể xem lịch sử phiên, chọn một phiên đang mở khác hoặc mở phiên bàn giao mới ở trên nếu đủ điều kiện.'}
          </p>
        </div>
      )}
      <details className="lv-session-guidance"><summary>{en ? 'Session reference' : 'Mã tham chiếu phiên'}</summary><code>{selected.sessionId}</code></details>
      <a href={handoverUrl(mode === 'accounts' ? '/staff/handover' : '/staff/beneficiary-accounts', caseId, selected.sessionId)}>{mode === 'accounts' ? (en ? 'Back to session' : 'Về phiên bàn giao') : (en ? 'Beneficiary accounts at counter' : 'Tài khoản người thụ hưởng tại quầy')}</a>
      {selected.status === 'OPEN' && <div className="lv-handover-next-step">
        <a className="lv-handover-primary-action" href={handoverUrl('/staff/asset-handover', caseId, selected.sessionId)}>{en ? 'Select assets to hand over →' : 'Chọn tài sản bàn giao →'}</a>
      </div>}
      <div><button disabled={pending || loading || Boolean(error) || selected.status !== 'OPEN' || mode === 'accounts'} onClick={() => setConfirmCancel(true)}>{en ? 'Cancel session…' : 'Hủy phiên…'}</button></div>
      {confirmCancel && <div role="group" aria-label={en ? 'Confirm cancellation' : 'Xác nhận hủy phiên'}>
        <p>{en ? 'Cancel this open session?' : 'Hủy phiên đang mở này?'}</p>
        <button disabled={pending} onClick={() => act(options => cancelLiveSession(caseId, selected.sessionId, options))}>{en ? 'Confirm cancellation' : 'Xác nhận hủy'}</button>
        <button onClick={() => setConfirmCancel(false)}>{en ? 'Keep session' : 'Giữ phiên'}</button>
      </div>}
    </div>}
    {counterLinkActions !== undefined ? <StaffCaseLinkPanel
      caseId={caseId}
      caseItem={caseItem}
      accessToken={accessToken}
      lang={lang}
      actions={counterLinkActions}
      onError={onError}
    /> : <LegacyCounterBeneficiariesSection caseId={caseId} caseItem={caseItem} selectedSessionId={selected?.sessionId} accessToken={accessToken} lang={lang} mode={mode} onError={onError} />}
  </section>;
}


export default function LiveHandoverPage(props) {
  // Replacing the authenticated token discards every state/request from the old session.
  return <LiveHandoverContent key={props.accessToken} {...props} />;
}
function LiveHandoverContent({ accessToken, lang = 'vi', onLogout, onSelectSession, mode = 'sessions', counterLinkActions }) {
  const en = lang === 'en';
  const query = new URLSearchParams(typeof window === 'undefined' ? '' : window.location.search);
  const [caseId, setCaseId] = useState(() => isHandoverId(query.get('caseId')) ? query.get('caseId') : null);
  const [caseItem, setCaseItem] = useState(null);
  const [requested, setRequested] = useState(() => isHandoverId(query.get('caseId')) && isHandoverId(query.get('sessionId')) ? query.get('sessionId') : null);
  const [revision, setRevision] = useState(0);
  const notify = useStaffSessionExpiry({ accessToken, onUnauthorized: onLogout });

  useEffect(() => {
    if (!caseId || caseItem) return;
    const c = new AbortController();
    fetchStaffCases({ accessToken, lang, size: 50, signal: c.signal })
      .then(res => {
        const found = res?.content?.find(it => it.caseId === caseId);
        if (found && !c.signal.aborted) setCaseItem(found);
      })
      .catch(() => {});
    return () => c.abort();
  }, [caseId, accessToken, lang, caseItem]);

  const keepContext = sessionId => {
    const url = new URL(window.location.href);
    if (caseId) url.searchParams.set('caseId', caseId); else url.searchParams.delete('caseId');
    if (caseId && sessionId) url.searchParams.set('sessionId', sessionId); else url.searchParams.delete('sessionId');
    window.history.replaceState(window.history.state, '', url.pathname + url.search);
    onSelectSession?.(caseId ? sessionId : null);
  };
  return <section className="lv-live-handover lv-staff-surfaces" onPointerMove={trackOwnerSurface}>
    <header className="lv-live-page-heading"><a href="/staff/cases">← {en ? 'Staff cases' : 'Danh sách hồ sơ'}</a></header>
    <h1>{mode === 'accounts' ? (en ? 'Beneficiary accounts at counter' : 'Tài khoản người thụ hưởng tại quầy') : (en ? 'Counter handover sessions' : 'Phiên bàn giao tại quầy')}</h1>
    {!caseId ? <CasePicker accessToken={accessToken} lang={lang} onError={notify} onChoose={(id, item) => {
      setCaseId(id); setCaseItem(item || null); setRequested(null);
      window.history.replaceState(window.history.state, '', handoverUrl(window.location.pathname, id));
    }} /> : <>
      <div className="lv-live-case-summary">
        <div className="lv-live-case-description">
          <span style={{ fontWeight: 600, color: '#334155' }}>{en ? 'Case' : 'Hồ sơ'}: </span>
          <span>{caseItem?.caseNumber || caseId}</span>
          {caseItem?.vaultName && <span className="lv-live-case-vault">{caseItem.vaultName}</span>}
          {caseItem?.ownerName && <span className="lv-live-case-owner">{en ? 'Owner' : 'Chủ kho'}: {caseItem.ownerName}</span>}
          {caseItem?.status && (
            <span style={{
              marginLeft: '0.5rem',
              padding: '2px 8px',
              borderRadius: '9999px',
              fontSize: '12px',
              fontWeight: 600,
              background: caseItem.status === 'CLOSED' ? '#fee2e2' : caseItem.status === 'OPEN' ? '#dcfce7' : '#f1f5f9',
              color: caseItem.status === 'CLOSED' ? '#991b1b' : caseItem.status === 'OPEN' ? '#166534' : '#475569',
            }}>
              {caseItem.status === 'CLOSED' ? (en ? 'Closed' : 'Đã đóng') : caseItem.status === 'OPEN' ? (en ? 'Open' : 'Đang mở') : (en ? 'Cancelled' : 'Đã hủy')}
            </span>
          )}
        </div>
        <button type="button" onClick={() => { keepContext(null); setCaseId(null); setCaseItem(null); setRequested(null); window.history.replaceState(window.history.state, '', window.location.pathname); }}>
          {en ? 'Choose another case' : 'Chọn hồ sơ khác'}
        </button>
      </div>
      <div>{mode === 'accounts' && counterLinkActions !== undefined ? <StaffCaseLinkPanel caseId={caseId} caseItem={caseItem} accessToken={accessToken} lang={lang} actions={counterLinkActions} onError={notify} /> : <Sessions counterLinkActions={counterLinkActions} key={`${caseId}:${revision}`} caseId={caseId} caseItem={caseItem} requestedSessionId={requested} accessToken={accessToken} lang={lang} mode={mode} onError={notify} onSession={keepContext}
        reload={() => { setRequested(new URLSearchParams(window.location.search).get('sessionId')); setRevision(v => v + 1); }} />}</div>
    </>}
  </section>;
}
