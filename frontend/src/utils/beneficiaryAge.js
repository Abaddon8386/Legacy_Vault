// Calendar age for immediate form feedback only; no server decision is inferred.
/**
 * Tính tuổi theo lịch từ ngày sinh để phản hồi tức thời trên form (không phải quyết định của server).
 * @param {string} dateOfBirth Ngày sinh dạng YYYY-MM-DD.
 * @param {Date} today Ngày hiện tại (mặc định new Date()).
 * @returns {number|null} Tuổi, hoặc null nếu ngày không hợp lệ/ở tương lai.
 * Dùng trong form người thụ hưởng (pages/trusteeBeneficiary).
 */
export function beneficiaryAge(dateOfBirth, today = new Date()) {
  if (!(today instanceof Date) || !Number.isFinite(today.getTime())) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || '')) return null;
  const date = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const age = today.getFullYear() - year -
    (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
  return age < 0 ? null : age;
}
