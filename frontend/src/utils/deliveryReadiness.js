/**
 * Xác định một dòng tài sản có thể bàn giao hay không: đã DELIVERED thì không; chưa liên kết tài khoản người nhận (RECIPIENT_ACCOUNT_REQUIRED) thì không; chỉ khi backend báo deliverable và accountLinked thì cho phép. Ở chế độ preview dữ liệu mẫu thiếu cờ vẫn cho phép. Dùng bởi pages/staff/ScopedAssetHandoverPage.jsx.
 */
export function deliveryReadiness(row, { preview = false } = {}) {
  if (row.status === 'DELIVERED' || row.deliveryStatus === 'DELIVERED') return { deliverable: false, blockedReason: 'DELIVERED' };
  if (row.accountLinked === false || row.blockedReason === 'RECIPIENT_ACCOUNT_REQUIRED') return { deliverable: false, blockedReason: 'RECIPIENT_ACCOUNT_REQUIRED' };
  if (row.deliverable === true && row.accountLinked === true && row.blockedReason == null) return { deliverable: true, blockedReason: null };
  if (preview && row.deliverable === undefined && row.accountLinked === undefined && row.blockedReason == null) return { deliverable: true, blockedReason: null };
  return { deliverable: false, blockedReason: 'READINESS_UNAVAILABLE' };
}
/**
 * Trả thông điệp vi/en giải thích vì sao tài sản chưa thể bàn giao (đã giao, cần xác nhận liên kết tài khoản người nhận, hoặc chưa xác nhận được điều kiện).
 */
export function deliveryBlockedReason(item, lang = 'vi') {
  const en = lang === 'en';
  if (item.handoverStatus === 'DELIVERED' || item.blockedReason === 'DELIVERED') return en ? 'Already delivered.' : 'Tài sản đã được bàn giao.';
  if (item.blockedReason === 'RECIPIENT_ACCOUNT_REQUIRED' || item.accountLinked === false) return en ? 'Staff must confirm this recipient’s account link before delivery.' : 'Cần Staff xác nhận liên kết tài khoản người nhận trước khi bàn giao.';
  return en ? 'Delivery conditions are not confirmed. Reload the session.' : 'Chưa xác nhận được điều kiện bàn giao. Hãy tải lại phiên.';
}
