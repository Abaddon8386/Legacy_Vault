import { useEffect } from 'react';
import { Download, X, FileText } from 'lucide-react';
import { useModalFocus } from './useModalFocus.js';
import { Button } from './Button.jsx';
import ZoomableImage from './ZoomableImage.jsx';
import './EvidencePreviewModal.css';

/**
 * Hộp thoại xem trước tệp chứng cứ từ blob/URL: PDF hiển thị trong iframe, ảnh JPEG/PNG qua {@code ZoomableImage}, định dạng khác chỉ cho tải về. Có nút tải về và đóng.
 * URL blob được thu hồi ({@code URL.revokeObjectURL}) khi đóng hoặc khi đổi/unmount. Không gọi API; cha cung cấp blob đã tải.
 *
 * @param {object} props
 * @param {boolean} [props.isOpen] Nếu không truyền thì mở khi có URL.
 * @param {()=>void} props.onClose
 * @param {string} [props.blobUrl] URL blob (ưu tiên).
 * @param {string} [props.url] URL thay thế.
 * @param {string} [props.fileName='evidence-document']
 * @param {string} [props.contentType='application/pdf']
 * @param {string} [props.lang='vi']
 */
export default function EvidencePreviewModal({
  isOpen,
  onClose,
  blobUrl,
  url,
  fileName = 'evidence-document',
  contentType = 'application/pdf',
  lang = 'vi',
}) {
  const activeUrl = blobUrl || url;
  const isActuallyOpen = isOpen !== undefined ? Boolean(isOpen) : Boolean(activeUrl);
  const modalRef = useModalFocus(isActuallyOpen, onClose);
  const isEn = lang === 'en';

  useEffect(() => {
    return () => {
      if (activeUrl) {
        URL.revokeObjectURL(activeUrl);
      }
    };
  }, [activeUrl]);

  if (!isActuallyOpen || !activeUrl) return null;

  const isDeclaredImage = contentType.startsWith('image/');
  const isPdf = !isDeclaredImage && (contentType === 'application/pdf' || fileName.toLowerCase().endsWith('.pdf'));
  const isImage = isDeclaredImage || fileName.match(/\.(jpe?g|png)$/i);

  /**
   * Thu hồi URL blob rồi gọi {@code onClose}.
   */
  const handleClose = () => {
    if (activeUrl) {
      URL.revokeObjectURL(activeUrl);
    }
    onClose?.();
  };

  /**
   * Tải tệp về máy bằng thẻ {@code <a download>} tạm.
   */
  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = activeUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  return (
    <div className="lv-modal-backdrop" onClick={handleClose} role="presentation">
      <div
        className="lv-modal lv-evidence-preview-modal"
        style={{ maxWidth: '840px', width: '92vw' }}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        tabIndex={-1}
        aria-labelledby="lv-evidence-preview-title"
        ref={modalRef}
      >
        <div className="lv-modal__header lv-evidence-preview-header">
          <div className="lv-evidence-preview-title-group">
            <FileText size={18} className="lv-evidence-preview-icon" aria-hidden="true" />
            <h2 id="lv-evidence-preview-title" className="lv-modal__title lv-evidence-preview-title">
              {fileName}
            </h2>
            <span className="lv-evidence-preview-mime">{contentType}</span>
          </div>

          <div className="lv-evidence-preview-actions">
            <button
              type="button"
              className="lv-evidence-preview-btn-download"
              onClick={handleDownload}
              title={isEn ? 'Download file' : 'Tải tệp về máy'}
            >
              <Download size={16} aria-hidden="true" />
              <span>{isEn ? 'Download' : 'Tải về'}</span>
            </button>
            <button
              type="button"
              className="lv-modal__close-btn"
              onClick={handleClose}
              aria-label={isEn ? 'Close preview' : 'Đóng xem trước'}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="lv-modal__body lv-evidence-preview-body">
          {isPdf ? (
            <div className="lv-evidence-preview-viewer">
              <iframe
                src={activeUrl}
                title={fileName}
                className="lv-evidence-preview-frame"
              />
            </div>
          ) : isImage ? (
            <ZoomableImage src={activeUrl} alt={fileName} lang={lang} />
          ) : (
            <div className="lv-evidence-preview-unsupported">
              <p>
                {isEn
                  ? 'Preview not supported for this file format. Please download to view.'
                  : 'Định dạng tệp này không hỗ trợ xem trực tiếp. Vui lòng tải về máy để xem.'}
              </p>
              <Button
                type="button"
                onClick={handleDownload}
              >
                {isEn ? 'Download file' : 'Tải tệp'}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
