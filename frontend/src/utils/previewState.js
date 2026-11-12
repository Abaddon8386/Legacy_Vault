// In-memory preview data only; never stores credentials or real API responses.
/**
 * Lưu tạm trong bộ nhớ dữ liệu lịch DMS ở chế độ preview theo kịch bản; không bao giờ lưu thông tin đăng nhập hay phản hồi API thật.
 */
const schedules = new Map();
/**
 * Chuẩn hóa tên kịch bản preview (api_error thành network_error, overdue thành triggered; mặc định monitoring).
 */
export function normalizePreviewScenario(value = 'monitoring') {
  return ({ api_error: 'network_error', overdue: 'triggered' })[value] || value || 'monitoring';
}
/**
 * Đọc bản sao lịch DMS đã lưu cho kịch bản, nếu chưa có thì dùng hàm fallback. Dùng bởi dmsService.js.
 */
export function readPreviewSchedule(scenario, fallback) {
  const key = normalizePreviewScenario(scenario);
  return schedules.has(key) ? structuredClone(schedules.get(key)) : fallback(key);
}
/**
 * Ghi (bản sao của) lịch DMS cho kịch bản và trả lại giá trị.
 */
export function writePreviewSchedule(scenario, value) {
  schedules.set(normalizePreviewScenario(scenario), structuredClone(value));
  return value;
}
/**
 * Tạo đường dẫn preview /{tab}?preview=true&scenario=...&lang=... từ chuỗi query hiện tại. Dùng bởi App.jsx và components/vault/VaultSummary.jsx.
 */
export function previewRoute(tab, search, lang) {
  const params = new URLSearchParams(search);
  const result = new URLSearchParams({ preview: 'true' });
  const scenario = params.get('scenario') || params.get('summary') || params.get('dms');
  if (scenario) result.set('scenario', normalizePreviewScenario(scenario));
  result.set('lang', lang === 'en' ? 'en' : 'vi');
  return '/' + tab + '?' + result.toString();
}
