// Calendar age for immediate form feedback only; no server decision is inferred.
export function beneficiaryAge(dateOfBirth, today = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateOfBirth || '')) return null;
  const date = new Date(`${dateOfBirth}T00:00:00Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== dateOfBirth) return null;
  const [year, month, day] = dateOfBirth.split('-').map(Number);
  const age = today.getFullYear() - year -
    (today.getMonth() + 1 < month || (today.getMonth() + 1 === month && today.getDate() < day) ? 1 : 0);
  return age < 0 ? null : age;
}
