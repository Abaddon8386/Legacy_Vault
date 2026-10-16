import { User, Shield, Info, Hash, Clock } from 'lucide-react';
import { Modal } from '../../components/common/Modal.jsx';
import { Button } from '../../components/common/Button.jsx';
import { getStaffCaseTranslations } from './staffCaseI18n.js';
import './StaffCaseDetailModal.css';

/**
 * StaffCaseDetailModal — Khung xem thông tin tham chiếu chỉ đọc cho PS-25.
 *
 * RÀNG BUỘC NGHIỆP VỤ & PHÁP LÝ:
 * - Đây chỉ là khung trình bày (presentation view model), CHƯA tích hợp API detail.
 * - Tuyệt đối KHÔNG thêm nút tạo case thủ công, xác nhận tử vong, phê duyệt pháp lý,
 *   unlock, decrypt hay bàn giao di sản. Các hành động tiếp nhận thuộc phạm vi PS-26.
 */
export default function StaffCaseDetailModal({
  isOpen,
  onClose,
  caseItem,
  lang = 'vi',
  onStartIntake,
  onStartVerification,
}) {
  const t = getStaffCaseTranslations(lang);

  if (!caseItem) return null;

  const formatDate = (isoString) => {
    if (!isoString) return '—';
    try {
      const date = new Date(isoString);
      return new Intl.DateTimeFormat(lang === 'en' ? 'en-US' : 'vi-VN', {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      }).format(date);
    } catch {
      return isoString;
    }
  };

  const getStatusBadge = (status) => {
    const label = t.statusLabels[status] || status;
    let badgeModifier = 'awaiting';
    if (status === 'IN_PROGRESS') badgeModifier = 'progress';
    if (status === 'VERIFIED') badgeModifier = 'verified';

    return (
      <span className={`lv-staff-status-badge lv-staff-status-badge--${badgeModifier}`}>
        <span className="lv-staff-status-dot" aria-hidden="true" />
        <span>{label}</span>
      </span>
    );
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={t.detailModal.title}
      description={caseItem.caseNumber}
      maxWidth="620px"
      closeLabel={t.detailModal.closeBtn}
    >
      <div className="lv-case-detail-container">
        {/* Notice alert: Read-only boundary PS-25 / PS-26 */}
        <div className="lv-case-detail__notice-box" role="note">
          <Info size={18} className="lv-case-detail__notice-icon" aria-hidden="true" />
          <div className="lv-case-detail__notice-content">
            <h4 className="lv-case-detail__notice-title">{t.detailModal.noticeTitle}</h4>
            <p className="lv-case-detail__notice-text">{t.detailModal.noticeText}</p>
          </div>
        </div>

        {/* Reference Fields Grid */}
        <div className="lv-case-detail__grid">
          {/* Case Reference */}
          <div className="lv-case-detail__card">
            <div className="lv-case-detail__card-label">
              <Hash size={14} aria-hidden="true" />
              <span>{t.detailModal.caseRef}</span>
            </div>
            <div className="lv-case-detail__card-val lv-case-detail__card-val--mono">
              {caseItem.caseNumber}
            </div>
          </div>

          {/* Current Status */}
          <div className="lv-case-detail__card">
            <div className="lv-case-detail__card-label">
              <Shield size={14} aria-hidden="true" />
              <span>{t.detailModal.currentStatus}</span>
            </div>
            <div className="lv-case-detail__card-val">
              {getStatusBadge(caseItem.status)}
            </div>
          </div>

          {/* Vault Name & ID */}
          <div className="lv-case-detail__card lv-case-detail__card--full">
            <div className="lv-case-detail__card-label">
              <Shield size={14} aria-hidden="true" />
              <span>{t.detailModal.vaultId}</span>
            </div>
            <div className="lv-case-detail__card-val">
              <span className="lv-case-detail__vault-name">{caseItem.vaultName}</span>
              <span className="lv-case-detail__vault-id">{caseItem.vaultId}</span>
            </div>
          </div>

          {/* Vault Owner */}
          <div className="lv-case-detail__card">
            <div className="lv-case-detail__card-label">
              <User size={14} aria-hidden="true" />
              <span>{t.detailModal.ownerName}</span>
            </div>
            <div className="lv-case-detail__card-val">
              {caseItem.ownerName}
            </div>
          </div>

          {/* Grace Period Ended At */}
          <div className="lv-case-detail__card">
            <div className="lv-case-detail__card-label">
              <Clock size={14} aria-hidden="true" />
              <span>{t.detailModal.graceEndedAt}</span>
            </div>
            <div className="lv-case-detail__card-val">
              {formatDate(caseItem.gracePeriodEndedAt)}
            </div>
          </div>
        </div>

        {/* Modal Actions */}
        <div className="lv-case-detail__actions">
          <Button
            variant="secondary"
            onClick={onClose}
            className="lv-case-detail__close-btn"
          >
            {t.detailModal.closeBtn}
          </Button>
          {onStartVerification && (
            <Button
              variant="primary"
              onClick={() => {
                onClose();
                onStartVerification(caseItem);
              }}
              className="lv-case-detail__verify-btn"
            >
              {t.detailModal.verifyBtn || t.table.verifyAction}
            </Button>
          )}
          {onStartIntake && (
            <Button
              variant="secondary"
              onClick={() => {
                onClose();
                onStartIntake(caseItem);
              }}
              className="lv-case-detail__intake-btn"
            >
              {t.table.intakeAction}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
