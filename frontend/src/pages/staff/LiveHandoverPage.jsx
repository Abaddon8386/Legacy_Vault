import { useEffect, useRef, useState } from 'react';
import { fetchStaffCases } from './staffCaseService.js';
import { useStaffSessionExpiry, staffAuthFeedback } from './staffFeedback.js';
import { listLiveSessions, getLiveSession, openLiveSession, cancelLiveSession, isHandoverId, handoverUrl, fetchStaffCaseBeneficiaries, recordCounterAttestation, requestInvitationEmail } from './liveHandoverService.js';
import './LiveHandoverPage.css';
import { linkExistingBeneficiaryAccount } from './beneficiaryAccountService.js';

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

function CounterBeneficiariesSection({ caseId, caseItem, selectedSessionId, accessToken, lang, mode, onError }) {
  const en = lang === 'en';
  const [expanded, setExpanded] = useState(() => mode === 'accounts');
  const [loading, setLoading] = useState(false);
  const [beneficiaries, setBeneficiaries] = useState([]);
  const [error, setError] = useState(null);
  const [attestTarget, setAttestTarget] = useState(null);
  const [linkTarget, setLinkTarget] = useState(null);
  const [accountEmail, setAccountEmail] = useState('');
  const [linking, setLinking] = useState(false);
  const [evidenceRef, setEvidenceRef] = useState('');
  const [confirmedEmail, setConfirmedEmail] = useState('');
  const [submittingAttest, setSubmittingAttest] = useState(false);
  const [requestingEmailId, setRequestingEmailId] = useState(null);
  const [notice, setNotice] = useState('');
  const [beneficiaryRevision, setBeneficiaryRevision] = useState(0);
  const mutation = useRef(null);
  useEffect(() => () => { mutation.current?.abort(); }, []);

  const [previousCaseId, setPreviousCaseId] = useState(caseId);
  if (previousCaseId !== caseId) {
    setPreviousCaseId(caseId);
    setBeneficiaries([]);
    setError(null);
    setNotice('');
    setAttestTarget(null);
    setLinkTarget(null);
    setRequestingEmailId(null);
  }

  useEffect(() => {
    if (!expanded || !caseId || !accessToken || caseItem?.status === 'CLOSED') return;
    const c = new AbortController();
    let cancelled = false;

    fetchStaffCaseBeneficiaries(caseId, { accessToken, lang, signal: c.signal })
      .then((data) => {
        if (!cancelled) {
          setBeneficiaries(data);
          setError(null);
        }
      })
      .catch((err) => {
        if (!cancelled && err.name !== 'AbortError') {
          setError(err);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      c.abort();
    };
  }, [caseId, accessToken, expanded, lang, beneficiaryRevision, caseItem?.status]);

  const handleAttest = async (e) => {
    e.preventDefault();
    if (!attestTarget || !evidenceRef.trim() || mutation.current) return;
    const c = new AbortController();
    mutation.current = c;
    setSubmittingAttest(true);
    setNotice('');
    try {
      await recordCounterAttestation(caseId, attestTarget.beneficiaryId, {
        evidenceReference: evidenceRef.trim(),
        confirmedEmail: confirmedEmail.trim() || undefined,
      }, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setNotice(en ? 'Counter attestation recorded successfully.' : 'Đã ghi nhận đối chiếu giấy tờ tại quầy thành công.');
      setAttestTarget(null);
      setEvidenceRef('');
      setConfirmedEmail('');
      setBeneficiaryRevision(r => r + 1);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err);
      if (onError) onError(err);
    } finally {
      if (!c.signal.aborted) { mutation.current = null; setSubmittingAttest(false); }
    }
  };

  const handleRequestInvitationEmail = async (ben) => {
    if (mutation.current || !Number.isSafeInteger(ben.invitation?.generation)) return;
    const c = new AbortController();
    mutation.current = c;
    setRequestingEmailId(ben.beneficiaryId);
    setNotice('');
    try {
      await requestInvitationEmail(caseId, ben.beneficiaryId, ben.invitation.generation, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setNotice(en ? `Invitation email queued for ${ben.fullName}.` : `Đã xếp hàng gửi email lời mời cho ${ben.fullName}.`);
      setBeneficiaryRevision(r => r + 1);
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err);
      if (onError) onError(err);
    } finally {
      if (!c.signal.aborted) { mutation.current = null; setRequestingEmailId(null); }
    }
  };

  const stepLabels = en ? {
    AWAITING_IDENTITY_VERIFICATION: 'Awaiting in-person identity check',
    AWAITING_ACCOUNT_DECISION: 'Identity checked · Awaiting account decision',
    ACCOUNT_LINKED: 'Account linked',
  } : {
    AWAITING_IDENTITY_VERIFICATION: 'Chờ đối chiếu căn cước tại quầy',
    AWAITING_ACCOUNT_DECISION: 'Đã đối chiếu căn cước · Chờ quyết định tài khoản',
    ACCOUNT_LINKED: 'Đã liên kết tài khoản',
  };

  return (
    <aside role="note" className="lv-counter-beneficiaries lv-staff-glow">
      <h3>{en ? 'Counter recipients' : 'Người nhận tại quầy'}</h3>

      {caseItem?.status === 'CLOSED' && (
        <p role="status" className="lv-live-closed-notice">
          {en
            ? 'This verification case is closed. Counter identity checks and account operations are only available for open cases.'
            : 'Hồ sơ xác minh này đã đóng. Thao tác đối chiếu căn cước và quản lý tài khoản tại quầy chỉ áp dụng cho hồ sơ đang mở.'}
        </p>
      )}

      {!expanded && caseItem?.status !== 'CLOSED' && (
        <p>
          <button type="button" onClick={() => setExpanded(true)}>
            {en ? 'Load counter beneficiaries' : 'Tải danh sách người thụ hưởng tại quầy'}
          </button>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {error && !(caseItem?.status === 'CLOSED' && (error.code === 'RESOURCE_NOT_FOUND' || error.status === 404)) && <p role="alert">{errorText(error, en, caseItem)}</p>}
      {loading && <p role="status">{en ? 'Loading beneficiaries…' : 'Đang tải danh sách người thụ hưởng…'}</p>}
      {caseItem?.status !== 'CLOSED' && expanded && !loading && !error && beneficiaries.length === 0 && (
        <p role="status">{en ? 'No eligible beneficiaries found for this case.' : 'Không có người thụ hưởng nào đủ điều kiện trong hồ sơ này.'}</p>
      )}

      {beneficiaries.length > 0 && (
        <ul className="lv-beneficiary-list">
          {beneficiaries.map((ben) => (
            <li key={ben.beneficiaryId} className="lv-beneficiary-item">
              <strong>{ben.fullName}</strong> ({ben.relationship})
              <div>
                <em>{stepLabels[ben.counterStep] || ben.counterStep}</em>
                {' · '}
                <span>{ben.accountLinked ? (en ? 'Account active' : 'Đã có tài khoản') : (en ? 'No account linked' : 'Chưa liên kết tài khoản')}</span>
              </div>
              {ben.counterAttestation?.recorded && (
                <p>
                  ✓ {en ? 'Attested at counter: ' : 'Đã đối chiếu tại quầy lúc: '}
                  {ben.counterAttestation.recordedAt}
                  {ben.counterAttestation.confirmedEmailRecorded ? (en ? ' (Email confirmed)' : ' (Đã lưu email xác nhận)') : ''}
                </p>
              )}
              {ben.invitation && ben.invitation.state !== 'NOT_ISSUED' && (
                <p>
                  {en ? 'Invitation: ' : 'Thư mời: '}
                  <strong>{ben.invitation.state}</strong> (Gen: {ben.invitation.generation})
                </p>
              )}

              <div className="lv-beneficiary-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem' }}>
                <button
                  type="button"
                  onClick={() => setAttestTarget(ben)}
                >
                  {en ? 'Record counter ID attestation' : 'Ghi nhận đối chiếu CCCD tại quầy'}
                </button>

                {ben.actions?.canRequestInvitationEmail && (
                  <button
                    type="button"
                    disabled={requestingEmailId === ben.beneficiaryId}
                    onClick={() => handleRequestInvitationEmail(ben)}
                  >
                    {requestingEmailId === ben.beneficiaryId
                      ? (en ? 'Queueing email…' : 'Đang yêu cầu gửi…')
                      : (en ? 'Request invitation email' : 'Gửi email lời mời')}
                  </button>
                )}

                {ben.actions?.canLinkAccount && mode === 'accounts' && (
                  <button type="button" disabled={linking} onClick={() => {
                    setLinkTarget(ben); setAccountEmail(''); setError(null);
                  }}>{en ? 'Link existing account' : 'Liên kết tài khoản'}</button>
                )}
                {ben.actions?.canLinkAccount && mode !== 'accounts' && (
                  <a
                    href={handoverUrl('/staff/beneficiary-accounts', caseId, selectedSessionId) + `&beneficiaryId=${ben.beneficiaryId}`}
                  >
                    {en ? 'Link existing account' : 'Liên kết tài khoản'}
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {linkTarget && (
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (mutation.current || !accountEmail.trim()) return;
          const c = new AbortController(); mutation.current = c; setLinking(true); setError(null); setNotice('');
          try {
            await linkExistingBeneficiaryAccount(linkTarget.beneficiaryId, accountEmail.trim(), { accessToken, lang, signal: c.signal });
            if (c.signal.aborted) return;
            setNotice(en ? 'Account linked successfully.' : 'Đã liên kết tài khoản thành công.');
            setLinkTarget(null); setAccountEmail(''); setBeneficiaryRevision(value => value + 1);
          } catch (err) {
            if (!c.signal.aborted) { setError(err); onError?.(err); }
          } finally {
            if (!c.signal.aborted) { mutation.current = null; setLinking(false); }
          }
        }}>
          <h4>{en ? 'Link existing account: ' : 'Liên kết tài khoản có sẵn: '}{linkTarget.fullName}</h4>
          <label>{en ? 'Account email' : 'Email tài khoản'}
            <input type="email" required maxLength={254} value={accountEmail} disabled={linking}
              onChange={event => setAccountEmail(event.target.value)} autoComplete="off" />
          </label>
          <button type="submit" disabled={linking || !accountEmail.trim()}>{linking ? (en ? 'Linking…' : 'Đang liên kết…') : (en ? 'Confirm link' : 'Xác nhận liên kết')}</button>
          <button type="button" disabled={linking} onClick={() => setLinkTarget(null)}>{en ? 'Cancel' : 'Hủy'}</button>
        </form>
      )}
      {attestTarget && (
        <form onSubmit={handleAttest} style={{ marginTop: '0.5rem', padding: '0.5rem', border: '1px solid #ccc' }}>
          <h4>{en ? `Record in-person attestation: ${attestTarget.fullName}` : `Ghi nhận đối chiếu tại quầy: ${attestTarget.fullName}`}</h4>
          <div>
            <label>
              {en ? 'Counter document reference: ' : 'Số tham chiếu chứng từ tại quầy: '}
              <input
                type="text"
                required
                maxLength={200}
                value={evidenceRef}
                onChange={(e) => setEvidenceRef(e.target.value)}
                placeholder={en ? 'Counter record reference' : 'Mã biên bản đối chiếu'}
              />
            </label>
          </div>
          <div style={{ marginTop: '0.25rem' }}>
            <label>
              {en ? 'Confirmed email (for invite): ' : 'Email xác nhận (gửi mã mời): '}
              <input
                type="email"
                maxLength={254}
                value={confirmedEmail}
                onChange={(e) => setConfirmedEmail(e.target.value)}
                placeholder="email@example.com"
              />
            </label>
          </div>
          <div style={{ marginTop: '0.5rem', display: 'flex', gap: '0.5rem' }}>
            <button type="submit" disabled={submittingAttest || !evidenceRef.trim()}>
              {submittingAttest ? (en ? 'Saving…' : 'Đang lưu…') : (en ? 'Save attestation' : 'Lưu ghi nhận đối chiếu')}
            </button>
            <button type="button" onClick={() => setAttestTarget(null)}>
              {en ? 'Cancel' : 'Hủy'}
            </button>
          </div>
        </form>
      )}


    </aside>
  );
}

function Sessions({ caseId, caseItem, requestedSessionId, accessToken, lang, onSession, onError, mode, reload }) {
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
  const statuses = en ? { OPEN: 'Open', COMPLETED: 'Completed', CANCELLED: 'Cancelled' } : { OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy' };
  return <section className="lv-session-panel" aria-busy={loading || pending}>
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
    <button className="lv-live-primary" disabled={loading || pending || Boolean(error) || openExists || selected?.status === 'COMPLETED' || mode === 'accounts' || isCaseClosed} onClick={() => act(options => openLiveSession(caseId, options))}>{en ? 'Open handover session' : 'Mở phiên bàn giao'}</button>
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
    <CounterBeneficiariesSection
      caseId={caseId}
      caseItem={caseItem}
      selectedSessionId={selected?.sessionId}
      accessToken={accessToken}
      lang={lang}
      mode={mode}
      onError={onError}
    />
  </section>;
}


export default function LiveHandoverPage(props) {
  // Replacing the authenticated token discards every state/request from the old session.
  return <LiveHandoverContent key={props.accessToken} {...props} />;
}
function LiveHandoverContent({ accessToken, lang = 'vi', onLogout, onSelectSession, mode = 'sessions' }) {
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
  return <section className="lv-live-handover">
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
      <Sessions key={`${caseId}:${revision}`} caseId={caseId} caseItem={caseItem} requestedSessionId={requested} accessToken={accessToken} lang={lang} mode={mode} onError={notify} onSession={keepContext}
        reload={() => { setRequested(new URLSearchParams(window.location.search).get('sessionId')); setRevision(v => v + 1); }} />
    </>}
  </section>;
}
