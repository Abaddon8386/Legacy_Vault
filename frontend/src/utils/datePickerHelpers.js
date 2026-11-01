/**
 * datePickerHelpers.js
 * Pure utility functions for DatePicker: strict calendar validation and ISO formatting
 */

/**
 * Strict calendar date validation checking year, month, and actual days in month (including leap years)
 */
export function isValidCalendarDate(year, month, day) {
  if (typeof year !== 'number' || typeof month !== 'number' || typeof day !== 'number') return false;
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
  if (year < 1000 || year > 9999) return false;
  if (month < 1 || month > 12) return false;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > daysInMonth) return false;
  return true;
}

/**
 * Format ISO (YYYY-MM-DD) to locale display string
 */
export function formatIsoToDisplay(iso, isEn) {
  if (!iso || typeof iso !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return '';
  const [y, m, d] = iso.split('-').map(Number);
  if (!isValidCalendarDate(y, m, d)) return '';
  const yStr = String(y);
  const mStr = String(m).padStart(2, '0');
  const dStr = String(d).padStart(2, '0');
  return isEn ? `${yStr}-${mStr}-${dStr}` : `${dStr}/${mStr}/${yStr}`;
}

/**
 * Parse display string to ISO YYYY-MM-DD with strict calendar validation
 * Returns null for invalid dates (e.g. 31/02/2026), empty string for empty input
 */
export function parseDisplayToIso(str, isEn) {
  if (!str || typeof str !== 'string' || !str.trim()) return '';
  const clean = str.trim();

  // Try primary locale format
  if (isEn) {
    const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (match) {
      const y = Number(match[1]);
      const m = Number(match[2]);
      const d = Number(match[3]);
      if (isValidCalendarDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return null;
    }
  } else {
    const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (match) {
      const d = Number(match[1]);
      const m = Number(match[2]);
      const y = Number(match[3]);
      if (isValidCalendarDate(y, m, d)) {
        return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      }
      return null;
    }
  }

  // Cross-format fallback: allow valid ISO in VI mode or valid VI in EN mode
  const isoMatch = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  const slashMatch = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (slashMatch) {
    const d = Number(slashMatch[1]);
    const m = Number(slashMatch[2]);
    const y = Number(slashMatch[3]);
    if (isValidCalendarDate(y, m, d)) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
    return null;
  }

  return null;
}
