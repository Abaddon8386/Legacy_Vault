import { useEffect, useRef, useState } from 'react';
import { willService, willStatusMessages, formatFileSize, formatDateTime } from '../../utils/willService.js';
import { getWillUploadErrors, willValidationMessages, MAX_NOTE_LENGTH } from '../../utils/willValidation.js';
import './WillUploadPage.css';

const copy = {
  vi: {
    title: 'Lưu bản di chúc số hóa', intro: 'Lưu giữ bản chụp hoặc bản quét di chúc trong hồ sơ di sản của bạn.',
    formTitle: 'Tài liệu di chúc', formats: 'PDF, JPEG hoặc PNG · Tối đa 10 MB', choose: 'Chọn tệp tài liệu',
    chooseHint: 'Chọn bản chụp hoặc bản quét rõ nét, đầy đủ các trang.', remove: 'Bỏ chọn tệp',
    progress: 'Tiến trình tải lên', preparing: 'Đang chuẩn bị tài liệu…', sending: 'Đang gửi tài liệu…',
    confirming: 'Đang xác nhận kết quả…', cancel: 'Hủy thao tác', another: 'Tải lên tài liệu khác',
    saved: 'Tài liệu đã được ghi nhận', details: 'Thông tin kỹ thuật',
    errors: {
      BACKEND_NOT_READY: 'Chưa thể kết nối hồ sơ di chúc. Vui lòng thử lại sau.',
      UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      FORBIDDEN: 'Bạn không có quyền tải tài liệu vào kho này.', NOT_FOUND: 'Không tìm thấy kho di sản.',
      VAULT_NOT_EDITABLE: 'Kho hiện không cho phép bổ sung tài liệu.',
      PAYLOAD_TOO_LARGE: 'Tài liệu quá lớn. Vui lòng chọn tệp nhỏ hơn.',
      UNSUPPORTED_MEDIA_TYPE: 'Vui lòng chọn tài liệu PDF, JPEG hoặc PNG.',
      VALIDATION_FAILED: 'Tài liệu hoặc ghi chú chưa hợp lệ. Vui lòng kiểm tra lại.',
      ABORTED: 'Đã dừng chờ tải lên. Vui lòng kiểm tra hồ sơ trước khi thử lại.',
      TIMEOUT: 'Chưa nhận được kết quả tải lên. Vui lòng kiểm tra hồ sơ trước khi thử lại.',
    },
  },
  en: {
    title: 'Store a digitized will', intro: 'Keep a photographed or scanned copy of your will in your heritage records.',
    formTitle: 'Will document', formats: 'PDF, JPEG or PNG · Up to 10 MB', choose: 'Choose document',
    chooseHint: 'Choose a clear, complete photograph or scan.', remove: 'Remove file',
    progress: 'Upload progress', preparing: 'Preparing document…', sending: 'Sending document…',
    confirming: 'Confirming upload…', cancel: 'Cancel upload', another: 'Upload another document',
    saved: 'Document recorded', details: 'Technical information',
    errors: {
      BACKEND_NOT_READY: 'Will records cannot be reached yet. Please try again later.',
      UNAUTHORIZED: 'Your session has expired. Please sign in again.',
      FORBIDDEN: 'You do not have permission to upload to this vault.', NOT_FOUND: 'Heritage vault not found.',
      VAULT_NOT_EDITABLE: 'This vault currently does not accept new documents.',
      PAYLOAD_TOO_LARGE: 'The document is too large. Please choose a smaller file.',
      UNSUPPORTED_MEDIA_TYPE: 'Please select a PDF, JPEG or PNG document.',
      VALIDATION_FAILED: 'Please check the document and note before trying again.',
      ABORTED: 'Stopped waiting for the upload. Check your records before trying again.',
      TIMEOUT: 'No upload result received. Check your records before trying again.',
    },
  },
};
const formatNames = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG' };

export default function WillUploadPage(props) {
  return <UploadForm key={JSON.stringify([props.vaultId, props.accessToken])} {...props} />;
}

function UploadForm({ lang = 'vi', vaultId, accessToken }) {
  const language = lang === 'en' ? 'en' : 'vi';
  const t = copy[language]; const messages = willStatusMessages[language];
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const inputRef = useRef(null);
  const pendingRef = useRef(false);
  const requestRef = useRef(null);
  const contextRef = useRef(null);

  useEffect(() => {
    const context = {};
    contextRef.current = context;
    return () => {
      contextRef.current = null;
      requestRef.current?.abort();
      requestRef.current = null;
      pendingRef.current = false;
    };
  }, []);

  // A changed vault/session gets a separate form; old receipts never carry across owners.
  const current = result?.receipt;
  async function submit(event) {
    event.preventDefault();
    if (pendingRef.current) return;
    const nextErrors = getWillUploadErrors({ file, note });
    setErrors(nextErrors); setErrorCode(null);
    if (Object.keys(nextErrors).length) return;
    pendingRef.current = true;
    const context = contextRef.current;
    const controller = new AbortController(); requestRef.current = controller;
    setBusy(true); setProgress(0);
    try {
      const receipt = await willService.uploadWill(vaultId, file, note, {
        lang: language, accessToken, signal: controller.signal,
        onProgress: value => { if (contextRef.current === context && requestRef.current === controller) setProgress(value); },
      });
      if (contextRef.current !== context || requestRef.current !== controller || controller.signal.aborted) return;
      setResult({ receipt, context }); setFile(null); setNote('');
      if (inputRef.current) inputRef.current.value = '';
    } catch (error) {
      if (contextRef.current !== context || requestRef.current !== controller) return;
      setErrorCode(error?.code || 'UPLOAD_FAILED');
      if (error?.fieldErrors) setErrors(error.fieldErrors);
    } finally {
      if (contextRef.current === context && requestRef.current === controller) {
        pendingRef.current = false; requestRef.current = null; setBusy(false);
      }
    }
  }
  const v = current?.currentVersion;
  return (
    <section className="hn-will-page" aria-labelledby="will-title">
      <div className="hn-will-intro">
        <h1 id="will-title">{t.title}</h1><p>{t.intro}</p>
      </div>
      <aside className="hn-will-notice" aria-label={messages.NOTICE_TITLE}>
        <span aria-hidden="true">ⓘ</span><div><strong>{messages.NOTICE_TITLE}</strong><p>{messages.NOTICE_CONTENT}</p></div>
      </aside>
      {current ? (
        <section className="hn-will-card" aria-labelledby="will-saved">
          <div className="hn-will-success" role="status"><span aria-hidden="true">✓</span><div><h2 id="will-saved">{t.saved}</h2><p>{messages.UPLOAD_SUCCESS}</p></div></div>
          <dl className="hn-will-metadata">
            <div><dt>{messages.STATUS_LABEL}</dt><dd><span className="hn-will-status">{messages.UPLOADED}</span></dd></div>
            <div><dt>{messages.VERSION_LABEL}</dt><dd>{v.version}</dd></div>
            <div><dt>{messages.FILE_NAME_LABEL}</dt><dd>{v.fileName}</dd></div>
            <div><dt>{messages.MIME_TYPE_LABEL}</dt><dd>{formatNames[v.contentType]}</dd></div>
            <div><dt>{messages.FILE_SIZE_LABEL}</dt><dd>{formatFileSize(v.sizeBytes)}</dd></div>
            <div><dt>{messages.UPLOADED_AT_LABEL}</dt><dd>{formatDateTime(v.uploadedAt, language)}</dd></div>
          </dl>
          {v.sha256 && <details className="hn-will-hash"><summary>{t.details}</summary><p>{messages.SHA256_LABEL}</p><code>{v.sha256}</code><p>{messages.SHA256_HINT}</p></details>}
          <button type="button" className="hn-will-secondary" onClick={() => { setResult(null); setErrors({}); setErrorCode(null); }}>{t.another}</button>
        </section>
      ) : (
        <form className="hn-will-card" onSubmit={submit} noValidate aria-busy={busy}>
          <h2>{t.formTitle}</h2><p className="hn-will-formats" id="will-file-hint">{t.formats}</p>
          <label className="hn-will-label" htmlFor="will-file">{messages.FILE_LABEL} <span aria-hidden="true">*</span></label>
          <input className="hn-will-file-input" id="will-file" type="file" ref={inputRef} accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png" disabled={busy}
            aria-invalid={Boolean(errors.file)} aria-describedby={`will-file-hint${errors.file ? ' will-file-error' : ''}`}
            onChange={event => { if (pendingRef.current) return; setFile(event.target.files?.[0] || null); setErrors(old => ({ ...old, file: null })); setErrorCode(null); }} />
          <button className="hn-will-picker" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <span className="hn-will-document-icon" aria-hidden="true">↑</span><strong>{t.choose}</strong><span>{t.chooseHint}</span>
          </button>
          {file && <div className="hn-will-selected"><div><strong>{file.name}</strong><span>{formatFileSize(file.size)}</span></div><button type="button" disabled={busy} aria-label={t.remove} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ''; }}>{t.remove}</button></div>}
          {errors.file && <p className="hn-will-error" id="will-file-error" role="alert">{willValidationMessages[language][errors.file]}</p>}
          <label className="hn-will-label hn-will-note-label" htmlFor="will-note">{messages.NOTE_LABEL}<span>{note.length}/{MAX_NOTE_LENGTH}</span></label>
          <textarea id="will-note" value={note} rows={3} maxLength={MAX_NOTE_LENGTH} disabled={busy} placeholder={messages.NOTE_PLACEHOLDER}
            aria-invalid={Boolean(errors.note)} aria-describedby={errors.note ? 'will-note-error' : undefined} onChange={event => setNote(event.target.value)} />
          {errors.note && <p className="hn-will-error" id="will-note-error" role="alert">{willValidationMessages[language][errors.note]}</p>}
          {errorCode && <p className="hn-will-error hn-will-error-panel" role="alert">{t.errors[errorCode] || messages.UPLOAD_FAILED}</p>}
          {busy && <div className="hn-will-progress" role="status"><div>{progress === 0 ? t.preparing : progress >= 99 ? t.confirming : t.sending} {progress != null && <span>{progress}%</span>}</div><progress max={100} value={progress == null ? undefined : progress} aria-label={t.progress} /></div>}
          <div className="hn-will-actions"><button className="hn-will-primary" type="submit" disabled={busy}>{busy ? messages.UPLOADING_BTN : messages.UPLOAD_BTN}</button>
            {busy && <button type="button" className="hn-will-secondary" onClick={() => requestRef.current?.abort()}>{t.cancel}</button>}
          </div>
        </form>
      )}
    </section>
  );
}
