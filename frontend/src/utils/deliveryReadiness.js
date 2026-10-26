export function deliveryReadiness(row, { preview = false } = {}) {
  if (row.status === 'DELIVERED' || row.deliveryStatus === 'DELIVERED') return { deliverable: false, blockedReason: 'DELIVERED' };
  if (row.accountLinked === false || row.blockedReason === 'RECIPIENT_ACCOUNT_REQUIRED') return { deliverable: false, blockedReason: 'RECIPIENT_ACCOUNT_REQUIRED' };
  if (row.deliverable === true && row.accountLinked === true && row.blockedReason == null) return { deliverable: true, blockedReason: null };
  if (preview && row.deliverable === undefined && row.accountLinked === undefined && row.blockedReason == null) return { deliverable: true, blockedReason: null };
  return { deliverable: false, blockedReason: 'READINESS_UNAVAILABLE' };
}
export function deliveryBlockedReason(item, lang = 'vi') {
  const en = lang === 'en';
  if (item.handoverStatus === 'DELIVERED' || item.blockedReason === 'DELIVERED') return en ? 'Already delivered.' : 'Tài sản đã được bàn giao.';
  if (item.blockedReason === 'RECIPIENT_ACCOUNT_REQUIRED' || item.accountLinked === false) return en ? 'Staff must confirm this recipient’s account link before delivery.' : 'Cần Staff xác nhận liên kết tài khoản người nhận trước khi bàn giao.';
  return en ? 'Delivery conditions are not confirmed. Reload the session.' : 'Chưa xác nhận được điều kiện bàn giao. Hãy tải lại phiên.';
}
