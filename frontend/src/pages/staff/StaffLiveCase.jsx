import {staffWorkflowNotificationFeedback as workflowNotificationFeedback, publishStaffWorkflowChange} from '../../utils/staffWorkflowNotification.js';
import { useEffect, useRef, useState, useCallback } from 'react';
import {
  loadStaffCase,
  claimStaffCase,
  staffDocuments,
  staffDocumentAttachments,
  uploadStaffDocumentAttachment,
  readStaffDocumentAttachmentContent,
} from './staffLiveService.js';
import { formatFileSize, EVIDENCE_UPLOAD_I18N } from '../../utils/staffEvidenceUpload.js';
import { formatIsoToDisplay } from '../../utils/datePickerHelpers.js';
import EvidenceFileUploader from '../../components/common/EvidenceFileUploader.jsx';
import FeedbackNotice from '../../components/common/FeedbackNotice.jsx';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';
import { DatePicker } from '../../components/common/DatePicker.jsx';
import { ChevronDown, RefreshCw } from 'lucide-react';
import StaffCaseContextBar from '../../components/staff/StaffCaseContextBar.jsx';
import { useDistributionWorkflow } from '../../workflows/useDistributionWorkflow.js';
import { staffStage } from '../../utils/staffStage.js';
import './StaffLiveCase.css';
import { WillComparisonOutcome } from '../../components/staff/StaffDocumentOutcome.jsx';

const labels = {
  documentType: ['Loại giấy tờ', 'Document type'], issuingAuthority: ['Cơ quan cấp', 'Issuing authority'],
  documentNumber: ['Số giấy tờ', 'Document number'], issuedDate: ['Ngày cấp', 'Issued date'],
  evidenceReference: ['Tham chiếu bằng chứng', 'Evidence reference'], notes: ['Ghi chú', 'Notes'],
  deliveredByName: ['Họ tên người nộp', 'Delivered by'], deliveredByRelationship: ['Mối quan hệ', 'Relationship'],
  conditionNotes: ['Tình trạng bản gốc', 'Original condition'],
};
const requiredFields = ['documentType', 'issuingAuthority', 'documentNumber', 'issuedDate', 'deliveredByName', 'conditionNotes'];
const fields = {
  'death-documents': ['documentType', 'issuingAuthority', 'documentNumber', 'issuedDate', 'evidenceReference', 'notes'],
  'original-will-intakes': ['deliveredByName', 'deliveredByRelationship', 'evidenceReference', 'conditionNotes'],
};

function intakeFeedback(value, en) {
  const code = typeof value === 'string' ? value : value?.code;
  for (const key of ['fileRequired', 'fileEmpty', 'fileTypeInvalid', 'fileTooLarge']) {
    if ([EVIDENCE_UPLOAD_I18N.vi[key], EVIDENCE_UPLOAD_I18N.en[key]].includes(code)) return EVIDENCE_UPLOAD_I18N[en ? 'en' : 'vi'][key];
  }
  const messages = {
    VERIFICATION_CASE_NOT_CLAIMABLE: ['Hồ sơ đã có người phụ trách hoặc không còn ở trạng thái tiếp nhận. Vui lòng quay lại danh sách để kiểm tra.', 'This case is assigned or no longer available for intake. Return to the case list to check.'],
    RESOURCE_NOT_FOUND: ['Không tìm thấy hồ sơ hoặc bạn chưa được phân công xử lý hồ sơ này.', 'This case is unavailable or is not assigned to you.'],
    ACCESS_DENIED: ['Bạn không có quyền thực hiện thao tác này. Vui lòng liên hệ người quản lý.', 'You cannot perform this action. Please contact your manager.'],
    UNAUTHENTICATED: ['Phiên làm việc đã hết hạn. Vui lòng đăng nhập lại.', 'Your session has expired. Please sign in again.'],
    VALIDATION_FAILED: ['Vui lòng kiểm tra các thông tin bắt buộc và thử lại.', 'Please check the required information and try again.'],
    CASE_CONFLICT: ['Hồ sơ vừa được cập nhật. Vui lòng tải lại trước khi tiếp tục.', 'The case has changed. Please reload before continuing.'],
    NETWORK_ERROR: ['Chưa kết nối được máy chủ. Vui lòng kiểm tra kết nối và thử lại.', 'Unable to connect. Please check your connection and retry.'],
  };
  return messages[code]?.[en ? 1 : 0] || (en ? 'Unable to complete this action. Please reload the information and try again. Your entered details are preserved.' : 'Chưa thể hoàn tất thao tác. Vui lòng tải lại thông tin và thử lại. Nội dung bạn đã nhập vẫn được giữ.');
}

// en-GB gives "26/10/2026, 15:33"; vi-VN would put the time first.
const formatDateTime = value => new Intl.DateTimeFormat('en-GB', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(value));
const documentKinds = [['death-documents', 'Giấy tờ tử vong', 'Death documents'], ['original-will-intakes', 'Di chúc gốc', 'Original will']];

const documentTypes = { DEATH_CERTIFICATE: ['Giấy chứng tử', 'Death certificate'], DEATH_REGISTRATION_EXTRACT: ['Trích lục khai tử', 'Death registration extract'] };

function DocumentDetails({ item, kind, en }) {
  const display = key => {
    if (key === 'documentType') return documentTypes[item[key]]?.[en ? 1 : 0];
    if (key === 'issuedDate') return formatIsoToDisplay(item[key], en);
    return item[key];
  };
  return <table className="lv-staff-detail-table">
    <tbody>
      {fields[kind].map(key => <tr key={key}><th scope="row">{labels[key][en ? 1 : 0]}</th><td>{display(key) || '—'}</td></tr>)}
      <tr><th scope="row">{en ? 'Received at' : 'Thời điểm tiếp nhận'}</th><td>{Number.isNaN(new Date(item.receivedAt).getTime()) ? '—' : formatDateTime(item.receivedAt)}</td></tr>
    </tbody>
  </table>;
}

export function DeathDocumentDecision({ decision, en }) {
  if (decision === undefined) return <p className="lv-intake-decision-unavailable">{en ? 'Legal decision data is unavailable. Refresh the documents.' : 'Chưa có dữ liệu kết quả pháp lý. Vui lòng cập nhật giấy tờ.'}</p>;
  const status = decision?.result || 'PENDING';
  const label = {
    PENDING: ['Chờ Ban Pháp lý kiểm tra', 'Awaiting Legal review'],
    APPROVED: ['Đã chấp thuận', 'Accepted'],
    REJECTED: ['Đã từ chối', 'Rejected'],
    NEEDS_CORRECTION: ['Cần bổ sung giấy tờ', 'Additional documents required'],
  }[status];
  return <div className={`lv-intake-decision is-${status.toLowerCase()}`}>
    <strong className="lv-intake-decision-status">{label[en ? 1 : 0]}</strong>
    {decision && <><p><strong>{en ? 'Legal’s reason: ' : 'Lý do của Ban Pháp lý: '}</strong>{decision.reason}</p>
      <time dateTime={decision.decidedAt}>{en ? 'Decided ' : 'Quyết định lúc '}{formatDateTime(decision.decidedAt)}</time></>}
  </div>;
}

export default function StaffLiveCase(props) {
  return <ScopedStaffLiveCase key={`${props.caseId}:${props.accessToken}`} {...props} />;
}

function ScopedStaffLiveCase({ caseId, accessToken, lang, onBack, onUnauthorized }) {
  const en = lang === 'en';
  const [data, setData] = useState(null);
  const distribution = useDistributionWorkflow({ caseId, workspace: 'STAFF', accessToken, lang, enabled: Boolean(data), onUnauthorized });
  const [kind, setKind] = useState(() => {
    if (typeof window !== 'undefined') {
      const param = new URLSearchParams(window.location.search).get('tab') || new URLSearchParams(window.location.search).get('kind');
      if (param === 'original-will-intakes' || param === 'original-will') return 'original-will-intakes';
    }
    return 'death-documents';
  });
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
  const [documentPage, setDocumentPage] = useState(1);
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
  const documentsWritePending = useRef(false);
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
    if (documentsWritePending.current) return;
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

  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible' && !lock.current && !Object.values(isUploadingAtt).some(Boolean)) loadDocuments(kind);
    };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const timer = window.setInterval(refresh, 30000);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', refresh); window.clearInterval(timer); };
  }, [loadDocuments, kind, isUploadingAtt]);

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

  const handleRecordFileChange = (recordId, file) => {
    setSelectedRecordFiles(prev => ({ ...prev, [recordId]: file }));
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
      setNotice(`${en ? 'File attached successfully' : 'Đã đính kèm tệp'}: ${receipt.fileName}.${workflowNotificationFeedback(receipt, 'LEGAL', lang)}`);
      publishStaffWorkflowChange();
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
    // Invalidate pre-write snapshots before saving; even a late transport must not
    // replace the successful intake with its older document list.
    documentsWritePending.current = true;
    docsController.current?.abort();
    setRecordsLoading(false);
    setBusy(true); setError(''); setNotice('');
    try { await action({ accessToken, lang, signal: c.signal }, c.signal); }
    catch (err) {
      if (c.signal.aborted) return;
      if (err.status === 401) auth.current?.();
      if ([401, 403, 404].includes(err.status)) setWriteReady(false);
      setError(err.code || 'NETWORK_ERROR');
    } finally { documentsWritePending.current = false; if (!c.signal.aborted) { lock.current = false; setBusy(false); } }
  }

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(''), 8000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  // Abort mutations as well as reads when the case/session leaves this screen.
  useEffect(() => () => {
    controller.current?.abort();
    docsController.current?.abort();
    abortAttachments();
  }, []);

  const draft = drafts[kind] || {};
  const closed = data?.status !== 'OPEN';
  const numberedRecords = [...records].sort((left,right)=>Date.parse(left.receivedAt)-Date.parse(right.receivedAt)||left.id.localeCompare(right.id))
    .map((item,index)=>({item,number:index+1})).reverse();
  const pageCount = Math.max(1, Math.ceil(numberedRecords.length / 5));
  const currentPage = Math.min(documentPage, pageCount);
  const visibleRecords = numberedRecords.slice((currentPage-1)*5, currentPage*5);
  return <section className="lv-staff-live" aria-busy={busy || recordsLoading}>
    <StaffCaseContextBar
      caseId={caseId}
      caseItem={data}
      stage={staffStage(distribution.data, en)}
      onChangeCase={onBack}
      lang={lang}
    />
    {busy &&<div role="status"><progress aria-label={en ? 'Processing' : 'Đang xử lý'} /> {en ? 'Processing…' : 'Đang xử lý…'}</div>}
    {error && <FeedbackNotice className="lv-feedback--floating" tone="error" title={en ? 'Action not completed' : 'Chưa thể hoàn tất'} action={<button type="button" onClick={() => setError('')}>{en ? 'Close' : 'Đóng'}</button>}>{intakeFeedback(error, en)}</FeedbackNotice>}
    {notice && <FeedbackNotice className="lv-feedback--floating" tone="success">{notice}</FeedbackNotice>}
    {!data && !busy && <button onClick={() => run(async (options, signal) => {
      const value = await loadStaffCase(caseId, options);
      if (!signal.aborted) setData(value);
    })}>{en ? 'Retry loading case' : 'Thử tải lại hồ sơ'}</button>}
    {data?.assignmentStatus !== 'ASSIGNED_TO_CURRENT_STAFF' && <button className="lv-staff-live__claim" disabled={busy || closed || (data?.assignmentStatus && data.assignmentStatus !== 'UNASSIGNED_CLAIMABLE')} onClick={async () => {
      let claimed = false;
      await run(async (options, signal) => {
        const value = await claimStaffCase(caseId, options);
        if (!signal.aborted) { setData(value); setNotice((en ? 'Case assigned to you.' : 'Đã nhận hồ sơ.') + workflowNotificationFeedback(value,'LEGAL',lang)); publishStaffWorkflowChange(); claimed = true; }
      });
      // The list was read before the case was assigned (not-assigned error); reload it now.
      // Must run after `run` finishes: documentsWritePending blocks reads while it is active.
      if (claimed) loadDocuments(kind);
    }}>{en ? 'Claim case' : 'Nhận hồ sơ'}</button>}
    <div className="lv-intake-tabs" role="group" aria-label={en ? 'Record category' : 'Nhóm giấy tờ'}>
      {documentKinds.map(([nextKind, vi, english]) => <button key={nextKind} type="button" aria-pressed={kind === nextKind} disabled={busy || recordsLoading} onClick={() => {
        if (kind === nextKind) return;
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
        setDocumentPage(1);
      }}>{en ? english : vi}</button>)}
    </div>

    <div className="lv-staff-live__records-section lv-staff-glow">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
        <h2>{en ? 'Received documents' : 'Giấy tờ đã tiếp nhận'}{recordsLoaded && !recordsError && !recordsLoading && <span className="lv-intake-count">{records.length}</span>}</h2>
        <button
          type="button"
          disabled={busy || recordsLoading || !data}
          onClick={() => loadDocuments(kind)}
        >
          <RefreshCw size={15} aria-hidden="true" />{en ? 'Refresh' : 'Làm mới'}
        </button>
      </div>

      {recordsLoading && (
        <div role="status">
          <progress aria-label={en ? 'Loading documents' : 'Đang tải giấy tờ'} /> {en ? 'Loading document list…' : 'Đang tải danh sách giấy tờ…'}
        </div>
      )}

      {recordsError && (
        <p role="alert">
          {intakeFeedback(recordsError, en)}
        </p>
      )}

      {!recordsLoading && !recordsError && recordsLoaded && records.length === 0 && (
        <p>{en ? 'No documents received in this category yet.' : 'Chưa có giấy tờ nào được tiếp nhận trong nhóm này.'}</p>
      )}

      {!recordsLoading && records.length > 0 && (
        <ul className="lv-staff-records-list">
          {visibleRecords.map(({item,number}) => {
            const outcome = kind === 'death-documents' ? item.legalDecision : item.comparison;
            const result = outcome?.result || (outcome === null ? 'PENDING' : 'UNAVAILABLE');
            const status = {
              PENDING: [en ? 'Awaiting Legal' : 'Chờ Ban Pháp lý', 'pending'],
              UNAVAILABLE: [en ? 'Result unavailable' : 'Chưa có dữ liệu kết quả', 'unavailable'],
              APPROVED: [en ? 'Accepted' : 'Đã chấp thuận', 'positive'],
              REJECTED: [en ? 'Rejected' : 'Đã từ chối', 'negative'],
              NEEDS_CORRECTION: [en ? 'More documents required' : 'Cần bổ sung giấy tờ', 'warning'],
              MATCH: [en ? 'Matches' : 'Đối chiếu khớp', 'positive'],
              MISMATCH: [en ? 'Does not match' : 'Không khớp', 'negative'],
              INCONCLUSIVE: [en ? 'Inconclusive' : 'Chưa đủ cơ sở', 'warning'],
            }[result];
            return (
            <li key={item.id} className={`lv-staff-record-item is-${status[1]}${activeRecordId === item.id ? ' is-selected' : ''}`}>
              <div className="lv-staff-record-summary">
                <div className="lv-intake-document-meta"><strong>{en?'Document':'Giấy tờ'} {number} · {item.documentNumber ? `${en ? 'No.' : 'Số'} ${item.documentNumber}` : item.deliveredByName}</strong><time dateTime={item.receivedAt}>{en ? 'Received ' : 'Nhận lúc '}{Number.isNaN(new Date(item.receivedAt).getTime()) ? '—' : formatDateTime(item.receivedAt)}</time>
                  {outcome?.reason && activeRecordId !== item.id && <p className="lv-staff-record-reason" title={outcome.reason}>{outcome.reason}</p>}
                </div>
                <span className={`lv-staff-record-status is-${status[1]}`}>{status[0]}</span>
                <button
                  type="button"
                  className="lv-staff-btn-toggle-att"
                  onClick={() => toggleRecordAttachments(item.id)}
                  aria-expanded={activeRecordId === item.id}
                  aria-controls={`document-detail-${item.id}`}
                  disabled={Object.values(isUploadingAtt).some(Boolean)}
                >
                  <ChevronDown size={16} aria-hidden="true" className={activeRecordId === item.id ? 'is-open' : ''} />{activeRecordId === item.id ? (en ? 'Collapse' : 'Thu gọn') : (en ? 'View details' : 'Xem chi tiết')}
                </button>
              </div>

              {activeRecordId === item.id && (
                <div id={`document-detail-${item.id}`} className="lv-staff-attachments-pane" role="region" aria-label={en ? `Details for document ${number}` : `Chi tiết giấy tờ ${number}`}>
                  {outcome !== null && kind === 'death-documents' && <DeathDocumentDecision decision={item.legalDecision} en={en} />}
                  {outcome !== null && kind === 'original-will-intakes' && <WillComparisonOutcome comparison={item.comparison} en={en} />}
                  <DocumentDetails item={item} kind={kind} en={en} />
                  {attachmentLoading[item.id] ? (
                    <p>{en ? 'Loading attachments…' : 'Đang tải danh sách tệp đính kèm…'}</p>
                  ) : attachmentErrors[item.id] ? (
                    <p role="alert">{intakeFeedback(attachmentErrors[item.id], en)}</p>
                  ) : (recordAttachments[item.id] || []).length === 0 ? (
                    <p className="lv-staff-no-att">{en ? 'No attached files yet.' : 'Chưa có tệp đính kèm nào cho giấy tờ này.'}</p>
                  ) : (
                    <table className="lv-evidence-file-table lv-staff-attachments-table">
                      <thead>
                        <tr>
                          <th scope="col">{en ? 'File name' : 'Tên tệp'}</th>
                          <th scope="col">{en ? 'Size' : 'Dung lượng'}</th>
                          <th scope="col">{en ? 'Action' : 'Chức năng'}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(recordAttachments[item.id] || []).map(att => (
                          <tr key={att.id}>
                            <td className="lv-evidence-file-table__name">{att.fileName}</td>
                            <td className="lv-evidence-file-table__size">{formatFileSize(att.sizeBytes, lang)}</td>
                            <td>
                              <button
                                type="button"
                                className="lv-staff-btn-view-att"
                                onClick={() => handleViewAttachment(item.id, att)}
                                disabled={busy}
                              >
                                {en ? 'View file' : 'Xem tệp'}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* A file or a Legal result means the document has reached Legal: nothing more can be attached here. */}
                  {!closed && !outcome && !attachmentLoading[item.id] && recordAttachments[item.id]?.length === 0 && <div className="lv-staff-attachment-upload-box">
                    <EvidenceFileUploader
                      file={selectedRecordFiles[item.id] || null}
                      onFileChange={file => handleRecordFileChange(item.id, file)}
                      disabled={busy || closed || !writeReady || isUploadingAtt[item.id]}
                      lang={lang}
                      required={false}
                      label={en ? 'Attach digitized file' : 'Đính kèm tệp số hóa'}
                    />

                    {selectedRecordFiles[item.id] && (
                      <div className="lv-staff-upload-actions">
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
                        {intakeFeedback(uploadAttErrors[item.id], en)}
                      </p>
                    )}
                  </div>}
                </div>
              )}
            </li>
          );})}
        </ul>
      )}
      {!recordsLoading && records.length > 5 && <nav className="lv-staff-doc-pagination" aria-label={en ? 'Document pages' : 'Trang giấy tờ'}>
        <span>{(currentPage-1)*5+1}–{Math.min(currentPage*5,records.length)} / {records.length}</span>
        <button type="button" disabled={currentPage===1 || Object.values(isUploadingAtt).some(Boolean)} onClick={()=>{setDocumentPage(currentPage-1);setActiveRecordId(null);}}>{en ? 'Previous' : 'Trang trước'}</button>
        <button type="button" disabled={currentPage===pageCount || Object.values(isUploadingAtt).some(Boolean)} onClick={()=>{setDocumentPage(currentPage+1);setActiveRecordId(null);}}>{en ? 'Next' : 'Trang sau'}</button>
      </nav>}
    </div>

    {data?.status !== 'CLOSED' && <form onSubmit={e => { e.preventDefault(); run(async (options, signal) => {
      const saved = await staffDocuments(caseId, kind, draft, options);
      if (signal.aborted) return;
      publishStaffWorkflowChange();
      setRecords(items => [...items, saved]); setDrafts(values => ({ ...values, [kind]: {} }));
      setDocumentPage(1); setActiveRecordId(null);

      if (stagedFile) {
        const file = stagedFile;
        setStagedFile(null);
        try {
          const attachmentReceipt = await uploadStaffDocumentAttachment(caseId, kind, saved.id, file, options);
          if (!signal.aborted) {
            setStagedFile(null);
            setNotice((en ? 'Document saved with its attachment.' : 'Đã tiếp nhận giấy tờ và lưu tệp đính kèm.') + workflowNotificationFeedback(attachmentReceipt, 'LEGAL', lang));
            publishStaffWorkflowChange();
            loadRecordAttachments(saved.id);
          }
        } catch (attErr) {
          if (!signal.aborted) {
            setActiveRecordId(saved.id);
            setSelectedRecordFiles(prev => ({ ...prev, [saved.id]: file }));
            loadRecordAttachments(saved.id);
            setUploadAttErrors(prev => ({...prev, [saved.id]: attErr.code || 'UPLOAD_FAILED'}));
            setNotice(en ? 'Document saved. Please retry attaching the file in the document list.' : 'Đã tiếp nhận giấy tờ. Vui lòng tải lại tệp đính kèm tại giấy tờ vừa lưu trong danh sách.');
          }
        }
      } else {
        setNotice((en ? 'Document saved successfully.' : 'Đã tiếp nhận giấy tờ thành công.') + workflowNotificationFeedback(saved, 'LEGAL', lang));
      }
    }); }}>
      <fieldset disabled={busy || closed || !writeReady}>
        <legend>{en ? 'Record new document intake' : 'Tiếp nhận giấy tờ mới'}</legend>
        <div className="lv-intake-fields">{fields[kind].map(key => <label key={key}><span>{labels[key][en ? 1 : 0]}{requiredFields.includes(key) && <span className="lv-required-mark" aria-hidden="true">*</span>}</span>
          {key === 'documentType' ? <select required value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))}>
            <option value="">{en ? 'Select' : 'Chọn'}</option>
            <option value="DEATH_CERTIFICATE">{en ? 'Death certificate' : 'Giấy chứng tử'}</option>
            <option value="DEATH_REGISTRATION_EXTRACT">{en ? 'Death registration extract' : 'Trích lục khai tử'}</option>
          </select> : key === 'issuedDate' ? <DatePicker required value={draft[key] || ''} max={new Date().toISOString().slice(0, 10)} lang={lang} onChange={value => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: value } }))} /> : <input type="text" required={requiredFields.includes(key)}
            maxLength={({ issuingAuthority: 255, documentNumber: 100, deliveredByName: 150, deliveredByRelationship: 100, evidenceReference: 500 })[key] || 1000}
            value={draft[key] || ''} onChange={e => setDrafts(values => ({ ...values, [kind]: { ...values[kind], [key]: e.target.value } }))} />}
        </label>)}</div>

        <EvidenceFileUploader
          file={stagedFile}
          onFileChange={setStagedFile}
          disabled={busy || closed || !writeReady}
          lang={lang}
          required={false}
          label={en ? 'Attach digitized file (optional)' : 'Đính kèm tệp số hóa (tùy chọn)'}
        />

        <button type="submit">{en ? 'Record intake' : 'Tiếp nhận giấy tờ'}</button>
      </fieldset>
    </form>}

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
