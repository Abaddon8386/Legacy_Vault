import { useState, useEffect, useRef, useId } from 'react';
import {
  UploadCloud,
  FileText,
  FileImage,
  X,
  RefreshCw,
  CheckCircle2,
  Loader2,
} from 'lucide-react';
import {
  validateEvidenceFile,
  formatFileSize,
  EVIDENCE_UPLOAD_I18N,
  ALLOWED_EVIDENCE_EXTENSIONS,
} from '../../utils/staffEvidenceUpload.js';
import './EvidenceFileUploader.css';
import FeedbackNotice from './FeedbackNotice.jsx';

function EvidenceThumbnail({ file, alt }) {
  const [objectUrl, setObjectUrl] = useState(null);

  useEffect(() => {
    if (!file) {
      return;
    }

    const isImage = file.type?.startsWith('image/') || file.name?.match(/\.(jpe?g|png)$/i);
    if (!isImage) {
      return;
    }

    let active = true;
    let url = null;

    try {
      url = URL.createObjectURL(file);
      Promise.resolve().then(() => {
        if (active) {
          setObjectUrl(url);
        }
      });
    } catch {
      url = null;
    }

    return () => {
      active = false;
      if (url) {
        URL.revokeObjectURL(url);
      }
    };
  }, [file]);

  if (!objectUrl) {
    return null;
  }

  return <img src={objectUrl} alt={alt} className="lv-evidence-preview-card__img" />;
}

export default function EvidenceFileUploader({
  file = null,
  onFileChange,
  uploadProgress = null, // { phase: 'idle'|'uploading'|'processing'|'success'|'error', percent, loaded, total, indeterminate }
  error = null,
  disabled = false,
  lang = 'vi',
  required = true,
  label = null,
  hint = null,
  idPrefix = 'evidence-file',
}) {
  const t = EVIDENCE_UPLOAD_I18N[lang] || EVIDENCE_UPLOAD_I18N.vi;
  const generatedId = useId();
  const inputId = `${idPrefix}-${generatedId}`;

  const [localError, setLocalError] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef(null);

  const handleSelectFile = (candidateFile) => {
    setLocalError(null);
    if (!candidateFile) return;

    const validation = validateEvidenceFile(candidateFile, lang);
    if (!validation.isValid) {
      setLocalError(validation.errorMessage);
      if (onFileChange) onFileChange(null);
      return;
    }

    if (onFileChange) {
      onFileChange(candidateFile);
    }
  };

  const handleInputChange = (e) => {
    const selected = e.target.files?.[0] || null;
    handleSelectFile(selected);
    e.target.value = '';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const droppedFile = e.dataTransfer.files?.[0] || null;
    handleSelectFile(droppedFile);
  };

  const handleRemoveFile = () => {
    if (disabled) return;
    setLocalError(null);
    if (onFileChange) {
      onFileChange(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const activeError = localError || error;
  const isUploading = uploadProgress?.phase === 'uploading';
  const isProcessing = uploadProgress?.phase === 'processing';
  const isSuccess = uploadProgress?.phase === 'success';

  const isPdf = file?.type === 'application/pdf' || file?.name?.toLowerCase().endsWith('.pdf');
  const isImageCandidate = file && (file.type?.startsWith('image/') || file.name?.match(/\.(jpe?g|png)$/i));

  return (
    <div className={`lv-evidence-uploader ${disabled ? 'lv-evidence-uploader--disabled' : ''}`}>
      {label && (
        <label htmlFor={inputId} className="lv-evidence-uploader__label">
          <span>{label}</span>
          {required && <span className="lv-evidence-uploader__required-mark">*</span>}
        </label>
      )}

      {hint && <p className="lv-evidence-uploader__hint">{hint}</p>}

      <input
        ref={fileInputRef}
        id={inputId}
        type="file"
        accept={ALLOWED_EVIDENCE_EXTENSIONS.join(',')}
        onChange={handleInputChange}
        disabled={disabled || isUploading || isProcessing}
        className="lv-evidence-uploader__input"
        aria-describedby={activeError ? `${inputId}-error` : undefined}
        aria-required={required}
      />

      {/* Dropzone khi chưa chọn file */}
      {!file && (
        <div
          className={`lv-evidence-dropzone ${isDragging ? 'lv-evidence-dropzone--active' : ''} ${activeError ? 'lv-evidence-dropzone--error' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => {
            if (!disabled && fileInputRef.current) fileInputRef.current.click();
          }}
          role="button"
          tabIndex={disabled ? -1 : 0}
          onKeyDown={(e) => {
            if (!disabled && (e.key === 'Enter' || e.key === ' ')) {
              e.preventDefault();
              fileInputRef.current?.click();
            }
          }}
          aria-label={t.dropzoneIdle}
        >
          <div className="lv-evidence-dropzone__icon-wrap">
            <UploadCloud size={32} className="lv-evidence-dropzone__icon" aria-hidden="true" />
          </div>
          <div className="lv-evidence-dropzone__text">
            <span className="lv-evidence-dropzone__title">{t.dropzoneIdle}</span>
            <span className="lv-evidence-dropzone__sub">{t.dropzoneHint}</span>
          </div>
        </div>
      )}

      {/* Hiển thị tệp đã chọn và bản xem trước */}
      {file && (
        <div className="lv-evidence-preview-card">
          <div className="lv-evidence-preview-card__main">
            {/* Thumbnail preview */}
            <div className="lv-evidence-preview-card__thumbnail">
              {isImageCandidate && (
                <EvidenceThumbnail file={file} alt={t.previewImageAlt} />
              )}
              {isPdf && (
                <div className="lv-evidence-preview-card__pdf-badge">
                  <FileText size={28} className="lv-evidence-preview-card__pdf-icon" aria-hidden="true" />
                  <span className="lv-evidence-preview-card__pdf-label">PDF</span>
                </div>
              )}
              {!isImageCandidate && !isPdf && (
                <div className="lv-evidence-preview-card__doc-badge">
                  <FileImage size={28} aria-hidden="true" />
                </div>
              )}
            </div>

            {/* Chi tiết file */}
            <div className="lv-evidence-preview-card__info">
              <span className="lv-evidence-preview-card__name" title={file.name}>
                {file.name}
              </span>
              <div className="lv-evidence-preview-card__meta">
                <span className="lv-evidence-preview-card__size">
                  {formatFileSize(file.size, lang)}
                </span>
                <span className="lv-evidence-preview-card__dot">•</span>
                <span className="lv-evidence-preview-card__type">
                  {isPdf ? t.previewPdf : file.type || 'Binary'}
                </span>
              </div>
            </div>

            {/* Nút hành động */}
            {!disabled && !isUploading && !isProcessing && (
              <div className="lv-evidence-preview-card__actions">
                <button
                  type="button"
                  className="lv-evidence-btn-change"
                  onClick={() => fileInputRef.current?.click()}
                  title={t.changeFile}
                  aria-label={t.changeFile}
                >
                  <RefreshCw size={14} aria-hidden="true" />
                  <span>{t.changeFile}</span>
                </button>
                <button
                  type="button"
                  className="lv-evidence-btn-remove"
                  onClick={handleRemoveFile}
                  title={t.removeFile}
                  aria-label={t.removeFile}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            )}
          </div>

          {/* Thanh tiến trình */}
          {(isUploading || isProcessing || isSuccess) && (
            <div className="lv-evidence-progress-area">
              <div className="lv-evidence-progress-bar-wrap">
                <div
                  className={`lv-evidence-progress-bar ${isProcessing ? 'lv-evidence-progress-bar--indeterminate' : ''} ${isSuccess ? 'lv-evidence-progress-bar--success' : ''}`}
                  style={{
                    width: isProcessing ? '100%' : `${uploadProgress?.percent || 0}%`,
                  }}
                  role="progressbar"
                  aria-valuenow={isProcessing ? undefined : uploadProgress?.percent || 0}
                  aria-valuemin={0}
                  aria-valuemax={100}
                />
              </div>

              <div className="lv-evidence-progress-status">
                {isUploading && (
                  <div className="lv-evidence-progress-label">
                    <span>{t.uploading}</span>
                    <span className="lv-evidence-progress-percent">
                      {uploadProgress?.percent || 0}% ({formatFileSize(uploadProgress?.loaded || 0, lang)} / {formatFileSize(uploadProgress?.total || file.size, lang)})
                    </span>
                  </div>
                )}
                {isProcessing && (
                  <div className="lv-evidence-progress-label lv-evidence-progress-label--processing">
                    <Loader2 size={14} className="lv-evidence-spin-icon" aria-hidden="true" />
                    <span>{t.processing}</span>
                  </div>
                )}
                {isSuccess && (
                  <div className="lv-evidence-progress-label lv-evidence-progress-label--success">
                    <CheckCircle2 size={14} aria-hidden="true" />
                    <span>{t.uploadSuccess}</span>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Thông báo lỗi */}
      {activeError && (
        <FeedbackNotice id={`${inputId}-error`} tone="error">{activeError}</FeedbackNotice>
      )}
    </div>
  );
}
