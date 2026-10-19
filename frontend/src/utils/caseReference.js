export function formatCaseReference(value) {
  if (typeof value !== 'string') return '—';
  return /^[a-f\d]{8}-(?:[a-f\d]{4}-){3}[a-f\d]{12}$/i.test(value)
    ? `${value.slice(0, 8)}…${value.slice(-4)}` : value;
}
