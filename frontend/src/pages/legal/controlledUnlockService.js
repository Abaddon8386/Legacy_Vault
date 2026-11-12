/**
 * Chuyển dữ liệu mở khóa thô thành mô hình hiển thị.
 * Chỉ coi là UNLOCKED khi vaultStatus === 'UNLOCKED' và có unlockConfirmation.source; LOCKED khi vaultStatus === 'LOCKED'; còn lại là UNKNOWN.
 *
 * @param {object} [data] Dữ liệu trả về từ fetchControlledUnlock.
 * @param {{isSimulation?: boolean}} [options] isSimulation đánh dấu dữ liệu mô phỏng.
 * @returns {{status: 'UNLOCKED'|'LOCKED'|'UNKNOWN', isSimulation: boolean, source: string|null}} Mô hình hiển thị dùng bởi ControlledUnlockPage.
 */
export function describeUnlock(data, { isSimulation = false } = {}) {
  const confirmed = data?.vaultStatus === 'UNLOCKED' && Boolean(data?.unlockConfirmation?.source);
  return { status: confirmed ? 'UNLOCKED' : data?.vaultStatus === 'LOCKED' ? 'LOCKED' : 'UNKNOWN', isSimulation, source: confirmed ? data.unlockConfirmation.source : null };
}
/**
 * Lấy trạng thái mở khóa kho. Backend chưa sẵn sàng nên hàm này KHÔNG gọi API nào:
 * ở production, khi có accessToken hoặc không phải dev preview thì ném Error với code BACKEND_NOT_READY (status 503);
 * ngược lại trả dữ liệu tổng hợp theo kịch bản ('locked' hoặc 'unlocked' với nguồn SYNTHETIC_PREVIEW_SIMULATION).
 *
 * @param {{isDevPreview?: boolean, accessToken?: string, scenario?: 'locked'|'unlocked', production?: boolean}} [options]
 * @returns {Promise<{vaultStatus: string, unlockConfirmation: ({source: string}|null)}>} Dữ liệu mẫu.
 * @throws {Error} code BACKEND_NOT_READY (status 503) khi không ở chế độ xem trước.
 */
export async function fetchControlledUnlock({ isDevPreview = false, accessToken, scenario = 'locked', production = false } = {}) {
  if (import.meta.env?.PROD || production || accessToken || !isDevPreview) {
    const error = new Error('Backend not ready'); error.code = 'BACKEND_NOT_READY'; error.status = 503; throw error;
  }
  return { vaultStatus: scenario === 'unlocked' ? 'UNLOCKED' : 'LOCKED', unlockConfirmation: scenario === 'unlocked' ? { source: 'SYNTHETIC_PREVIEW_SIMULATION' } : null };
}
