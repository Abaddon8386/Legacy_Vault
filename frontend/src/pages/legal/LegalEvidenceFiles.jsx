import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Modal } from '../../components/common/Modal.jsx';
import { listLegalEvidence, readLegalEvidence } from './legalEvidenceService.js';
import { legalDate } from './legalPresentation.js';

export default function LegalEvidenceFiles(props) {
  const { kind, caseId, subjectId, versionNo, accessToken } = props;
  return <EvidenceFiles key={`${kind}:${caseId}:${subjectId}:${versionNo}:${accessToken}`} {...props} />;
}

function EvidenceFiles({ kind, caseId, subjectId, versionNo, file, accessToken, lang, onUnauthorized, onDenied }) {
  const en = lang === 'en';
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [preview, setPreview] = useState(null), [fileError, setFileError] = useState(null);
  const opened = useRef(null), request = useRef(null), busy = useRef(false);
  const previewTrigger = useRef(null);
  const callbacks = useRef({ onUnauthorized, onDenied });
  const locale = useRef(lang);
  useEffect(() => { callbacks.current = { onUnauthorized, onDenied }; locale.current = lang; }, [onUnauthorized, onDenied, lang]);
  const handleFailure = error => {
    if (error.status === 401) callbacks.current.onUnauthorized?.();
    if (error.status === 403) callbacks.current.onDenied?.(error);
  };
  useLayoutEffect(() => () => { request.current?.abort(); if (opened.current) URL.revokeObjectURL(opened.current); }, []);
  useEffect(() => {
    if (kind === 'basis') return;
    const controller = new AbortController();
    listLegalEvidence({ kind, caseId, subjectId }, { accessToken, lang: locale.current, signal: controller.signal })
      .then(items => { if (!controller.signal.aborted) setResult({ attempt, items }); })
      .catch(error => { if (!controller.signal.aborted) {
        setResult({ attempt, error });
        if (error.status === 401) callbacks.current.onUnauthorized?.();
        if (error.status === 403) callbacks.current.onDenied?.(error);
      } });
    return () => controller.abort();
  }, [kind, caseId, subjectId, accessToken, attempt]);
  const current = result?.attempt === attempt ? result : null;
  const files = kind === 'basis' ? [{ ...file, fileName: `${en ? 'Basis version' : 'Phiên bản căn cứ'} ${versionNo}` }] : current?.items;
  function close() {
    request.current?.abort(); request.current = null; busy.current = false;
    if (opened.current) { URL.revokeObjectURL(opened.current); opened.current = null; }
    setPreview(null);
  }
  async function open(item, trigger) {
    if (busy.current) return;
    previewTrigger.current = trigger;
    close(); busy.current = true; setFileError(null); setPreview({ fileName: item.fileName });
    const controller = new AbortController(); request.current = controller;
    try {
      const content = await readLegalEvidence({ kind, caseId, subjectId, versionNo }, item, { accessToken, lang, signal: controller.signal });
      if (controller.signal.aborted || request.current !== controller) return;
      const url = URL.createObjectURL(content.blob); opened.current = url;
      const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[content.contentType];
      setPreview({ ...content, url, fileName: kind === 'basis' ? item.fileName + extension : item.fileName });
    } catch (error) {
      if (controller.signal.aborted || request.current !== controller) return;
      setPreview(null); setFileError(error); handleFailure(error);
    } finally { if (request.current === controller) { request.current = null; busy.current = false; } }
  }
  const errorText = error => error.status === 404
    ? (en ? 'The file is unavailable or has not been forwarded for Legal review.' : 'Tệp không khả dụng hoặc chưa được chuyển để Pháp lý thẩm định.')
    : [401, 403].includes(error.status) ? (en ? 'You do not have access to this file.' : 'Bạn không có quyền truy cập tệp này.')
    : (en ? 'Unable to load the file. Please retry.' : 'Không thể tải tệp. Vui lòng thử lại.');
  return <section className="lv-legal-evidence" aria-label={en ? 'Evidence files' : 'Tệp chứng cứ'}>
    <h3>{en ? 'Evidence files' : 'Tệp chứng cứ'}</h3>
    {kind !== 'basis' && !current && <p role="status">{en ? 'Loading files…' : 'Đang tải danh sách tệp…'}</p>}
    {current?.error && <div role="alert"><p>{errorText(current.error)}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Retry' : 'Thử lại'}</button></div>}
    {files?.length === 0 && <p>{en ? 'No files are attached to this record.' : 'Bản ghi này chưa có tệp đính kèm.'}</p>}
    {files?.map(item => <div key={item.id || versionNo} className="lv-legal-evidence__row"><span>{item.fileName}</span>
      {item.uploadedAt && <time dateTime={item.uploadedAt}>{legalDate(item.uploadedAt)}</time>}
      <button type="button" onClick={event => open(item, event.currentTarget)} disabled={Boolean(preview)}>{en ? 'Preview file' : 'Xem tệp'}</button></div>)}
    {fileError && <p role="alert">{errorText(fileError)}</p>}
    {preview && <Modal isOpen onClose={close} title={preview.fileName} closeLabel={en ? 'Close' : 'Đóng'} maxWidth="960px" returnFocusRef={previewTrigger}>
      {!preview.url ? <p role="status">{en ? 'Loading file…' : 'Đang tải tệp…'}</p>
        : <div className="lv-legal-evidence__preview">{preview.contentType === 'application/pdf'
          ? <iframe src={preview.url} title={preview.fileName} sandbox="" referrerPolicy="no-referrer" />
          : <img src={preview.url} alt={preview.fileName} />}
          <a href={preview.url} download={preview.fileName} tabIndex={0}>{en ? 'Download file' : 'Tải tệp'}</a>
        </div>}
    </Modal>}
  </section>;
}
