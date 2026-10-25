import { useState, useRef, useEffect } from 'react';
import { Button } from '../../components/common/Button.jsx';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import { isPersonalRecipient, readLinkRequest, readLinkRequests, requestStatusLabel, caseLinkError } from '../../utils/caseLinkModel.js';
import ReceivedAssets from './ReceivedAssets.jsx';
import './SharedWithMePage.css';

export default function CaseLinkWorkspace(props) {
  return <SharedContent key={`${props.session?.user?.id || props.user?.id || ''}:${props.session?.accessToken || ''}:${(props.session?.user?.roles || props.user?.roles || []).join(',')}`} {...props} />;
}
function SharedContent({ user, session, lang = 'vi', isDevPreview = false, previewScenario = 'unlinked',
  onUnauthorized, refreshKey = 0, caseLinkActions, receivedAssetActions, onRefreshAccount }) {
  const en = lang === 'en';
  const roles = session?.user?.roles || user?.roles || [];
  const preview = Boolean(import.meta.env.DEV && isDevPreview && !session?.accessToken);
  const eligible = preview || isPersonalRecipient(roles);
  const canRead = preview || roles.some(role => ['BENEFICIARY', 'ROLE_BENEFICIARY'].includes(role));
  const [code, setCode] = useState('');
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [uncertain, setUncertain] = useState(false);
  const [revision, setRevision] = useState(0);
  const [readRevision, setReadRevision] = useState(0);
  const mutation = useRef(null);
  const read = useRef(null);
  const onUnauthorizedRef = useRef(onUnauthorized);
  useEffect(() => { onUnauthorizedRef.current = onUnauthorized; }, [onUnauthorized]);
  const ready = eligible && typeof caseLinkActions?.submit === 'function' && typeof caseLinkActions?.listOwn === 'function';
  useEffect(() => () => { mutation.current?.abort(); read.current?.abort(); }, []);
  useEffect(() => {
    if (!ready || mutation.current) return undefined;
    const c = new AbortController(); read.current = c;
    // Async reads and their completion are scoped to the current account.
    Promise.resolve().then(() => { if (!c.signal.aborted) setLoading(true); });
    Promise.resolve().then(() => caseLinkActions.listOwn({ accessToken: session?.accessToken, signal: c.signal, lang })).then(raw => {
      if (c.signal.aborted) return;
      setRequests(readLinkRequests(raw)); setError(null); setUncertain(false);
    }).catch(err => {
      if (!c.signal.aborted) { setError(err); if (err.status === 401) onUnauthorizedRef.current?.(); }
    }).finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [ready, caseLinkActions, session?.accessToken, lang, refreshKey, revision]);

  async function mutate(kind, item) {
    if (mutation.current || !ready || loading || uncertain) return;
    const c = new AbortController(); mutation.current = c; read.current?.abort();
    setPending(true); setError(null); setNotice(null);
    try {
      const raw = kind === 'submit'
        ? await caseLinkActions.submit({ caseNumber: code.trim().toUpperCase() }, { accessToken: session?.accessToken, lang, signal: c.signal })
        : await caseLinkActions.cancel({ requestId: item.id }, { accessToken: session?.accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      const result = readLinkRequest(raw);
      if (result.status !== (kind === 'submit' ? 'PENDING' : 'CANCELLED') || (item && (result.id !== item.id || result.caseNumber !== item.caseNumber)) || (kind === 'submit' && result.caseNumber !== code.trim().toUpperCase())) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      setRequests(prev => [result, ...prev.filter(row => row.id !== result.id)]);
      setNotice(kind); if (kind === 'submit') setCode('');
    } catch (err) {
      if (c.signal.aborted) return;
      setError(err); setUncertain(true);
      if (err.status === 401) onUnauthorizedRef.current?.();
    } finally {
      if (mutation.current === c) { mutation.current = null; if (!c.signal.aborted) setPending(false); }
    }
  }
  async function refreshAccount() {
    if (!onRefreshAccount || mutation.current) return;
    const c = new AbortController(); mutation.current = c; setPending(true); setError(null);
    try { await onRefreshAccount({ signal: c.signal }); if (!c.signal.aborted) setReadRevision(v => v + 1); }
    catch (err) { if (!c.signal.aborted) { setError(err); if (err.status === 401) onUnauthorizedRef.current?.(); } }
    finally { if (mutation.current === c) { mutation.current = null; if (!c.signal.aborted) setPending(false); } }
  }
  return <div className="lv-shared-view" aria-labelledby="shared-heading">
    <div className="lv-shared-header"><h1 id="shared-heading" className="lv-shared-title">{en ? 'Shared with me' : 'Được chia sẻ với tôi'}</h1></div>
    {preview && <FeedbackNotice tone="warning">{en ? 'UI preview — sample data, no server changes.' : 'Xem trước giao diện — dữ liệu minh họa, chưa lưu lên máy chủ.'}</FeedbackNotice>}
    <section className="lv-shared-card lv-owner-card" aria-labelledby="link-section-title">
      <h2 id="link-section-title">{en ? 'Request a record link' : 'Yêu cầu liên kết hồ sơ'}</h2>
      <form onSubmit={e => { e.preventDefault(); if (code.trim()) mutate('submit'); }} noValidate>
        <label htmlFor="case-link-number">{en ? 'Case number' : 'Mã hồ sơ'}</label>
        <div className="lv-shared-input-row"><input id="case-link-number" className="lv-shared-input" value={code} onChange={e => setCode(e.target.value)}
          placeholder="HS-2026-000123" autoComplete="off" autoCapitalize="characters" spellCheck="false" disabled={!ready || pending} aria-describedby={!ready ? 'case-link-availability' : undefined} />
          <Button className="lv-shared-btn lv-shared-btn-primary" type="submit" disabled={!ready || pending || loading || uncertain || !code.trim()} isLoading={pending}>{en ? 'Send request' : 'Gửi yêu cầu'}</Button></div>
      </form>
      {!eligible ? <FeedbackNotice tone="warning">{en ? 'Use a personal recipient account to request a link.' : 'Hãy dùng tài khoản cá nhân của người nhận để gửi yêu cầu.'}</FeedbackNotice>
        : !ready && <FeedbackNotice id="case-link-availability">{en ? 'Requests are not available yet.' : 'Chưa hỗ trợ gửi yêu cầu.'}</FeedbackNotice>}
      {notice && <FeedbackNotice tone="success">{notice === 'submit'
        ? (en ? 'Request sent. Wait for Staff to verify and confirm the link at the counter.' : 'Đã gửi yêu cầu. Vui lòng chờ Staff đối chiếu và xác nhận liên kết tại quầy.')
        : (en ? 'Request cancelled.' : 'Đã hủy yêu cầu.')}</FeedbackNotice>}
      {error && <FeedbackNotice tone="error">{caseLinkError(error, lang)}</FeedbackNotice>}
    </section>
    {ready && <section className="lv-shared-card lv-owner-card" aria-labelledby="my-requests-title" aria-busy={loading}>
      <div className="lv-link-heading"><h2 id="my-requests-title">{en ? 'My requests' : 'Yêu cầu của tôi'}</h2>
        <Button variant="secondary" disabled={pending || loading} onClick={() => setRevision(v => v + 1)}>{en ? 'Refresh status' : 'Tải lại trạng thái'}</Button></div>
      {loading ? <p role="status">{en ? 'Loading requests…' : 'Đang tải yêu cầu…'}</p> : !error && !requests.length && <p>{en ? 'No requests yet.' : 'Chưa có yêu cầu nào.'}</p>}
      <ul className="lv-link-requests">{requests.map(item => <li key={item.id}><div><strong>{item.caseNumber}</strong><p>{requestStatusLabel(item.status, lang)}</p></div>
        {item.status === 'PENDING' && typeof caseLinkActions.cancel === 'function' && <Button variant="secondary" disabled={pending || loading || uncertain} onClick={() => mutate('cancel', item)}>{en ? 'Cancel request' : 'Hủy yêu cầu'}</Button>}
        {item.status === 'APPROVED' && !canRead && <Button disabled={pending || !onRefreshAccount} onClick={refreshAccount}>{en ? 'Update account access' : 'Cập nhật quyền tài khoản'}</Button>}
      </li>)}</ul>
    </section>}
    {canRead ? <ReceivedAssets actions={receivedAssetActions} userId={session?.user?.id || user?.id} accessToken={session?.accessToken} lang={lang}
      isDevPreview={preview} scenario={previewScenario} onUnauthorized={onUnauthorized} refreshKey={`${refreshKey}:${readRevision}`} />
      : <section className="lv-shared-card lv-owner-card" role="note"><h2>{en ? 'Received assets' : 'Tài sản đã nhận'}</h2><p>{en
        ? 'Assets appear here after Staff confirms your account link and hands them over. You can only view the items delivered to you.'
        : 'Tài sản xuất hiện tại đây sau khi Staff xác nhận liên kết tài khoản và bàn giao. Bạn chỉ xem được phần đã giao cho mình.'}</p></section>}
  </div>;
}
