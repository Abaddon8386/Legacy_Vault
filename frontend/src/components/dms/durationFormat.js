export function formatDurationMinutes(total, lang = 'vi') {
  const en = lang === 'en';
  const parts = [[Math.floor(total / 1440), en ? 'day' : 'ngày'], [Math.floor(total % 1440 / 60), en ? 'hour' : 'giờ'], [total % 60, en ? 'minute' : 'phút']]
    .filter(([amount]) => amount > 0).map(([amount, unit]) => `${amount} ${unit}${en && amount > 1 ? 's' : ''}`);
  return parts.join(' ') || (en ? '0 minutes' : '0 phút');
}
