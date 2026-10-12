import './StatusBadge.css';

const STATUS_LABELS = {
  ACTIVE: { vi: 'Đang hoạt động', en: 'Active', tone: 'active' },
  TRIGGERED: { vi: 'Kích hoạt chờ phản hồi', en: 'Triggered (Grace)', tone: 'await' },
  GRACE_PERIOD: { vi: 'Thời gian ân hạn', en: 'Grace Period', tone: 'await' },
  DISABLED: { vi: 'Chưa kích hoạt', en: 'Not Configured', tone: 'neutral' },
  NOT_CONFIGURED: { vi: 'Chưa cấu hình', en: 'Not Configured', tone: 'neutral' },
  AWAITING_VERIFICATION: { vi: 'Chờ tiếp nhận', en: 'Awaiting Intake', tone: 'await' },
  DOCUMENT_VERIFICATION: { vi: 'Thẩm định hồ sơ', en: 'Doc Verification', tone: 'await' },
  WILL_VERIFICATION: { vi: 'Đối chiếu di chúc', en: 'Will Verification', tone: 'await' },
  LEGAL_APPROVED: { vi: 'Đã phê duyệt', en: 'Legal Approved', tone: 'info' },
  UNLOCKED: { vi: 'Đã mở khóa', en: 'Unlocked', tone: 'active' },
  HANDOVER_IN_PROGRESS: { vi: 'Đang bàn giao', en: 'Handover in Progress', tone: 'await' },
  HANDOVER_CONFIRMED: { vi: 'Nghiệm thu hoàn tất', en: 'Handover Confirmed', tone: 'active' },
  ARCHIVED: { vi: 'Lưu trữ vĩnh viễn', en: 'Archived', tone: 'neutral' },
};

export default function StatusBadge({ status = 'ACTIVE', lang = 'vi' }) {
  const config = STATUS_LABELS[status] || {
    vi: status,
    en: status,
    tone: 'neutral',
  };
  const label = lang === 'en' ? config.en : config.vi;

  return (
    <span className={`lv-status-badge lv-tone-${config.tone}`} role="status">
      <span className="lv-status-dot" aria-hidden="true" />
      <span className="lv-status-text">{label}</span>
    </span>
  );
}
