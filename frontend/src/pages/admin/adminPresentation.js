// Presentation labels only; API event codes and filter values stay unchanged.
const actions = {
  AUTH_REGISTERED: ['Tạo tài khoản', 'Account registered'],
  AUTH_LOGIN_SUCCEEDED: ['Đăng nhập thành công', 'Signed in'],
  AUTH_LOGIN_FAILED: ['Đăng nhập thất bại', 'Sign-in failed'],
  VAULT_CREATED: ['Tạo kho', 'Vault created'],
  VAULT_ALERT_CANCELLED: ['Hủy cảnh báo kho', 'Vault alert cancelled'],
  ASSET_CREATED: ['Thêm tài sản', 'Asset added'],
  ASSET_UPDATED: ['Cập nhật tài sản', 'Asset updated'],
  ASSET_REVEALED: ['Xem nội dung tài sản', 'Asset content viewed'],
  WILL_UPLOADED: ['Tải lên di chúc', 'Will uploaded'],
  WILL_VERSION_ADDED: ['Thêm phiên bản di chúc', 'Will version added'],
  TRUSTEE_APPOINTED: ['Chỉ định người thi hành', 'Trustee appointed'],
  TRUSTEE_REVOKED: ['Thu hồi người thi hành', 'Trustee revoked'],
  BENEFICIARY_ADDED: ['Thêm người thụ hưởng', 'Beneficiary added'],
  DMS_CHECKED_IN: ['Xác nhận hoạt động', 'Activity confirmed'],
  DMS_CONFIGURED: ['Cấu hình giám sát hoạt động', 'Activity monitoring configured'],
  LEGAL_DEATH_DOCUMENT_DECIDED: ['Kiểm duyệt giấy tờ tử vong', 'Death document reviewed'],
  HANDOVER_ASSET_DELIVERED: ['Bàn giao tài sản', 'Asset delivered'],
  EVIDENCE_FILE_READ: ['Xem tệp chứng cứ', 'Evidence file viewed'],
};

export const adminActionLabel = (code, lang) => actions[code]?.[lang === 'en' ? 1 : 0] || code;

export function formatAdminTimestamp(timestamp, lang) {
  if (!timestamp) return null;
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return timestamp;
  return `${date.toLocaleString(lang === 'en' ? 'en-GB' : 'vi-VN', {
    dateStyle: 'medium', timeStyle: 'medium', timeZone: 'UTC',
  })} UTC`;
}

export function adminSubscriptionLabel(code, lang) {
  const labels = {
    ACTIVE: ['Đang hiệu lực', 'Active'],
    DEFAULT_BASIC_FREE: ['Cơ bản miễn phí', 'Default free Basic'],
    LIFETIME: ['Mua một lần / Trọn đời', 'One-time / Lifetime'],
    MONTHLY: ['Theo tháng', 'Monthly'],
  };
  return labels[code]?.[lang === 'en' ? 1 : 0] || code;
}
