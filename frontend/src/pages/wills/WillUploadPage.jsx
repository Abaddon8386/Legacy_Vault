import { useEffect, useRef, useState, useCallback } from 'react';
import {
  willService,
  willStatusMessages,
  formatFileSize,
  formatDateTime,
  downloadBlobFile,
  openBlobPreview,
} from '../../utils/willService.js';
import {
  getWillUploadErrors,
  willValidationMessages,
  MAX_NOTE_LENGTH,
} from '../../utils/willValidation.js';
import { Button } from '../../components/common/Button.jsx';
import {
  FileText,
  Plus,
  RefreshCw,
  Download,
  Eye,
  EyeOff,
  AlertCircle,
  X,
  UploadCloud,
} from 'lucide-react';
import './WillUploadPage.css';

const copy = {
  vi: {
    title: 'Hồ sơ di chúc số hóa',
    intro: 'Lưu giữ, kiểm tra tính toàn vẹn và theo dõi lịch sử các phiên bản di chúc trong kho di sản.',
    formTitle: 'Tài liệu di chúc ban đầu',
    versionFormTitle: 'Tải lên phiên bản di chúc mới',
    formats: 'PDF, JPEG hoặc PNG · Tối đa 10 MB',
    choose: 'Chọn tệp tài liệu',
    chooseHint: 'Chọn bản chụp hoặc bản quét rõ nét, đầy đủ các trang.',
    remove: 'Bỏ chọn tệp',
    progress: 'Tiến trình tải lên',
    preparing: 'Đang chuẩn bị tài liệu…',
    sending: 'Đang gửi tài liệu…',
    confirming: 'Đang xác nhận kết quả…',
    cancel: 'Hủy thao tác',
    another: 'Tải lên tài liệu khác',
    saved: 'Tài liệu đã được ghi nhận',
    willListTitle: 'Danh sách hồ sơ di chúc',
    uploadNewWillBtn: 'Tạo hồ sơ di chúc mới',
    uploadNewVersionBtn: 'Tải lên phiên bản mới',
    versionsHistoryTitle: 'Lịch sử các phiên bản',
    noWillsTitle: 'Chưa có hồ sơ di chúc nào',
    noWillsDesc: 'Lưu giữ bản quét hoặc bản chụp di chúc của bạn để bảo toàn dữ liệu và đối chiếu toàn vẹn.',
    selectWillPrompt: 'Chọn một hồ sơ di chúc để xem chi tiết và các phiên bản đã lưu.',
    downloadBtn: 'Tải xuống',
    downloadingBtn: 'Đang tải tệp…',
    viewBtn: 'Mở xem',
    reauthModalTitle: 'Xác nhận mật khẩu để tải tệp',
    reauthModalTitleView: 'Xác nhận mật khẩu để mở xem tệp',
    reauthPrompt: 'Nhập lại mật khẩu đăng nhập hiện tại để tải phiên bản tệp:',
    reauthPromptView: 'Nhập lại mật khẩu đăng nhập hiện tại để mở xem phiên bản tệp:',
    passwordLabel: 'Mật khẩu đăng nhập hiện tại',
    passwordPlaceholder: 'Nhập mật khẩu đăng nhập hiện tại',
    confirmDownloadBtn: 'Xác nhận & Tải tệp',
    confirmViewBtn: 'Xác nhận & Mở xem',
    legalNoticeViewOnly: 'Lưu ý: Mở xem hoặc tải tệp phục vụ kiểm tra toàn vẹn kỹ thuật, không cấu thành việc di chúc đã được cơ quan pháp lý phê duyệt.',
    versionCol: 'Phiên bản',
    fileNameCol: 'Tên tệp gốc',
    formatCol: 'Định dạng',
    sizeCol: 'Dung lượng',
    hashCol: 'Mã băm SHA-256',
    dateCol: 'Thời gian tải lên',
    actionCol: 'Thao tác',
    refreshBtn: 'Làm mới',
    backToListBtn: 'Quay lại danh sách',
    errors: {
      BACKEND_NOT_READY: 'Chưa thể kết nối hồ sơ di chúc. Vui lòng thử lại sau.',
      UNAUTHENTICATED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      ACCESS_DENIED: 'Bạn không có quyền truy cập hồ sơ di chúc này.',
      RESOURCE_NOT_FOUND: 'Không tìm thấy kho hoặc hồ sơ di chúc.',
      UNAUTHORIZED: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.',
      FORBIDDEN: 'Bạn không có quyền thao tác với tài liệu trong kho này.',
      NOT_FOUND: 'Không tìm thấy hồ sơ di chúc.',
      VAULT_NOT_EDITABLE: 'Kho hiện không ở trạng thái cho phép cập nhật tài liệu.',
      PAYLOAD_TOO_LARGE: 'Tài liệu vượt quá dung lượng cho phép (tối đa 10 MB).',
      UNSUPPORTED_MEDIA_TYPE: 'Vui lòng chọn tài liệu PDF, JPEG hoặc PNG.',
      VALIDATION_FAILED: 'Dữ liệu không hợp lệ. Vui lòng kiểm tra lại.',
      CONFLICT: 'Xung đột trạng thái kho hoặc dữ liệu chưa sẵn sàng. Vui lòng thử lại sau.',
      ABORTED: 'Thao tác đã dừng.',
      TIMEOUT: 'Hết thời gian chờ phản hồi. Vui lòng kiểm tra lại kết nối.',
      REAUTH_FAILED: 'Mật khẩu xác nhận không chính xác. Vui lòng thử lại.',
      TOO_MANY_ATTEMPTS: 'Bạn đã thử xác nhận quá số lần cho phép. Vui lòng thử lại sau.',
      DOWNLOAD_FAILED: 'Không thể tải tệp di chúc. Vui lòng thử lại sau.',
    },
  },
  en: {
    title: 'Digitized Will Documents',
    intro: 'Store, verify integrity, and track version history of your will documents in your heritage vault.',
    formTitle: 'Initial will document',
    versionFormTitle: 'Upload new will version',
    formats: 'PDF, JPEG or PNG · Up to 10 MB',
    choose: 'Choose document',
    chooseHint: 'Choose a clear, complete photograph or scan.',
    remove: 'Remove file',
    progress: 'Upload progress',
    preparing: 'Preparing document…',
    sending: 'Sending document…',
    confirming: 'Confirming upload…',
    cancel: 'Cancel upload',
    another: 'Upload another document',
    saved: 'Document recorded',
    willListTitle: 'Will Records',
    uploadNewWillBtn: 'Upload New Will Document',
    uploadNewVersionBtn: 'Upload New Version',
    versionsHistoryTitle: 'Version History',
    noWillsTitle: 'No digitized wills found',
    noWillsDesc: 'Store scanned or photographed copies of your will to preserve records and track integrity.',
    selectWillPrompt: 'Select a will document to view details and version history.',
    downloadBtn: 'Download',
    downloadingBtn: 'Downloading…',
    viewBtn: 'Open View',
    reauthModalTitle: 'Verify Password to Download',
    reauthModalTitleView: 'Verify Password to Open Document',
    reauthPrompt: 'Re-enter your current login password to download version:',
    reauthPromptView: 'Re-enter your current login password to open version:',
    passwordLabel: 'Current login password',
    passwordPlaceholder: 'Enter your current login password',
    confirmDownloadBtn: 'Confirm & Download',
    confirmViewBtn: 'Confirm & Open View',
    legalNoticeViewOnly: 'Note: Viewing or downloading files is for technical integrity verification and does not constitute formal legal verification.',
    versionCol: 'Version',
    fileNameCol: 'Original File',
    formatCol: 'Format',
    sizeCol: 'Size',
    hashCol: 'SHA-256 Hash',
    dateCol: 'Uploaded At',
    actionCol: 'Actions',
    refreshBtn: 'Refresh',
    backToListBtn: 'Back to records',
    errors: {
      BACKEND_NOT_READY: 'Will records cannot be reached yet. Please try again later.',
      UNAUTHENTICATED: 'Your session has expired. Please sign in again.',
      ACCESS_DENIED: 'You do not have permission to access these records.',
      RESOURCE_NOT_FOUND: 'Will document or vault not found.',
      UNAUTHORIZED: 'Your session has expired. Please sign in again.',
      FORBIDDEN: 'You do not have permission to modify records in this vault.',
      NOT_FOUND: 'Heritage will document not found.',
      VAULT_NOT_EDITABLE: 'This vault currently does not accept document updates.',
      PAYLOAD_TOO_LARGE: 'The document is too large (max 10 MB).',
      UNSUPPORTED_MEDIA_TYPE: 'Please select a PDF, JPEG or PNG document.',
      VALIDATION_FAILED: 'Invalid document or details provided.',
      CONFLICT: 'Vault state conflict or data not ready. Please try again later.',
      ABORTED: 'Operation aborted.',
      TIMEOUT: 'Request timed out. Please check your connection.',
      REAUTH_FAILED: 'Incorrect verification password. Please try again.',
      TOO_MANY_ATTEMPTS: 'Too many attempts. Please try again later.',
      DOWNLOAD_FAILED: 'Failed to download will file. Please try again later.',
    },
  },
};

const formatNames = { 'application/pdf': 'PDF', 'image/jpeg': 'JPEG', 'image/png': 'PNG' };

export default function WillUploadPage({ lang = 'vi', vaultId, accessToken, onUnauthorized, onRefreshTrigger }) {
  const language = lang === 'en' ? 'en' : 'vi';
  const t = copy[language];
  const messages = willStatusMessages[language];

  // List state
  const [wills, setWills] = useState([]);
  const [selectedWillId, setSelectedWillId] = useState(null);
  const [versions, setVersions] = useState([]);
  const [versionsError, setVersionsError] = useState(null);
  const [versionsReload, setVersionsReload] = useState(0);
  const [isLoadingWills, setIsLoadingWills] = useState(true);
  const [isLoadingVersions, setIsLoadingVersions] = useState(false);
  const [listError, setListError] = useState(null);

  // Modals state
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [isVersionModalOpen, setIsVersionModalOpen] = useState(false);
  const [downloadTarget, setDownloadTarget] = useState(null); // { willId, version, fileName, mode: 'download' | 'view' }

  // Fetch Wills List
  const loadWills = useCallback(async () => {
    setVersions([]);
    setVersionsError(null);
    setVersionsReload(value => value + 1);
    setIsLoadingWills(true);
    setListError(null);
    try {
      const data = await willService.getWills(vaultId, { lang: language, accessToken });
      setWills(data.content || []);
      setSelectedWillId(current => data.content?.some(will => will.id === current) ? current : (data.content?.[0]?.id ?? null));
    } catch (err) {
      if (err.status === 401) {
        onUnauthorized?.();
        return;
      }
      setListError(err.code || 'BACKEND_NOT_READY');
    } finally {
      setIsLoadingWills(false);
    }
  }, [vaultId, language, accessToken, onUnauthorized]);

  useEffect(() => {
    let active = true;
    async function init() {
      await Promise.resolve();
      if (!active) return;
      loadWills();
    }
    init();
    return () => {
      active = false;
    };
  }, [loadWills, onRefreshTrigger]);

  // Reload history after uploads, local refresh and external refresh.
  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    async function fetchVersions() {
      await Promise.resolve();
      if (!active) return;
      setVersions([]);
      setVersionsError(null);
      setIsLoadingVersions(Boolean(selectedWillId));
      if (!selectedWillId) return;
      try {
        const data = await willService.listWillVersions(vaultId, selectedWillId, {
          lang: language, accessToken, signal: controller.signal,
        });
        if (active) setVersions(data || []);
      } catch (err) {
        if (!active || controller.signal.aborted) return;
        if (err.status === 401) { onUnauthorized?.(); return; }
        setVersionsError(err.code || 'BACKEND_NOT_READY');
      } finally {
        if (active) setIsLoadingVersions(false);
      }
    }
    fetchVersions();
    return () => { active = false; controller.abort(); };
  }, [vaultId, selectedWillId, language, accessToken, onUnauthorized, versionsReload, onRefreshTrigger]);

  const selectedWill = wills.find((w) => w.id === selectedWillId);

  return (
    <section className="hn-will-page" aria-labelledby="will-title">
      {/* Header */}
      <div className="hn-will-intro">
        <h1 id="will-title">{t.title}</h1>
        <p>{t.intro}</p>
      </div>

      {/* Legal Notice Callout */}
      <aside className="hn-will-notice" aria-label={messages.NOTICE_TITLE}>
        <span aria-hidden="true">ⓘ</span>
        <div>
          <strong>{messages.NOTICE_TITLE}</strong>
          <p>{messages.NOTICE_CONTENT}</p>
        </div>
      </aside>

      {/* Actions Bar */}
      <div className="hn-will-header-actions">
        <Button
          variant="primary"
          onClick={() => setIsCreateModalOpen(true)}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}
        >
          <Plus size={16} />
          <span>{t.uploadNewWillBtn}</span>
        </Button>
        <Button
          variant="secondary"
          onClick={loadWills}
          disabled={isLoadingWills}
          style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={isLoadingWills ? 'hn-will-spin' : ''} />
          <span>{t.refreshBtn}</span>
        </Button>
      </div>

      {/* Main Content Area */}
      {isLoadingWills ? (
        <div className="hn-will-card hn-will-loading-card" role="status" aria-live="polite" aria-busy="true">
          <p>{language === 'en' ? 'Loading will documents…' : 'Đang tải hồ sơ di chúc…'}</p>
          <div className="hn-will-skeleton-row" aria-hidden="true" /><div className="hn-will-skeleton-row" aria-hidden="true" />
        </div>
      ) : listError ? (
        <div className="hn-will-card hn-will-error-panel" role="alert">
          <p className="hn-will-error">{t.errors[listError] || t.errors.BACKEND_NOT_READY}</p>
          <Button variant="secondary" onClick={loadWills}>
            {t.refreshBtn}
          </Button>
        </div>
      ) : wills.length === 0 ? (
        /* Empty State */
        <div className="hn-will-card hn-will-empty-card">
          <div className="hn-will-document-icon" style={{ margin: '0 auto 16px' }}>
            <FileText size={24} />
          </div>
          <h2>{t.noWillsTitle}</h2>
          <p className="hn-will-formats">{t.noWillsDesc}</p>
          <Button variant="primary" onClick={() => setIsCreateModalOpen(true)}>
            <Plus size={16} />
            <span>{t.uploadNewWillBtn}</span>
          </Button>
        </div>
      ) : (
        /* Wills Management Workspace */
        <div className="hn-will-workspace">
          {/* Will Document Overview & Version History */}
          {selectedWill && (
            <div className="hn-will-card" style={{ marginBottom: '24px' }}>
              <div className="hn-will-detail-header">
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <h2>{selectedWill.currentVersion?.fileName || 'Hồ sơ di chúc'}</h2>
                    <span className="hn-will-status">{messages.UPLOADED}</span>
                    <span className="hn-will-version-badge">
                      v{selectedWill.currentVersion?.version || 1}
                    </span>
                  </div>
                  <p style={{ margin: '6px 0 0', fontSize: '13px', color: '#68736b' }}>
                    {messages.CREATED_AT_LABEL}: {formatDateTime(selectedWill.createdAt, language)} · {messages.FILE_SIZE_LABEL}: {formatFileSize(selectedWill.currentVersion?.sizeBytes)}
                  </p>
                </div>
                <Button
                  variant="primary"
                  onClick={() => setIsVersionModalOpen(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}
                >
                  <UploadCloud size={16} />
                  <span>{t.uploadNewVersionBtn}</span>
                </Button>
              </div>

              {/* Version History Table */}
              <h3 style={{ margin: '24px 0 12px', fontSize: '17px', color: '#164639' }}>
                {t.versionsHistoryTitle}
              </h3>
              {isLoadingVersions ? (
                <p role="status" style={{ fontSize: '13px', color: '#68736b' }}>{language === 'en' ? 'Loading version history…' : 'Đang tải lịch sử phiên bản…'}</p>
              ) : versionsError ? (
                <div role="alert">
                  <p className="hn-will-error">{t.errors[versionsError] || t.errors.BACKEND_NOT_READY}</p>
                  <Button variant="secondary" onClick={loadWills}>{t.refreshBtn}</Button>
                </div>
              ) : (
                <div className="hn-will-table-wrap">
                  <table className="hn-will-table" aria-label={t.versionsHistoryTitle}>
                    <thead>
                      <tr>
                        <th scope="col">{t.versionCol}</th>
                        <th scope="col">{t.fileNameCol}</th>
                        <th scope="col">{t.formatCol}</th>
                        <th scope="col">{t.sizeCol}</th>
                        <th scope="col">{t.dateCol}</th>
                        <th scope="col">{t.hashCol}</th>
                        <th scope="col" style={{ textAlign: 'right' }}>{t.actionCol}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {versions.map((ver) => (
                        <tr key={ver.version}>
                          <td data-label={t.versionCol}>
                            <span className="hn-will-version-badge">v{ver.version}</span>
                          </td>
                          <td data-label={t.fileNameCol} style={{ fontWeight: 600 }}>{ver.fileName}</td>
                          <td data-label={t.formatCol}>{formatNames[ver.contentType] || ver.contentType}</td>
                          <td data-label={t.sizeCol}>{formatFileSize(ver.sizeBytes)}</td>
                          <td data-label={t.dateCol} style={{ fontSize: '12.5px', color: '#68736b' }}>
                            {formatDateTime(ver.uploadedAt, language)}
                          </td>
                          <td data-label={t.hashCol}>
                            <code className="hn-will-hash-inline" title={ver.sha256}>
                              {ver.sha256.slice(0, 10)}…{ver.sha256.slice(-8)}
                            </code>
                          </td>
                          <td data-label={t.actionCol} style={{ textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  setDownloadTarget({
                                    willId: selectedWill.id,
                                    version: ver.version,
                                    fileName: ver.fileName,
                                    mode: 'view',
                                  })
                                }
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', fontSize: '12.5px' }}
                              >
                                <Eye size={13} />
                                <span>{t.viewBtn}</span>
                              </Button>
                              <Button
                                variant="secondary"
                                onClick={() =>
                                  setDownloadTarget({
                                    willId: selectedWill.id,
                                    version: ver.version,
                                    fileName: ver.fileName,
                                    mode: 'download',
                                  })
                                }
                                style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', padding: '6px 10px', fontSize: '12.5px' }}
                              >
                                <Download size={13} />
                                <span>{t.downloadBtn}</span>
                              </Button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Modal: Create Initial Will Record */}
      {isCreateModalOpen && (
        <CreateWillModal
          lang={language}
          t={t}
          messages={messages}
          vaultId={vaultId}
          accessToken={accessToken}
          onUnauthorized={onUnauthorized}
          onClose={() => setIsCreateModalOpen(false)}
          onSuccess={(created) => {
            setIsCreateModalOpen(false);
            loadWills();
            if (created?.id) setSelectedWillId(created.id);
          }}
        />
      )}

      {/* Modal: Upload New Version */}
      {isVersionModalOpen && selectedWill && (
        <UploadVersionModal
          lang={language}
          t={t}
          messages={messages}
          vaultId={vaultId}
          willId={selectedWill.id}
          currentVersionNumber={Math.max(
            selectedWill.currentVersion?.version || 1,
            ...versions.map((v) => v.version || 1)
          )}
          accessToken={accessToken}
          onUnauthorized={onUnauthorized}
          onClose={() => setIsVersionModalOpen(false)}
          onSuccess={() => {
            setIsVersionModalOpen(false);
            loadWills();
          }}
        />
      )}

      {/* Modal: Download / Open Reauthentication */}
      {downloadTarget && (
        <DownloadReauthModal
          lang={language}
          t={t}
          vaultId={vaultId}
          willId={downloadTarget.willId}
          version={downloadTarget.version}
          fileName={downloadTarget.fileName}
          mode={downloadTarget.mode || 'download'}
          accessToken={accessToken}
          onUnauthorized={onUnauthorized}
          onClose={() => setDownloadTarget(null)}
        />
      )}
    </section>
  );
}

// -----------------------------------------------------------------------------
// Sub-component: CreateWillModal (Initial Version 1)
// -----------------------------------------------------------------------------
function CreateWillModal({ lang, t, messages, vaultId, accessToken, onUnauthorized, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [note, setNote] = useState('');
  const [errors, setErrors] = useState({});
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const inputRef = useRef(null);
  const requestRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      pendingRef.current = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (pendingRef.current) return;
    const nextErrors = getWillUploadErrors({ file, note });
    setErrors(nextErrors);
    setErrorCode(null);
    if (Object.keys(nextErrors).length) return;

    pendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setProgress(0);

    try {
      const receipt = await willService.uploadWill(vaultId, file, note, {
        lang,
        accessToken,
        signal: controller.signal,
        onProgress: (val) => setProgress(val),
      });
      onSuccess(receipt);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) {
        onUnauthorized?.();
        return;
      }
      setErrorCode(error?.code || 'UPLOAD_FAILED');
      if (error?.fieldErrors) setErrors(error.fieldErrors);
    } finally {
      pendingRef.current = false;
      requestRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="hn-will-modal-backdrop" onClick={onClose} role="presentation">
      <div className="hn-will-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="hn-will-modal-header">
          <h2>{t.formTitle}</h2>
          <button type="button" className="hn-will-modal-close" onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <p className="hn-will-formats">{t.formats}</p>

          <input
            className="hn-will-file-input"
            id="modal-will-file"
            type="file"
            ref={inputRef}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setErrors((old) => ({ ...old, file: null }));
              setErrorCode(null);
            }}
          />

          <button className="hn-will-picker" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <span className="hn-will-document-icon" aria-hidden="true">↑</span>
            <strong>{t.choose}</strong>
            <span>{t.chooseHint}</span>
          </button>

          {file && (
            <div className="hn-will-selected">
              <div>
                <strong>{file.name}</strong>
                <span>{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                {t.remove}
              </button>
            </div>
          )}

          {errors.file && (
            <p className="hn-will-error" role="alert">
              {willValidationMessages[lang][errors.file] || errors.file}
            </p>
          )}

          <label className="hn-will-label hn-will-note-label" htmlFor="modal-will-note">
            {messages.NOTE_LABEL}
            <span>{note.length}/{MAX_NOTE_LENGTH}</span>
          </label>
          <textarea
            id="modal-will-note"
            value={note}
            rows={3}
            maxLength={MAX_NOTE_LENGTH}
            disabled={busy}
            placeholder={messages.NOTE_PLACEHOLDER}
            onChange={(e) => setNote(e.target.value)}
          />

          {errorCode && (
            <p className="hn-will-error hn-will-error-panel" role="alert">
              {t.errors[errorCode] || messages.UPLOAD_FAILED}
            </p>
          )}

          {busy && (
            <div className="hn-will-progress" role="status">
              <div>
                {progress === 0 ? t.preparing : progress >= 99 ? t.confirming : t.sending}
                {progress != null && <span>{progress}%</span>}
              </div>
              <progress max={100} value={progress == null ? undefined : progress} />
            </div>
          )}

          <div className="hn-will-actions" style={{ marginTop: '20px' }}>
            <Button variant="primary" type="submit" disabled={busy || !file}>
              {busy ? messages.UPLOADING_BTN : messages.UPLOAD_BTN}
            </Button>
            <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-component: UploadVersionModal (Version > 1)
// -----------------------------------------------------------------------------
function UploadVersionModal({ lang, t, messages, vaultId, willId, currentVersionNumber, accessToken, onUnauthorized, onClose, onSuccess }) {
  const [file, setFile] = useState(null);
  const [errors, setErrors] = useState({});
  const [errorCode, setErrorCode] = useState(null);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(0);

  const inputRef = useRef(null);
  const requestRef = useRef(null);
  const pendingRef = useRef(false);

  useEffect(() => {
    return () => {
      requestRef.current?.abort();
      pendingRef.current = false;
    };
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    if (pendingRef.current) return;
    const nextErrors = getWillUploadErrors({ file });
    setErrors(nextErrors);
    setErrorCode(null);
    if (Object.keys(nextErrors).length) return;

    pendingRef.current = true;
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setProgress(0);

    try {
      const receipt = await willService.uploadNewVersion(vaultId, willId, file, {
        lang,
        accessToken,
        signal: controller.signal,
        minVersion: currentVersionNumber + 1,
        onProgress: (val) => setProgress(val),
      });
      onSuccess(receipt);
    } catch (error) {
      if (controller.signal.aborted) return;
      if (error.status === 401) {
        onUnauthorized?.();
        return;
      }
      if (error?.code === 'VAULT_NOT_EDITABLE' || error?.status === 409) {
        setErrorCode('VAULT_NOT_EDITABLE');
        return;
      }
      setErrorCode(error?.code || 'UPLOAD_FAILED');
      if (error?.fieldErrors) setErrors(error.fieldErrors);
    } finally {
      pendingRef.current = false;
      requestRef.current = null;
      setBusy(false);
    }
  }

  return (
    <div className="hn-will-modal-backdrop" onClick={onClose} role="presentation">
      <div className="hn-will-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="hn-will-modal-header">
          <h2>{t.versionFormTitle} (v{currentVersionNumber + 1})</h2>
          <button type="button" className="hn-will-modal-close" onClick={onClose} disabled={busy} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate>
          <p className="hn-will-formats">{t.formats}</p>

          <input
            className="hn-will-file-input"
            id="modal-version-file"
            type="file"
            ref={inputRef}
            accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
            disabled={busy}
            onChange={(e) => {
              setFile(e.target.files?.[0] || null);
              setErrors({});
              setErrorCode(null);
            }}
          />

          <button className="hn-will-picker" type="button" disabled={busy} onClick={() => inputRef.current?.click()}>
            <span className="hn-will-document-icon" aria-hidden="true">↑</span>
            <strong>{t.choose}</strong>
            <span>{t.chooseHint}</span>
          </button>

          {file && (
            <div className="hn-will-selected">
              <div>
                <strong>{file.name}</strong>
                <span>{formatFileSize(file.size)}</span>
              </div>
              <button
                type="button"
                disabled={busy}
                onClick={() => {
                  setFile(null);
                  if (inputRef.current) inputRef.current.value = '';
                }}
              >
                {t.remove}
              </button>
            </div>
          )}

          {errors.file && (
            <p className="hn-will-error" role="alert">
              {willValidationMessages[lang][errors.file] || errors.file}
            </p>
          )}

          {errorCode && (
            <p className="hn-will-error hn-will-error-panel" role="alert">
              {t.errors[errorCode] || messages.UPLOAD_FAILED}
            </p>
          )}

          {busy && (
            <div className="hn-will-progress" role="status">
              <div>
                {progress === 0 ? t.preparing : progress >= 99 ? t.confirming : t.sending}
                {progress != null && <span>{progress}%</span>}
              </div>
              <progress max={100} value={progress == null ? undefined : progress} />
            </div>
          )}

          <div className="hn-will-actions" style={{ marginTop: '20px' }}>
            <Button variant="primary" type="submit" disabled={busy || !file}>
              {busy ? messages.UPLOADING_BTN : t.uploadNewVersionBtn}
            </Button>
            <Button variant="secondary" type="button" disabled={busy} onClick={onClose}>
              {t.cancel}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// Sub-component: DownloadReauthModal (Binary Download via Password Reauth)
// -----------------------------------------------------------------------------
function DownloadReauthModal({ lang, t, vaultId, willId, version, fileName, mode = 'download', accessToken, onUnauthorized, onClose }) {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorKey, setErrorKey] = useState(null);

  const abortRef = useRef(null);
  const pendingRef = useRef(false);
  const activeContextRef = useRef({ willId, version, vaultId, accessToken });

  const cleanup = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    pendingRef.current = false;
    setPassword('');
    setErrorKey(null);
  }, []);

  useEffect(() => {
    activeContextRef.current = { willId, version, vaultId, accessToken };
    return cleanup;
  }, [cleanup, willId, version, vaultId, accessToken]);

  const handleClose = () => {
    cleanup();
    onClose();
  };

  async function handleConfirm(e) {
    e.preventDefault();
    if (pendingRef.current || isSubmitting) return;
    const submittedPassword = password;
    if (!submittedPassword) {
      setErrorKey('VALIDATION_FAILED');
      return;
    }

    pendingRef.current = true;
    setIsSubmitting(true);
    setErrorKey(null);
    const controller = new AbortController();
    abortRef.current = controller;
    const requestContext = { willId, version, vaultId, accessToken };

    try {
      const result = await willService.downloadWillVersion(vaultId, willId, version, submittedPassword, {
        lang,
        accessToken,
        signal: controller.signal,
      });

      const isCurrent =
        !controller.signal.aborted &&
        activeContextRef.current.willId === requestContext.willId &&
        activeContextRef.current.version === requestContext.version &&
        activeContextRef.current.vaultId === requestContext.vaultId &&
        activeContextRef.current.accessToken === requestContext.accessToken;

      if (isCurrent) {
        if (mode === 'view') {
          openBlobPreview(result.blob);
        } else {
          downloadBlobFile(result.blob, result.fileName || fileName || `will-version-${version}`);
        }
        handleClose();
      }
    } catch (err) {
      const isCurrent =
        !controller.signal.aborted &&
        activeContextRef.current.willId === requestContext.willId &&
        activeContextRef.current.version === requestContext.version &&
        activeContextRef.current.vaultId === requestContext.vaultId &&
        activeContextRef.current.accessToken === requestContext.accessToken;

      if (!isCurrent) return;
      setPassword(''); // Clear password immediately upon failure
      if (err.status === 401) {
        handleClose();
        onUnauthorized?.();
        return;
      }
      if (err.code === 'REAUTH_FAILED') {
        setErrorKey('REAUTH_FAILED');
      } else if (err.code === 'FORBIDDEN' || err.code === 'ACCESS_DENIED' || (err.status === 403 && err.code !== 'REAUTH_FAILED')) {
        setErrorKey('FORBIDDEN');
      } else if (err.code === 'TOO_MANY_ATTEMPTS' || err.status === 429) {
        setErrorKey('TOO_MANY_ATTEMPTS');
      } else if (err.code === 'VAULT_NOT_EDITABLE' || err.status === 409) {
        setErrorKey('VAULT_NOT_EDITABLE');
      } else if (err.status === 404) {
        setErrorKey('RESOURCE_NOT_FOUND');
      } else {
        setErrorKey(err.code || 'DOWNLOAD_FAILED');
      }
    } finally {
      pendingRef.current = false;
      setIsSubmitting(false);
      abortRef.current = null;
    }
  }

  const isView = mode === 'view';

  return (
    <div className="hn-will-modal-backdrop" onClick={handleClose} role="presentation">
      <div className="hn-will-modal-card" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" style={{ maxWidth: '440px' }}>
        <div className="hn-will-modal-header">
          <h2>{isView ? t.reauthModalTitleView : t.reauthModalTitle}</h2>
          <button type="button" className="hn-will-modal-close" onClick={handleClose} disabled={isSubmitting} aria-label="Đóng">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleConfirm} noValidate>
          <p style={{ fontSize: '13.5px', color: '#68736b', margin: '0 0 16px', lineHeight: 1.6 }}>
            {isView ? t.reauthPromptView : t.reauthPrompt} <strong>v{version}</strong> ({fileName})
          </p>

          <label className="hn-will-label" htmlFor="download-reauth-password">
            {t.passwordLabel} <span aria-hidden="true">*</span>
          </label>

          <div style={{ position: 'relative', marginBottom: '14px' }}>
            <input
              id="download-reauth-password"
              type={showPassword ? 'text' : 'password'}
              maxLength={72}
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (errorKey) setErrorKey(null);
              }}
              placeholder={t.passwordPlaceholder}
              disabled={isSubmitting}
              autoFocus
              style={{
                width: '100%',
                boxSizing: 'border-box',
                padding: '11px 40px 11px 14px',
                border: '1px solid #dce2da',
                borderRadius: '10px',
                fontSize: '14px',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="button"
              onClick={() => setShowPassword((prev) => !prev)}
              tabIndex={-1}
              aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#68736b',
                cursor: 'pointer',
                padding: '4px',
                display: 'grid',
                placeItems: 'center',
              }}
            >
              {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </div>

          {errorKey && (
            <p className="hn-will-error hn-will-error-panel" role="alert" style={{ margin: '0 0 16px', padding: '10px 14px' }}>
              <AlertCircle size={14} style={{ display: 'inline', marginRight: '6px', verticalAlign: 'middle' }} />
              <span>{t.errors[errorKey] || t.errors.DOWNLOAD_FAILED}</span>
            </p>
          )}

          <div className="hn-will-actions">
            <Button variant="primary" type="submit" disabled={isSubmitting || !password}>
              {isSubmitting ? t.downloadingBtn : (isView ? t.confirmViewBtn : t.confirmDownloadBtn)}
            </Button>
            <Button variant="secondary" type="button" disabled={isSubmitting} onClick={handleClose}>
              {t.cancel}
            </Button>
          </div>

          <p style={{ fontSize: '12px', color: '#889085', marginTop: '16px', marginBottom: 0, lineHeight: 1.5, borderTop: '1px solid #f0f3ee', paddingTop: '10px' }}>
            {t.legalNoticeViewOnly}
          </p>
        </form>
      </div>
    </div>
  );
}
