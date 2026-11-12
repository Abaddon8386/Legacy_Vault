import { useEffect, useRef, useState } from 'react';
import EvidencePreviewModal from '../../components/common/EvidencePreviewModal.jsx';

/**
 * Nút "Xem biên nhận đã ký" cho một lần xác nhận nhận tài sản của người thụ hưởng.
 * Khi bấm, `open()` gọi `GET /api/v1/staff/verification-cases/{caseId}/handover-sessions/{sessionId}/beneficiary-confirmations/{confirmationId}/file`
 * (kèm Bearer token, quyền Staff), nhận blob và chỉ chấp nhận `application/pdf`, `image/jpeg`, `image/png`.
 * Blob được đổi thành object URL để xem trước: nếu cha truyền `onViewReceipt` thì giao dữ liệu cho cha,
 * nếu không thì tự mở `EvidencePreviewModal`. Object URL được thu hồi và request bị hủy khi unmount.
 * Được dùng trong `BeneficiaryConfirmationPage.jsx`.
 *
 * @param {object} props
 * @param {string} props.caseId id hồ sơ xác minh.
 * @param {string} props.sessionId id phiên bàn giao.
 * @param {string} props.confirmationId id bản ghi xác nhận của người thụ hưởng.
 * @param {string} props.accessToken JWT của staff.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @param {Function} [props.onUnauthorized] gọi khi API trả 401.
 * @param {Function} [props.onViewReceipt] nhận `{blobUrl, contentType, fileName}` để cha tự hiển thị.
 * @returns {JSX.Element}
 */
export default function SignedReceiptViewer({
  caseId,
  sessionId,
  confirmationId,
  accessToken,
  lang = 'vi',
  onUnauthorized,
  onViewReceipt,
}) {
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const controller = useRef(null);
  const active = useRef(true);
  const url = useRef(null);

  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      controller.current?.abort();
      if (url.current) URL.revokeObjectURL(url.current);
    };
  }, []);

  /** Tải tệp biên nhận ký nhận từ backend, kiểm tra loại tệp và mở bản xem trước; lỗi đặt vào state `error`. */
  async function open() {
    if (busy) return;
    const c = new AbortController();
    controller.current = c;
    setBusy(true);
    setError('');
    try {
      const response = await fetch(
        `/api/v1/staff/verification-cases/${encodeURIComponent(caseId)}/handover-sessions/${encodeURIComponent(sessionId)}/beneficiary-confirmations/${encodeURIComponent(confirmationId)}/file`,
        { headers: { Authorization: `Bearer ${accessToken}` }, signal: c.signal }
      );
      if (response.status === 401) {
        onUnauthorized?.();
        throw new Error();
      }
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!['application/pdf', 'image/jpeg', 'image/png'].includes(blob.type)) throw new Error();
      if (!active.current || c.signal.aborted) return;
      const blobUrl = URL.createObjectURL(blob);
      url.current = blobUrl;
      const previewData = { blobUrl, contentType: blob.type, fileName: 'signed-receipt' };
      if (typeof onViewReceipt === 'function') {
        onViewReceipt(previewData);
      } else {
        setPreview(previewData);
      }
    } catch {
      if (active.current && !c.signal.aborted) {
        setError(lang === 'en' ? 'Could not open the receipt.' : 'Không mở được biên nhận.');
      }
    } finally {
      if (active.current && !c.signal.aborted) setBusy(false);
    }
  }

  return (
    <div className="lv-signed-receipt-viewer">
      <button
        type="button"
        className="lv-btn lv-btn--secondary lv-btn-view-receipt"
        disabled={busy}
        onClick={open}
        aria-label={lang === 'en' ? 'View signed receipt' : 'Xem biên nhận đã ký'}
      >
        {lang === 'en' ? 'View signed receipt' : 'Xem biên nhận đã ký'}
      </button>
      {error && <p className="lv-receipt-view-error" role="alert">{error}</p>}
      {!onViewReceipt && preview && (
        <EvidencePreviewModal
          {...preview}
          fileName="signed-receipt"
          lang={lang}
          onClose={() => {
            url.current = null;
            setPreview(null);
          }}
        />
      )}
    </div>
  );
}
