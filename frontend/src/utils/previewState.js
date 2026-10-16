// In-memory preview data only; never stores credentials or real API responses.
const schedules = new Map();
export function normalizePreviewScenario(value = 'monitoring') {
  return ({ api_error: 'network_error', overdue: 'triggered' })[value] || value || 'monitoring';
}
export function readPreviewSchedule(scenario, fallback) {
  const key = normalizePreviewScenario(scenario);
  return schedules.has(key) ? structuredClone(schedules.get(key)) : fallback(key);
}
export function writePreviewSchedule(scenario, value) {
  schedules.set(normalizePreviewScenario(scenario), structuredClone(value));
  return value;
}
export function previewRoute(tab, search, lang) {
  const params = new URLSearchParams(search);
  const result = new URLSearchParams({ preview: 'true' });
  const scenario = params.get('scenario') || params.get('summary') || params.get('dms');
  if (scenario) result.set('scenario', normalizePreviewScenario(scenario));
  result.set('lang', lang === 'en' ? 'en' : 'vi');
  return '/' + tab + '?' + result.toString();
}
