export function formatCaseReference(value) {
  if (typeof value !== 'string') return '—';
  return /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value)
    ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}

export function formatStaffSession(session, lang = 'vi') {
  const en = lang === 'en';
  const statuses = en ? {OPEN: 'Open', COMPLETED: 'Completed', CANCELLED: 'Cancelled'}
    : {OPEN: 'Đang mở', COMPLETED: 'Hoàn tất', CANCELLED: 'Đã hủy'};
  const date = new Date(session.openedAt);
  const time = Number.isNaN(date.getTime()) ? '—' : new Intl.DateTimeFormat(en ? 'en-GB' : 'vi-VN', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }).format(date);
  return `${statuses[session.status] || (en ? 'Session' : 'Phiên')} · ${time}`;
}
