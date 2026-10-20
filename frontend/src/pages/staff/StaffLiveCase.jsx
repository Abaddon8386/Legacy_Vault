import { useEffect, useRef, useState } from 'react';
import { loadStaffCase, claimStaffCase, staffDocuments } from './staffLiveService.js';
import './StaffLiveCase.css';

const labels = {
  documentType: ['Loại giấy tờ', 'Document type'], issuingAuthority: ['Cơ quan cấp', 'Issuing authority'],
  documentNumber: ['Số giấy tờ', 'Document number'], issuedDate: ['Ngày cấp', 'Issued date'],
  evidenceReference: ['Tham chiếu bằng chứng', 'Evidence reference'], notes: ['Ghi chú', 'Notes'],
  deliveredByName: ['Họ tên người nộp', 'Delivered by'], deliveredByRelationship: ['Mối quan hệ', 'Relationship'],
  conditionNotes: ['Tình trạng bản gốc', 'Original condition'],
};
const fields = {
  'death-documents': ['documentType', 'issuingAuthority', 'documentNumber', 'issuedDate', 'evidenceReference', 'notes'],
  'original-will-intakes': ['deliveredByName', 'deliveredByRelationship', 'evidenceReference', 'conditionNotes'],
};
export default function StaffLiveCase({ caseId, accessToken, lang, onBack, onUnauthorized }) {
  const en = lang === 'en';
  const [data, setData] = useState(null);
  const [kind, setKind] = useState('death-documents');
  const [drafts, setDrafts] = useState({});
  const [records, setRecords] = useState([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [writeReady, setWriteReady] = useState(false);
  const controller = useRef(null);
  const lock = useRef(false);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);
  useEffect(() => {
    const c = new AbortController(); controller.current = c; lock.current = true;
    loadStaffCase(caseId, { accessToken, signal: c.signal }).then(value => {
      if (!c.signal.aborted) setData(value);
    }).catch(err => {
      if (c.signal.aborted) return;
      if (err.status === 401) auth.current?.();
      if ([401, 403, 404].includes(err.status)) setWriteReady(false);
      setError(err.code || 'NETWORK_ERROR');
    }).finally(() => { if (!c.signal.aborted) { lock.current = false; setBusy(false); } });
    return () => c.abort();
  }, [caseId, accessToken]);
  async function run(action) {
    if (lock.current) return;
    lock.current = true; const c = new AbortController(); controller.current = c;
    setBusy(true); setError(''); setNotice('');
    try { await action({ accessToken, lang, signal: c.signal }, c.signal); }
    catch (err) {
      if (c.signal.aborted) return;
      if (err.status === 401) auth.current?.();
      if ([401, 403, 404].includes(err.status)) setWriteReady(false);
      setError(err.code || 'NETWORK_ERROR');
    } finally { if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }
  // Abort mutations as well as reads when the case/session leaves this screen.
  useEffect(() => () => controller.current?.abort(), []);
  const draft = drafts[kind] || {};
  const closed = data?.status !== 'OPEN';
  return <section className="lv-staff-live" aria-busy={busy}>
    <button type="button" onClick={onBack}>{en ? 'Back to cases' : 'Về danh sách hồ sơ'}</button>
    <h1>{en ? 'Case intake' : 'Tiếp nhận hồ sơ'} — {data?.caseNumber || caseId}</h1>
    <p>{data?.vaultName} · {data?.ownerName} · {data?.status}</p>
    {busy && <div role="status"><progress aria-label={en ? 'Processing' : 'Đang xử lý'} /> {en ? 'Processing…' : 'Đang xử lý…'}</div>}
    {error && <p role="alert">{en ? 'Request failed' : 'Yêu cầu chưa thực hiện được'}: {error}. {en ? 'Retry or check case assignment and workflow status.' : 'Thử lại hoặc kiểm tra việc nhận hồ sơ và trạng thái nghiệp vụ.'}</p>}
    {notice && <p role="status">{notice}</p>}
    {!data && !busy && <button onClick={() => run(async (options, signal) => {
      const value = await loadStaffCase(caseId, options);
      if (!signal.aborted) setData(value);
    })}>{en ? 'Retry loading case' : 'Thử tải lại hồ sơ'}</button>}
    <button disabled={busy || closed} onClick={() => run(async (options, signal) => {
      const value = await claimStaffCase(caseId, options);
      if (!signal.aborted) { setData(value); setNotice(en ? 'Case assigned to you.' : 'Đã nhận hồ sơ.'); }
    })}>{en ? 'Claim unassigned case' : 'Nhận hồ sơ chưa được phân công'}</button>
    <p>{en ? 'For cases already assigned to you, load records to continue. A claim conflict does not change the assignee.' : 'Với hồ sơ đã nhận, tải bản ghi để tiếp tục. Lỗi nhận hồ sơ không thay đổi người phụ trách.'}</p>
    <label>{en ? 'Record category' : 'Nhóm giấy tờ'}<select disabled={busy} value={kind} onChange={e => { setKind(e.target.value); setRecords([]); setWriteReady(false); setNotice(''); setError(''); }}>
      <option value="death-documents">{en ? 'Death document' : 'Giấy tờ tử vong'}</option>
      <option value="original-will-intakes">{en ? 'Original will intake' : 'Tiếp nhận di chúc gốc'}</option>
    </select></label>
    <button disabled={busy || !data} onClick={() => run(async (options, signal) => {
      const list = await staffDocuments(caseId, kind, undefined, options);
      if (!signal.aborted) { setRecords(list); setWriteReady(true); setNotice(en ? 'Records loaded.' : 'Đã tải bản ghi.'); }
    })}>{en ? 'Load records for this case' : 'Tải bản ghi của hồ sơ'}</button>
    <ul>{records.map(item => <li key={item.id}>{item.documentNumber || item.deliveredByName} — {item.receivedAt}</li>)}</ul>
    <form onSubmit={e => { e.preventDefault(); run(async (options, signal) => {
      const saved = await staffDocuments(caseId, kind, draft, options);
      if (!signal.aborted) {
        setRecords(items => [...items, saved]); setDrafts(values => ({ ...values, [kind]: {} }));
        setNotice(`${en ? 'Saved by server' : 'Máy chủ đã ghi nhận'}: ${saved.id} — ${saved.receivedAt}`);
      }
    }); }}>
      <fieldset disabled={busy || closed || !writeReady}>
        <legend>{en ? 'Physical document metadata' : 'Thông tin giấy tờ bản cứng'}</legend>
        {fields[kind].map(key => <label key={key}>{labels[key][en ? 1 : 0]}
          {key === 'documentType' ? <select required value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))}>
            <option value="">{en ? 'Select' : 'Chọn'}</option>
            <option value="DEATH_CERTIFICATE">{en ? 'Death certificate' : 'Giấy chứng tử'}</option>
            <option value="DEATH_REGISTRATION_EXTRACT">{en ? 'Death registration extract' : 'Trích lục khai tử'}</option>
          </select> : <input type={key === 'issuedDate' ? 'date' : 'text'} required={['issuingAuthority', 'documentNumber', 'issuedDate', 'deliveredByName'].includes(key)}
            maxLength={({ issuingAuthority: 255, documentNumber: 100, deliveredByName: 150, deliveredByRelationship: 100, evidenceReference: 500 })[key] || 1000}
            value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))} />}
        </label>)}
        <button type="submit">{en ? 'Record intake' : 'Ghi nhận tiếp nhận'}</button>
      </fieldset>
    </form>
    <p>{en ? 'Load records to verify your case access before entry. The server checks every write. Recording intake does not approve death or unlock the vault.' : 'Tải bản ghi để kiểm tra quyền trên hồ sơ trước khi nhập. Máy chủ kiểm tra từng thao tác ghi. Tiếp nhận không xác nhận tử vong hoặc mở khóa kho.'}</p>
    <p>{en ? 'Contact and identity selection await case data from PS-93.' : 'Chọn người liên hệ và xác minh danh tính đang chờ dữ liệu theo hồ sơ từ PS-93.'}</p>
  </section>;
}
