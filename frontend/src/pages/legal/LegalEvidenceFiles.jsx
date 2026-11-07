import { useEffect, useRef, useState } from 'react';
import { Eye, FileText } from 'lucide-react';
import { listLegalEvidence, readLegalEvidence } from './legalEvidenceService.js';
import { legalDate } from './legalPresentation.js';
import ZoomableImage from '../../components/common/ZoomableImage.jsx';

const fileErrorText = (error, en) => error.status === 404
  ? (en ? 'The file is unavailable or has not been forwarded for Legal review.' : 'Tệp không khả dụng hoặc chưa được chuyển để Pháp lý thẩm định.')
  : [401, 403].includes(error.status) ? (en ? 'You do not have access to this file.' : 'Bạn không có quyền truy cập tệp này.')
  : (en ? 'Unable to load the file. Please retry.' : 'Không thể tải tệp. Vui lòng thử lại.');

export default function LegalEvidenceFiles(props) {
  const { kind, caseId, subjectId, versionNo, accessToken } = props;
  return <EvidenceFiles key={`${kind}:${caseId}:${subjectId}:${versionNo}:${accessToken}`} {...props} />;
}

function EvidencePreview({ subject, item, accessToken, lang, onFailure, onRetry }) {
  const en = lang === 'en';
  const [content, setContent] = useState(null), [error, setError] = useState(null);
  const request = useRef({ subject, item, accessToken, lang });
  const failure = useRef(onFailure);
  useEffect(() => { failure.current = onFailure; }, [onFailure]);
  useEffect(() => {
    const { subject, item, accessToken, lang } = request.current;
    const controller = new AbortController();
    let url = null;
    readLegalEvidence(subject, item, { accessToken, lang, signal: controller.signal }).then(file => {
      if (controller.signal.aborted) return;
      url = URL.createObjectURL(file.blob);
      const extension = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' }[file.contentType];
      setContent({ ...file, url, fileName: subject.kind === 'basis' ? item.fileName + extension : item.fileName });
    }).catch(failed => {
      if (controller.signal.aborted) return;
      setError(failed); failure.current(failed);
    });
    return () => { controller.abort(); if (url) URL.revokeObjectURL(url); };
  }, []);
  return <section className="lv-legal-evidence-inline" role="region" aria-label={item.fileName}>
    <header><h4>{content?.fileName || item.fileName}</h4>{item.uploadedAt && <time dateTime={item.uploadedAt}>{legalDate(item.uploadedAt)}</time>}</header>
    {error ? <div role="alert"><p>{fileErrorText(error, en)}</p><button type="button" onClick={onRetry}>{en ? 'Retry' : 'Thử lại'}</button></div>
      : !content ? <p role="status">{en ? 'Loading file…' : 'Đang tải tệp…'}</p>
      : <div className="lv-legal-evidence__preview">{content.contentType === 'application/pdf'
        // A sandboxed frame cannot run the browser's PDF viewer; the service only lets verified PDF, JPEG and PNG through.
        ? <><iframe src={content.url} title={content.fileName} referrerPolicy="no-referrer" />
          {globalThis.navigator?.pdfViewerEnabled === false && <a href={content.url} download={content.fileName}>{en ? 'Download file' : 'Tải tệp'}</a>}</>
        : <ZoomableImage src={content.url} alt={content.fileName} lang={lang} />}
      </div>}
  </section>;
}

function EvidenceFiles({ kind, caseId, subjectId, versionNo, file, accessToken, lang, onUnauthorized, onDenied, autoOpen = true }) {
  const en = lang === 'en';
  const [result, setResult] = useState(null), [attempt, setAttempt] = useState(0);
  const [selected, setSelected] = useState(null), [fileAttempt, setFileAttempt] = useState(0);
  const callbacks = useRef({ onUnauthorized, onDenied });
  const locale = useRef(lang);
  useEffect(() => { callbacks.current = { onUnauthorized, onDenied }; locale.current = lang; }, [onUnauthorized, onDenied, lang]);
  const handleFailure = error => {
    if (error.status === 401) callbacks.current.onUnauthorized?.();
    if (error.status === 403) callbacks.current.onDenied?.(error);
  };
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
  const files = kind === 'basis' ? [{ ...file, fileName: `${en ? 'Legal document, copy' : 'Văn bản pháp lý, bản số'} ${versionNo}` }] : current?.items;
  const keyOf = item => item.id || versionNo;
  // Open the first file straight away; other files stay one click away.
  const shownKey = selected ?? (autoOpen && files?.length ? keyOf(files[0]) : null);
  const shown = files?.find(item => keyOf(item) === shownKey);
  return <section className="lv-legal-evidence" aria-label={en ? 'Evidence files' : 'Tệp chứng cứ'}>
    <h3>{en ? 'Evidence files' : 'Tệp chứng cứ'}</h3>
    {kind !== 'basis' && !current && <p role="status">{en ? 'Loading files…' : 'Đang tải danh sách tệp…'}</p>}
    {current?.error && <div role="alert"><p>{fileErrorText(current.error, en)}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>{en ? 'Retry' : 'Thử lại'}</button></div>}
    {files?.length === 0 && <p>{en ? 'No files are attached to this document.' : 'Giấy tờ này chưa có tệp đính kèm.'}</p>}
    {files?.filter(item => keyOf(item) !== shownKey).map(item => <div key={keyOf(item)} className="lv-legal-evidence__row"><FileText size={24} className="lv-legal-evidence__icon" aria-hidden="true" />
      <div className="lv-legal-evidence__meta"><span>{item.fileName}</span>
        {item.uploadedAt && <time dateTime={item.uploadedAt}>{legalDate(item.uploadedAt)}</time>}
      </div>
      <button type="button" onClick={() => setSelected(keyOf(item))}><Eye size={16} aria-hidden="true" />{en ? 'Preview file' : 'Xem tệp'}</button></div>)}
    {shown && <EvidencePreview key={`${shownKey}:${fileAttempt}`} subject={{ kind, caseId, subjectId, versionNo }} item={shown} accessToken={accessToken} lang={lang}
      onFailure={handleFailure} onRetry={() => setFileAttempt(value => value + 1)} />}
  </section>;
}
