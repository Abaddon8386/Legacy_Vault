import { useEffect, useRef, useState, useCallback } from 'react';
import {
  loadStaffCase,
  claimStaffCase,
  staffDocuments,
  staffDocumentAttachments,
  uploadStaffDocumentAttachment,
  readStaffDocumentAttachmentContent,
} from './staffLiveService.js';
import { validateEvidenceFile, formatFileSize } from '../../utils/staffEvidenceUpload.js';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';
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

export default function StaffLiveCase(props) {
  return <ScopedStaffLiveCase key={`${props.caseId}:${props.accessToken}`} {...props} />;
}

function ScopedStaffLiveCase({ caseId, accessToken, lang, onBack, onUnauthorized }) {
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

  // Attachments State (PS-98 & PS-103)
  const [activeRecordId, setActiveRecordId] = useState(null);
  const [recordAttachments, setRecordAttachments] = useState({});
  const [attachmentLoading, setAttachmentLoading] = useState({});
  const [attachmentErrors, setAttachmentErrors] = useState({});
  const [selectedRecordFiles, setSelectedRecordFiles] = useState({});
  const [isUploadingAtt, setIsUploadingAtt] = useState({});
  const [uploadAttErrors, setUploadAttErrors] = useState({});
  const [stagedFile, setStagedFile] = useState(null);
  const [previewModal, setPreviewModal] = useState(null);

  const controller = useRef(null);
  const docsController = useRef(null);
  const lock = useRef(false);
  const auth = useRef(onUnauthorized);
  const attachmentRequests = useRef(new Map());
  const abortAttachments = () => {
    attachmentRequests.current.forEach(c => c.abort());
    attachmentRequests.current.clear();
  };
  const startAttachment = (key) => {
    if (attachmentRequests.current.has(key)) return null;
    const c = new AbortController();
    attachmentRequests.current.set(key, c);
    return c;
  };
  const finishAttachment = (key, c) => {
    if (attachmentRequests.current.get(key) === c) attachmentRequests.current.delete(key);
  };
  const attachmentFailure = (err) => {
    if (err.status === 401) auth.current?.();
    if ([401, 403, 404].includes(err.status)) setWriteReady(false);
  };
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

  // Tải danh sách tệp đính kèm của một bản ghi giấy tờ đã lưu
  const loadRecordAttachments = async (recordId) => {
    if (!recordId) return;
    const key = `list:${recordId}`;
    const c = startAttachment(key);
    if (!c) return;
    setAttachmentLoading(prev => ({ ...prev, [recordId]: true }));
    setAttachmentErrors(prev => ({ ...prev, [recordId]: '' }));
    try {
      const list = await staffDocumentAttachments(caseId, kind, recordId, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setRecordAttachments(prev => ({ ...prev, [recordId]: list }));
    } catch (err) {
      if (c.signal.aborted) return;
      attachmentFailure(err);
      setAttachmentErrors(prev => ({ ...prev, [recordId]: err.message || err.code || 'LOAD_FAILED' }));
    } finally {
      finishAttachment(key, c);
      if (!c.signal.aborted) setAttachmentLoading(prev => ({ ...prev, [recordId]: false }));
    }
  };

  const toggleRecordAttachments = (recordId) => {
    if (activeRecordId === recordId) {
      setActiveRecordId(null);
    } else {
      setActiveRecordId(recordId);
      if (!recordAttachments[recordId]) {
        loadRecordAttachments(recordId);
      }
    }
  };

  const handleSelectRecordFile = (recordId, file) => {
    if (!file) return;
    const validation = validateEvidenceFile(file, lang);
    if (!validation.isValid) {
      setSelectedRecordFiles(prev => ({ ...prev, [recordId]: null }));
      setUploadAttErrors(prev => ({ ...prev, [recordId]: validation.errorMessage }));
      return;
    }
    setUploadAttErrors(prev => ({ ...prev, [recordId]: '' }));
    setSelectedRecordFiles(prev => ({ ...prev, [recordId]: file }));
  };

  const handleClearRecordFile = (recordId) => {
    setSelectedRecordFiles(prev => ({ ...prev, [recordId]: null }));
    setUploadAttErrors(prev => ({ ...prev, [recordId]: '' }));
  };

  const handleUploadAttachment = async (recordId) => {
    const file = selectedRecordFiles[recordId];
    if (!file) return;
    const key = `upload:${recordId}`;
    const c = startAttachment(key);
    if (!c) return;
    setIsUploadingAtt(prev => ({ ...prev, [recordId]: true }));
    setUploadAttErrors(prev => ({ ...prev, [recordId]: '' }));
    try {
      const receipt = await uploadStaffDocumentAttachment(caseId, kind, recordId, file, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      setSelectedRecordFiles(prev => ({ ...prev, [recordId]: null }));
      setNotice(`${en ? 'File attached successfully' : 'Đính kèm tệp chứng cứ thành công'}: ${receipt.fileName} (SHA-256: ${receipt.sha256.slice(0, 8)}…)`);
      loadRecordAttachments(recordId);
    } catch (err) {
      if (c.signal.aborted) return;
      attachmentFailure(err);
      setUploadAttErrors(prev => ({ ...prev, [recordId]: err.message || err.code || (en ? 'Upload failed' : 'Tải lên thất bại') }));
    } finally {
      finishAttachment(key, c);
      if (!c.signal.aborted) setIsUploadingAtt(prev => ({ ...prev, [recordId]: false }));
    }
  };

  const handleViewAttachment = async (recordId, att) => {
    const key = 'preview';
    const c = startAttachment(key);
    if (!c) return;
    try {
      const blob = await readStaffDocumentAttachmentContent(caseId, kind, recordId, att.id, { accessToken, lang, signal: c.signal });
      if (c.signal.aborted) return;
      const blobUrl = URL.createObjectURL(blob);
      setPreviewModal({
        isOpen: true,
        blobUrl,
        fileName: att.fileName,
        contentType: att.contentType || 'application/pdf',
      });
    } catch (err) {
      if (c.signal.aborted) return;
      attachmentFailure(err);
      setError(`${en ? 'Unable to view file' : 'Không thể xem tệp'}: ${err.message || err.code}`);
    } finally {
      finishAttachment(key, c);
    }
  };

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
    abortAttachments();
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
      abortAttachments();
      setStagedFile(null);
      setSelectedRecordFiles({});
      setAttachmentLoading({});
      setIsUploadingAtt({});
      setPreviewModal(null);
      setKind(nextKind);
      setNotice('');
      setError('');
      setActiveRecordId(null);
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
        <ul className="lv-staff-records-list">
          {records.map(item => (
            <li key={item.id} className="lv-staff-record-item">
              <div className="lv-staff-record-summary">
                <span>{item.documentNumber || item.deliveredByName} — {item.receivedAt}</span>
                <button
                  type="button"
                  className="lv-staff-btn-toggle-att"
                  onClick={() => toggleRecordAttachments(item.id)}
                >
                  {activeRecordId === item.id ? (en ? 'Hide attachments' : 'Ẩn tệp đính kèm') : (en ? 'Attachments' : 'Tệp đính kèm')}
                </button>
              </div>

              {activeRecordId === item.id && (
                <div className="lv-staff-attachments-pane" role="region" aria-label={en ? 'Attachments' : 'Tệp đính kèm'}>
                  <h4>{en ? 'Attached files' : 'Tệp đính kèm'}</h4>
                  {attachmentLoading[item.id] ? (
                    <p>{en ? 'Loading attachments…' : 'Đang tải danh sách tệp đính kèm…'}</p>
                  ) : attachmentErrors[item.id] ? (
                    <p role="alert">{en ? 'Failed to load attachments' : 'Lỗi tải tệp đính kèm'}: {attachmentErrors[item.id]}</p>
                  ) : (recordAttachments[item.id] || []).length === 0 ? (
                    <p className="lv-staff-no-att">{en ? 'No attached files yet.' : 'Chưa có tệp đính kèm nào cho giấy tờ này.'}</p>
                  ) : (
                    <ul className="lv-staff-attachments-list">
                      {(recordAttachments[item.id] || []).map(att => (
                        <li key={att.id} className="lv-staff-attachment-item">
                          <span className="lv-staff-att-name">{att.fileName}</span>
                          <span className="lv-staff-att-size">({formatFileSize(att.sizeBytes, lang)})</span>
                          <button
                            type="button"
                            className="lv-staff-btn-view-att"
                            onClick={() => handleViewAttachment(item.id, att)}
                            disabled={busy}
                          >
                            {en ? 'View file' : 'Xem tệp'}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}

                  {/* Upload new attachment for this record */}
                  <div className="lv-staff-attachment-upload-box">
                    <label>
                      <span>{en ? 'Attach digitized file (PDF, JPEG, PNG, max 10MB):' : 'Đính kèm tệp số hóa (PDF, JPEG, PNG, tối đa 10MB):'}</span>
                      <input
                        type="file"
                        accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
                        disabled={busy || closed || !writeReady || isUploadingAtt[item.id]}
                        onChange={(e) => handleSelectRecordFile(item.id, e.target.files?.[0])}
                      />
                    </label>

                    {selectedRecordFiles[item.id] && (
                      <div className="lv-staff-selected-file-info">
                        <span>{selectedRecordFiles[item.id].name} ({formatFileSize(selectedRecordFiles[item.id].size, lang)})</span>
                        <button
                          type="button"
                          onClick={() => handleClearRecordFile(item.id)}
                          disabled={isUploadingAtt[item.id]}
                        >
                          {en ? 'Remove' : 'Bỏ chọn'}
                        </button>
                        <button
                          type="button"
                          className="lv-staff-btn-submit-att"
                          disabled={busy || closed || !writeReady || isUploadingAtt[item.id]}
                          onClick={() => handleUploadAttachment(item.id)}
                        >
                          {isUploadingAtt[item.id] ? (en ? 'Uploading…' : 'Đang tải lên…') : (en ? 'Upload attachment' : 'Tải lên đính kèm')}
                        </button>
                      </div>
                    )}

                    {uploadAttErrors[item.id] && (
                      <p role="alert" className="lv-staff-att-error">
                        {uploadAttErrors[item.id]}
                      </p>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>

    <form onSubmit={e => { e.preventDefault(); run(async (options, signal) => {
      const saved = await staffDocuments(caseId, kind, draft, options);
      if (signal.aborted) return;
      setRecords(items => [...items, saved]); setDrafts(values => ({ ...values, [kind]: {} }));

      if (stagedFile) {
        const file = stagedFile;
        setStagedFile(null);
        try {
          await uploadStaffDocumentAttachment(caseId, kind, saved.id, file, options);
          if (!signal.aborted) {
            setStagedFile(null);
            setNotice(`${en ? 'Saved by server' : 'Máy chủ đã ghi nhận'}: ${saved.id} — ${saved.receivedAt}. ${en ? 'Attachment uploaded.' : 'Đã đính kèm tệp.'}`);
            loadRecordAttachments(saved.id);
          }
        } catch (attErr) {
          if (!signal.aborted) {
            setActiveRecordId(saved.id);
            setSelectedRecordFiles(prev => ({ ...prev, [saved.id]: file }));
            loadRecordAttachments(saved.id);
            setError(`${en ? 'Document record was saved, but attachment upload failed' : 'Đã lưu bản ghi giấy tờ, nhưng tải tệp đính kèm thất bại'}: ${attErr.message || attErr.code}. ${en ? 'Please retry uploading attachment in the list above.' : 'Vui lòng thử lại bước đính kèm trong danh sách phía trên.'}`);
            setNotice(`${en ? 'Saved by server' : 'Máy chủ đã ghi nhận'}: ${saved.id} — ${saved.receivedAt}`);
          }
        }
      } else {
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

        <label>
          <span>{en ? 'Attach digitized file (optional):' : 'Đính kèm tệp số hóa (tùy chọn):'}</span>
          <input
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={busy || closed || !writeReady}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) { setStagedFile(null); return; }
              const val = validateEvidenceFile(file, lang);
              if (!val.isValid) {
                setStagedFile(null);
                setError(val.errorMessage);
                return;
              }
              setError('');
              setStagedFile(file);
            }}
          />
        </label>
        {stagedFile && (
          <div className="lv-staff-selected-file-info" style={{ marginBottom: 12 }}>
            <span>{stagedFile.name} ({formatFileSize(stagedFile.size, lang)})</span>
            <button type="button" onClick={() => setStagedFile(null)}>{en ? 'Remove' : 'Bỏ chọn'}</button>
          </div>
        )}

        <button type="submit">{en ? 'Record intake' : 'Tiếp nhận giấy tờ'}</button>
      </fieldset>
    </form>
    <p>{en ? 'Document list is loaded to verify your case access before entry. The server checks every write. Recording intake does not approve death or unlock the vault.' : 'Danh sách giấy tờ được tự động tải để kiểm tra quyền trên hồ sơ trước khi nhập. Máy chủ kiểm tra từng thao tác ghi. Tiếp nhận không xác nhận tử vong hoặc mở khóa kho.'}</p>
    <p>{en ? 'Contact and identity selection await case data from PS-93.' : 'Chọn người liên hệ và xác minh danh tính đang chờ dữ liệu theo hồ sơ từ PS-93.'}</p>

    <EvidencePreviewModal
      isOpen={Boolean(previewModal?.isOpen)}
      onClose={() => setPreviewModal(null)}
      blobUrl={previewModal?.blobUrl}
      fileName={previewModal?.fileName}
      contentType={previewModal?.contentType}
      lang={lang}
    />
  </section>;
}
