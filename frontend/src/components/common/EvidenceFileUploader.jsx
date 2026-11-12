import { useState, useRef, useId } from 'react';
import {
  UploadCloud,
  X,
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

/**
 * Ô tải tệp chứng cứ (giấy tờ) cho nhân viên/pháp lý: vùng kéo-thả hoặc bấm chọn một tệp, kiểm tra bằng {@code validateEvidenceFile} ({@code utils/staffEvidenceUpload.js}; loại và dung lượng cho phép),
 * hiển thị bảng tên/dung lượng, nút bỏ tệp, thanh tiến trình theo pha (uploading, processing, success) và thông báo lỗi. Không tự gọi API: việc tải lên do component cha thực hiện, cha truyền {@code uploadProgress}.
 *
 * @param {object} props
 * @param {File} [props.file] Tệp đang chọn.
 * @param {(file:(File|null))=>void} props.onFileChange Gọi khi chọn hoặc bỏ tệp (null khi không hợp lệ).
 * @param {{phase:string,percent?:number,loaded?:number,total?:number}} [props.uploadProgress]
 * @param {string} [props.error] Lỗi từ cha.
 * @param {boolean} [props.disabled=false]
 * @param {string} [props.lang='vi']
 * @param {boolean} [props.required=true]
 * @param {string} [props.label]
 * @param {string} [props.hint]
 * @param {string} [props.idPrefix='evidence-file']
 */
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

  /**
   * Kiểm tra tệp được chọn/thả; hợp lệ thì gọi {@code onFileChange(file)}, sai thì lưu lỗi cục bộ và gọi {@code onFileChange(null)}.
   */
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

  /**
   * Xử lý chọn tệp từ hộp thoại hệ thống rồi xóa giá trị input để cho phép chọn lại cùng tệp.
   */
  const handleInputChange = (e) => {
    const selected = e.target.files?.[0] || null;
    handleSelectFile(selected);
    e.target.value = '';
  };

  /**
   * Bật trạng thái kéo-thả khi tệp được kéo qua vùng thả.
   */
  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) setIsDragging(true);
  };

  /**
   * Tắt trạng thái kéo-thả khi rời vùng thả.
   */
  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  /**
   * Nhận tệp thả vào vùng thả (tệp đầu tiên) và kiểm tra.
   */
  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    if (disabled) return;

    const droppedFile = e.dataTransfer.files?.[0] || null;
    handleSelectFile(droppedFile);
  };

  /**
   * Bỏ tệp đang chọn và đặt lại input.
   */
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
          <table className="lv-evidence-file-table">
            <thead>
              <tr>
                <th scope="col">{t.fileNameColumn}</th>
                <th scope="col">{t.fileSizeColumn}</th>
                <th scope="col">{t.fileActionColumn}</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="lv-evidence-file-table__name">{file.name}</td>
                <td className="lv-evidence-file-table__size">{formatFileSize(file.size, lang)}</td>
                <td>
                  {!disabled && !isUploading && !isProcessing && (
                    <button type="button" className="lv-evidence-btn-remove" onClick={handleRemoveFile}>
                      <X size={16} aria-hidden="true" />
                      <span>{t.removeFile}</span>
                    </button>
                  )}
                </td>
              </tr>
            </tbody>
          </table>

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
