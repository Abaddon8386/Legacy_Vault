import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/common/Button.jsx';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import { readLinkRequest, readLinkRequests, caseLinkError } from '../../utils/caseLinkModel.js';
import { fetchStaffCaseBeneficiaries, recordCounterAttestation } from './liveHandoverService.js';
import './StaffCaseLinkPanel.css';

export default function StaffCaseLinkPanel(props) {
  return <CounterContent key={`${props.caseId}:${props.accessToken || ''}:${props.caseItem?.status || ''}`} {...props} />;
}
function CounterContent({ caseId, caseItem, accessToken, lang = 'vi', actions, onError }) {
  const en = lang === 'en';
  const [snapshot, setSnapshot] = useState(null);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState('');
  const [uncertain, setUncertain] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [recipientId, setRecipientId] = useState('');
  const [evidence, setEvidence] = useState('');
  const [checked, setChecked] = useState(false);
  const [reason, setReason] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const mutation = useRef(null);
  const read = useRef(null);
  const errorCallback = useRef(onError);
  useEffect(() => { errorCallback.current = onError; }, [onError]);
  useEffect(() => () => { mutation.current?.abort(); read.current?.abort(); }, []);
  const messages = {
    attest: en ? 'In-person check recorded. The account is not linked yet.' : 'Đã ghi nhận đối chiếu tại quầy. Tài khoản chưa được liên kết.',
    create: en ? 'Account created. Ask the recipient to sign in on their own device and enter the case number in Shared with me.' : 'Đã tạo tài khoản. Hướng dẫn người nhận đăng nhập trên thiết bị của họ, vào Được chia sẻ với tôi và nhập mã hồ sơ.',
    approve: en ? 'Link confirmed. Asset access starts only after handover.' : 'Đã xác nhận liên kết. Người nhận chỉ xem được tài sản sau bàn giao.',
    reject: en ? 'Request declined.' : 'Đã từ chối yêu cầu.',
  };
  const ready = typeof actions?.listPending === 'function';
  const open = caseItem?.status === 'OPEN';
  useEffect(() => {
    if (!caseId || !open || mutation.current) return undefined;
    const c = new AbortController(); read.current = c;
    const options = { accessToken, lang, signal: c.signal };
    Promise.resolve().then(async () => {
      if (c.signal.aborted) return;
      setLoading(true);
      const [recipients, raw] = await Promise.all([
        actions?.listRecipients ? actions.listRecipients({ caseId }, options) : fetchStaffCaseBeneficiaries(caseId, options),
        ready ? actions.listPending({ caseId }, options) : [],
      ]);
      if (c.signal.aborted) return;
      if (!Array.isArray(recipients) || recipients.some(r => !r?.beneficiaryId || !r.fullName || typeof r.accountLinked !== 'boolean') ||
        new Set(recipients.map(r => r.beneficiaryId)).size !== recipients.length) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      const requests = readLinkRequests(raw, { staff: true });
      if (requests.some(r => r.status !== 'PENDING' || (caseItem?.caseNumber && r.caseNumber !== caseItem.caseNumber))) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
      setSnapshot({ recipients, requests }); setUncertain(false); setError(null);
    }).catch(err => { if (!c.signal.aborted) { setError(err); setUncertain(true); errorCallback.current?.(err); } })
      .finally(() => { if (!c.signal.aborted) setLoading(false); });
    return () => c.abort();
  }, [caseId, caseItem?.caseNumber, open, accessToken, lang, actions, ready, revision]);
  const selected = snapshot?.requests.find(r => r.id === requestId);
  const recipient = snapshot?.recipients.find(r => r.beneficiaryId === recipientId);
  const locked = !open || loading || pending || uncertain || !snapshot;
  const canApprove = !locked && ready && typeof actions?.approve === 'function' && selected && recipient && !recipient.accountLinked && checked && evidence.trim();
  async function perform(kind, payload) {
    if (mutation.current || locked) return;
    const c = new AbortController(); mutation.current = c; read.current?.abort();
    setPending(true); setNotice(''); setError(null);
    const options = { accessToken, lang, signal: c.signal };
    try {
      if (kind === 'attest') {
        await recordCounterAttestation(caseId, recipientId, { evidenceReference: evidence.trim() }, options);
        if (c.signal.aborted) return;
        setNotice('attest');
      } else if (kind === 'create') {
        const result = await actions.createAccount(payload, options);
        if (c.signal.aborted) return;
        // A create-only adapter must explicitly confirm it did not link a recipient.
        if (!result?.accountId || result.linked !== false) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
        setCreateOpen(false); setName(''); setEmail('');
        setNotice('create');
      } else {
        const result = readLinkRequest(await actions[kind]({ caseId, requestId: selected.id, ...payload }, options), { staff: true });
        if (c.signal.aborted) return;
        if (result.id !== selected.id || result.accountId !== selected.accountId || result.caseNumber !== selected.caseNumber || result.status !== (kind === 'approve' ? 'APPROVED' : 'REJECTED')) throw Object.assign(new Error(), { code: 'INVALID_RESPONSE' });
        setNotice(kind);
      }
      setRequestId(''); setRecipientId(''); setEvidence(''); setChecked(false); setReason(''); setRevision(v => v + 1);
    } catch (err) {
      if (!c.signal.aborted) { setError(err); setUncertain(true); errorCallback.current?.(err); }
    } finally {
      if (mutation.current === c) { mutation.current = null; if (!c.signal.aborted) setPending(false); }
    }
  }
  function clearMatch() { setRecipientId(''); setEvidence(''); setChecked(false); setReason(''); }
  return <section className="lv-counter-link lv-staff-glow" aria-labelledby="counter-link-title" aria-busy={loading && open}>
    <div className="lv-counter-link__heading"><h2 id="counter-link-title">{en ? 'Match account at the counter' : 'Đối chiếu và liên kết tại quầy'}</h2>
      <Button variant="secondary" disabled={!open || pending || loading} onClick={() => { clearMatch(); setRequestId(''); setRevision(v => v + 1); }}>{en ? 'Reload' : 'Tải lại trạng thái'}</Button></div>
    {!open && <FeedbackNotice>{en ? 'Select an open case to continue.' : 'Chọn hồ sơ đang mở để tiếp tục.'}</FeedbackNotice>}
    {!ready && <FeedbackNotice>{en ? 'Account linking is not available yet.' : 'Chưa hỗ trợ xác nhận liên kết tài khoản.'}</FeedbackNotice>}
    {error && <FeedbackNotice tone="error">{caseLinkError(error, lang)}</FeedbackNotice>}
    {notice && <FeedbackNotice tone="success">{messages[notice]}</FeedbackNotice>}
    {open && <>
      <details open={createOpen} onToggle={e => setCreateOpen(e.currentTarget.open)}><summary>{en ? 'Recipient does not have an account' : 'Người nhận chưa có tài khoản'}</summary>
        <form onSubmit={e => { e.preventDefault(); if (typeof actions?.createAccount !== 'function' || !name.trim() || !email.trim() || !password) return; const payload = { fullName: name.trim(), email: email.trim(), password }; setPassword(''); perform('create', payload); }}>
          <fieldset disabled={locked || typeof actions?.createAccount !== 'function'}>
            <label>{en ? 'Full name' : 'Họ tên'}<input required value={name} onChange={e => setName(e.target.value)} autoComplete="off" /></label>
            <label>Email<input type="email" required value={email} onChange={e => setEmail(e.target.value)} autoComplete="off" /></label>
            <label>{en ? 'Password chosen by recipient' : 'Mật khẩu do người nhận tự nhập'}<input type="password" required value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" /></label>
            <Button type="submit" disabled={!name.trim() || !email.trim() || !password || pending}>{en ? 'Create account only' : 'Tạo tài khoản'}</Button>
          </fieldset>
        </form>
        {typeof actions?.createAccount !== 'function' && <p>{en ? 'Counter account creation is not available yet.' : 'Chưa hỗ trợ tạo tài khoản tại quầy.'}</p>}
      </details>
      {loading && <p role="status">{en ? 'Loading recipients and requests…' : 'Đang tải người nhận và yêu cầu…'}</p>}
      {snapshot && <>
        <div className="lv-counter-link__columns">
          <label>{en ? 'Requesting account' : 'Tài khoản gửi yêu cầu'}<select value={requestId} disabled={locked || !ready} onChange={e => { setRequestId(e.target.value); clearMatch(); }}><option value="">{en ? 'Select a pending request' : 'Chọn yêu cầu chờ đối chiếu'}</option>{snapshot.requests.map(r => <option key={r.id} value={r.id}>{r.accountName} — {r.accountEmail}</option>)}</select></label>
          <label>{en ? 'Recipient in this case' : 'Người nhận trong hồ sơ'}<select value={recipientId} disabled={locked} onChange={e => { setRecipientId(e.target.value); setChecked(false); setEvidence(''); }}><option value="">{en ? 'Select a recipient' : 'Chọn người nhận để đối chiếu'}</option>{snapshot.recipients.map(r => <option key={r.beneficiaryId} value={r.beneficiaryId} disabled={r.accountLinked}>{r.fullName}{r.accountLinked ? (en ? ' — Linked' : ' — Đã liên kết') : ''}</option>)}</select></label>
        </div>
        {ready && !snapshot.requests.length && <p>{en ? 'No pending requests.' : 'Chưa có yêu cầu chờ.'}</p>}
        {selected && <div className="lv-counter-link__identity"><strong>{selected.accountName}</strong><span>{selected.accountEmail}</span><span>{en ? 'Account reference' : 'Mã tài khoản'}: {selected.accountId}</span><span>{en ? 'Case' : 'Hồ sơ'}: {selected.caseNumber}</span></div>}
        {recipient && <p>{en ? 'Recipient' : 'Người nhận'}: <strong>{recipient.fullName}</strong>{recipient.sourceLabel && <> · {recipient.sourceLabel}</>}{recipient.legalReference && <> · {recipient.legalReference}</>}</p>}
        <label>{en ? 'Counter record reference' : 'Mã biên bản đối chiếu tại quầy'}<input value={evidence} maxLength={200} disabled={locked || !recipient} onChange={e => setEvidence(e.target.value)} /></label>
        <label className="lv-counter-link__check"><input type="checkbox" checked={checked} disabled={locked || !selected || !recipient} onChange={e => setChecked(e.target.checked)} />{en ? 'I verified the recipient and account.' : 'Đã đối chiếu đúng người nhận và tài khoản.'}</label>
        <div className="lv-counter-link__actions"><Button disabled={!canApprove} isLoading={pending} onClick={() => perform('approve', { recipientId, evidenceReference: evidence.trim() })}>{en ? 'Confirm account link' : 'Xác nhận liên kết'}</Button>
          {!ready && <Button variant="secondary" disabled={locked || !recipient || recipient.accountLinked || !evidence.trim()} onClick={() => perform('attest')}>{en ? 'Record in-person check only' : 'Chỉ lưu đối chiếu giấy tờ'}</Button>}</div>
        {selected && typeof actions?.reject === 'function' && <details><summary>{en ? 'Decline this request' : 'Từ chối yêu cầu này'}</summary><label>{en ? 'Reason' : 'Lý do'}<textarea value={reason} disabled={locked} onChange={e => setReason(e.target.value)} /></label><Button variant="secondary" disabled={locked || !reason.trim()} onClick={() => perform('reject', { reason: reason.trim() })}>{en ? 'Confirm decline' : 'Xác nhận từ chối'}</Button></details>}
      </>}
    </>}
  </section>;
}
