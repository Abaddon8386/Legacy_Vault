import { useEffect, useRef, useState, useCallback } from 'react';
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
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [recordsError, setRecordsError] = useState('');
  const [recordsLoaded, setRecordsLoaded] = useState(false);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [writeReady, setWriteReady] = useState(false);
  const controller = useRef(null);
  const docsController = useRef(null);
  const lock = useRef(false);
  const auth = useRef(onUnauthorized);
  useEffect(() => { auth.current = onUnauthorized; }, [onUnauthorized]);

  // Load case metadata
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

  // Tự động tải danh sách giấy tờ đã tiếp nhận theo nhóm giấy tờ
  const loadDocuments = useCallback(async (category = kind) => {
    if (docsController.current) docsController.current.abort();
    const c = new AbortController();
    docsController.current = c;
    setRecordsLoading(true);
    setRecordsError('');
    try {
      const list = await staffDocuments(caseId, category, undefined, { accessToken, lang, signal: c.signal });
      if (!c.signal.aborted) {
        setRecords(Array.isArray(list) ? list : []);
        setRecordsLoaded(true);
        setWriteReady(true);
      }
    } catch (err) {
      if (c.signal.aborted) return;
      if (err.status === 401) auth.current?.();
      if ([401, 403, 404].includes(err.status)) setWriteReady(false);
      setRecordsError(err.code || 'NETWORK_ERROR');
    } finally {
      if (!c.signal.aborted) setRecordsLoading(false);
    }
  }, [caseId, kind, accessToken, lang]);

  // Tự động đọc danh sách giấy tờ khi chọn hồ sơ và nhóm giấy tờ
  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) loadDocuments(kind);
    });
    return () => {
      active = false;
      docsController.current?.abort();
    };
  }, [loadDocuments, kind]);

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
  useEffect(() => () => {
    controller.current?.abort();
    docsController.current?.abort();
  }, []);

  const draft = drafts[kind] || {};
  const closed = data?.status !== 'OPEN';
  return <section className="lv-staff-live" aria-busy={busy || recordsLoading}>
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
    <p>{en ? 'For cases already assigned to you, documents are automatically loaded. A claim conflict does not change the assignee.' : 'Với hồ sơ đã nhận, danh sách giấy tờ được tự động tải. Lỗi nhận hồ sơ không thay đổi người phụ trách.'}</p>
    <label>{en ? 'Record category' : 'Nhóm giấy tờ'}<select disabled={busy || recordsLoading} value={kind} onChange={e => {
      const nextKind = e.target.value;
      setKind(nextKind);
      setNotice('');
      setError('');
    }}>
      <option value="death-documents">{en ? 'Death document' : 'Giấy tờ tử vong'}</option>
      <option value="original-will-intakes">{en ? 'Original will intake' : 'Tiếp nhận di chúc gốc'}</option>
    </select></label>

    <div className="lv-staff-live__records-section">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <h2>{en ? 'Received documents' : 'Xem giấy tờ đã tiếp nhận'}</h2>
        <button
          type="button"
          disabled={busy || recordsLoading || !data}
          onClick={() => loadDocuments(kind)}
        >
          {en ? 'Refresh document list' : 'Làm mới danh sách giấy tờ'}
        </button>
      </div>

      {recordsLoading && (
        <div role="status">
          <progress aria-label={en ? 'Loading documents' : 'Đang tải giấy tờ'} /> {en ? 'Loading document list…' : 'Đang tải danh sách giấy tờ…'}
        </div>
      )}

      {recordsError && (
        <p role="alert">
          {en ? 'Unable to load document list' : 'Chưa tải được danh sách giấy tờ'}: {recordsError}.{' '}
          <button type="button" onClick={() => loadDocuments(kind)}>
            {en ? 'Refresh document list' : 'Làm mới danh sách giấy tờ'}
          </button>
        </p>
      )}

      {!recordsLoading && !recordsError && recordsLoaded && records.length === 0 && (
        <p>{en ? 'No documents received in this category yet.' : 'Chưa có giấy tờ nào được tiếp nhận trong nhóm này.'}</p>
      )}

      {!recordsLoading && records.length > 0 && (
        <ul>
          {records.map(item => (
            <li key={item.id}>
              {item.documentNumber || item.deliveredByName} — {item.receivedAt}
            </li>
          ))}
        </ul>
      )}
    </div>

    <form onSubmit={e => { e.preventDefault(); run(async (options, signal) => {
      const saved = await staffDocuments(caseId, kind, draft, options);
      if (!signal.aborted) {
        setRecords(items => [...items, saved]); setDrafts(values => ({ ...values, [kind]: {} }));
        setNotice(`${en ? 'Saved by server' : 'Máy chủ đã ghi nhận'}: ${saved.id} — ${saved.receivedAt}`);
      }
    }); }}>
      <fieldset disabled={busy || closed || !writeReady}>
        <legend>{en ? 'Record new document intake' : 'Tiếp nhận giấy tờ mới'}</legend>
        {fields[kind].map(key => <label key={key}>{labels[key][en ? 1 : 0]}
          {key === 'documentType' ? <select required value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))}>
            <option value="">{en ? 'Select' : 'Chọn'}</option>
            <option value="DEATH_CERTIFICATE">{en ? 'Death certificate' : 'Giấy chứng tử'}</option>
            <option value="DEATH_REGISTRATION_EXTRACT">{en ? 'Death registration extract' : 'Trích lục khai tử'}</option>
          </select> : <input type={key === 'issuedDate' ? 'date' : 'text'} required={['issuingAuthority', 'documentNumber', 'issuedDate', 'deliveredByName'].includes(key)}
            maxLength={({ issuingAuthority: 255, documentNumber: 100, deliveredByName: 150, deliveredByRelationship: 100, evidenceReference: 500 })[key] || 1000}
            value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))} />}
        </label>)}
        <button type="submit">{en ? 'Record intake' : 'Tiếp nhận giấy tờ'}</button>
      </fieldset>
    </form>
    <p>{en ? 'Document list is loaded to verify your case access before entry. The server checks every write. Recording intake does not approve death or unlock the vault.' : 'Danh sách giấy tờ được tự động tải để kiểm tra quyền trên hồ sơ trước khi nhập. Máy chủ kiểm tra từng thao tác ghi. Tiếp nhận không xác nhận tử vong hoặc mở khóa kho.'}</p>
    <p>{en ? 'Contact and identity selection await case data from PS-93.' : 'Chọn người liên hệ và xác minh danh tính đang chờ dữ liệu theo hồ sơ từ PS-93.'}</p>
  </section>;
}
