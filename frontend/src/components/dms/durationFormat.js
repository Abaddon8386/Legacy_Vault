/**
 * Định dạng tổng số phút thành chuỗi "N ngày N giờ N phút" (hoặc tiếng Anh); bỏ các thành phần bằng 0, trả "0 phút" nếu bằng 0.
 * @param {number} total Tổng số phút.
 * @param {string} [lang='vi']
 * @returns {string}
 */
export function formatDurationMinutes(total, lang = 'vi') {
  const en = lang === 'en';
  const parts = [[Math.floor(total / 1440), en ? 'day' : 'ngày'], [Math.floor(total % 1440 / 60), en ? 'hour' : 'giờ'], [total % 60, en ? 'minute' : 'phút']]
    .filter(([amount]) => amount > 0).map(([amount, unit]) => `${amount} ${unit}${en && amount > 1 ? 's' : ''}`);
  return parts.join(' ') || (en ? '0 minutes' : '0 phút');
}
