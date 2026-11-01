export function formatCaseReference(value) {
  if (typeof value !== 'string') return '—';
  return /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value)
    ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function formatStaffSession(session, lang = 'vi') {
  const en = lang === 'en';
  const statuses = en ? {OPEN: 'Open', COMPLETED: 'Completed', CANCELLED: 'Cancelled'}
    : {OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy'};
  if (!session?.status && !session?.openedAt) return en ? 'Loading session details…' : 'Đang tải thông tin phiên…';
  const date = new Date(session.openedAt);
  const time = Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(en ? 'en-GB' : 'vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
  const status = statuses[session.status] || (en ? 'Handover session' : 'Phiên bàn giao');
  return time === '—' ? status : `${status} · ${time}`;
}
