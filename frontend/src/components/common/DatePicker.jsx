import { useState, useEffect, useRef, useId, useCallback } from 'react';
import { formatIsoToDisplay, parseDisplayToIso, isValidCalendarDate } from '../../utils/datePickerHelpers.js';
import './DatePicker.css';

function CalendarIcon({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
      <line x1="16" y1="2" x2="16" y2="6"/>
      <line x1="8" y1="2" x2="8" y2="6"/>
      <line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  );
}

function ChevronLeft({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ChevronRight({ size = 16, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function XIcon({ size = 14, ...props }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" {...props}>
      <line x1="18" y1="6" x2="6" y2="18"/>
      <line x1="6" y1="6" x2="18" y2="18"/>
    </svg>
  );
}

function buildValidationMessage(errorType, { isEn, min, max }) {
  if (errorType === 'invalid') {
    return isEn ? 'Please enter a valid date.' : 'Vui lòng nhập ngày thực tế hợp lệ.';
  }
  if (errorType === 'min') {
    const formattedMin = formatIsoToDisplay(min, isEn) || min;
    return isEn
      ? `Date cannot be earlier than ${formattedMin}.`
      : `Ngày không được sớm hơn ${formattedMin}.`;
  }
  if (errorType === 'max') {
    const formattedMax = formatIsoToDisplay(max, isEn) || max;
    return isEn
      ? `Date cannot be later than ${formattedMax}.`
      : `Ngày không được muộn hơn ${formattedMax}.`;
  }
  if (errorType === 'required') {
    return isEn ? 'Please fill out this field.' : 'Vui lòng điền vào trường này.';
  }
  return '';
}

/**
 * Universal accessible DatePicker component for LegacyVault
 * Supports VI (DD/MM/YYYY) and EN (YYYY-MM-DD) display formats
 * Value contract: always ISO string YYYY-MM-DD (or raw string when invalid/typing, empty string when cleared)
 */
export function DatePicker({
  value = '',
  onChange,
  min = '',
  max = '',
  disabled = false,
  required = false,
  id,
  name,
  placeholder,
  className = '',
  lang = 'vi',
  'aria-label': ariaLabel,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedby,
}) {
  const generatedId = useId();
  const inputId = id || generatedId;
  const errorId = `${inputId}-error`;
  const isEn = lang === 'en';

  const [isOpen, setIsOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const [inputValue, setInputValue] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
      return formatIsoToDisplay(value, isEn);
    }
    return value || '';
  });
  const [inputError, setInputError] = useState(null);

  const [navYear, setNavYear] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return Number(value.slice(0, 4));
    return new Date().getFullYear();
  });
  const [navMonth, setNavMonth] = useState(() => {
    if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) return Number(value.slice(5, 7)) - 1;
    return new Date().getMonth();
  });
  const [focusedDate, setFocusedDate] = useState(() => value || new Date().toISOString().slice(0, 10));

  const containerRef = useRef(null);
  const inputRef = useRef(null);
  const calendarRef = useRef(null);

  // Track the latest value emitted to onChange to distinguish internal typing from external prop updates
  const [lastEmittedValue, setLastEmittedValue] = useState(value);

  // Handle external prop changes (e.g. form reset, parent loading new entity, switching lang)
  const [prevSync, setPrevSync] = useState(() => ({ value, isEn, min, max, required }));
  if (
    prevSync.value !== value ||
    prevSync.isEn !== isEn ||
    prevSync.min !== min ||
    prevSync.max !== max ||
    prevSync.required !== required
  ) {
    setPrevSync({ value, isEn, min, max, required });

    // Only update inputValue if the change came externally (not what DatePicker just emitted itself)
    if (value !== lastEmittedValue || prevSync.isEn !== isEn) {
      setLastEmittedValue(value);
      if (value && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
        const [y, m, d] = value.split('-').map(Number);
        if (isValidCalendarDate(y, m, d)) {
          setInputValue(formatIsoToDisplay(value, isEn));
          if (min && value < min) {
            setInputError('min');
          } else if (max && value > max) {
            setInputError('max');
          } else {
            setInputError(null);
            setNavYear(y);
            setNavMonth(m - 1);
            setFocusedDate(value);
          }
        } else {
          setInputValue(value);
          setInputError('invalid');
        }
      } else if (!value) {
        setInputValue('');
        setInputError(null);
      } else {
        setInputValue(value);
        setInputError('invalid');
      }
    }
  }

  // Synchronize native custom validity on mount and whenever input, constraints or language change
  useEffect(() => {
    if (!inputRef.current) return;
    const trimmed = inputValue.trim();
    if (!trimmed) {
      if (required) {
        inputRef.current.setCustomValidity(isEn ? 'Please fill out this field.' : 'Vui lòng điền vào trường này.');
      } else {
        inputRef.current.setCustomValidity('');
      }
      return;
    }

    const parsed = parseDisplayToIso(trimmed, isEn);
    if (parsed) {
      if (min && parsed < min) {
        const msg = isEn
          ? `Date cannot be earlier than ${formatIsoToDisplay(min, isEn) || min}.`
          : `Ngày không được sớm hơn ${formatIsoToDisplay(min, isEn) || min}.`;
        inputRef.current.setCustomValidity(msg);
      } else if (max && parsed > max) {
        const msg = isEn
          ? `Date cannot be later than ${formatIsoToDisplay(max, isEn) || max}.`
          : `Ngày không được muộn hơn ${formatIsoToDisplay(max, isEn) || max}.`;
        inputRef.current.setCustomValidity(msg);
      } else {
        inputRef.current.setCustomValidity('');
      }
    } else {
      // Incomplete or invalid date format: always set custom validity to block form submission
      const msg = isEn ? 'Please enter a valid date.' : 'Vui lòng nhập ngày thực tế hợp lệ.';
      inputRef.current.setCustomValidity(msg);
    }
  }, [inputValue, isEn, min, max, required]);

  // Click outside listener to close calendar popover & position popover inside viewport
  useEffect(() => {
    if (!isOpen) return;
    const updatePosition = () => {
      const wrap = containerRef.current;
      if (!wrap || typeof window === 'undefined') return;
      const rect = wrap.getBoundingClientRect();
      const vw = window.innerWidth || 1024;
      const vh = window.innerHeight || 768;
      const isMobile = vw <= 640;
      const popWidth = isMobile ? Math.min(326, vw - 4) : 320;
      const estimatedHeight = 408;

      let left = isMobile ? Math.round((vw - popWidth) / 2) : Math.round(rect.left);
      if (left + popWidth > vw - 2) left = Math.max(2, vw - popWidth - 2);
      if (left < 2) left = 2;

      let top = Math.round(rect.bottom + 6);
      if (top + estimatedHeight > vh - 8) {
        const aboveTop = Math.round(rect.top - estimatedHeight - 6);
        if (aboveTop >= 8) {
          top = aboveTop;
        } else {
          const maxAllowedTop = Math.max(8, vh - estimatedHeight - 8);
          top = Math.min(top, maxAllowedTop);
        }
      }

      setPopoverStyle({
        position: 'fixed',
        top: `${top}px`,
        left: `${left}px`,
        width: `${popWidth}px`,
      });
    };

    updatePosition();
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setIsOpen(false);
      }
    };
    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition, true);
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('touchstart', handleClickOutside);
    return () => {
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition, true);
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('touchstart', handleClickOutside);
    };
  }, [isOpen]);

  const defaultPlaceholder = isEn ? 'YYYY-MM-DD' : 'DD/MM/YYYY';

  const isDateDisabled = useCallback((iso) => {
    if (min && iso < min) return true;
    if (max && iso > max) return true;
    return false;
  }, [min, max]);

  const handleInputChange = (e) => {
    const raw = e.target.value;
    setInputValue(raw);

    if (raw === '') {
      setInputError(null);
      setLastEmittedValue('');
      onChange?.('');
      return;
    }

    const parsed = parseDisplayToIso(raw, isEn);
    if (parsed) {
      if (min && parsed < min) {
        setInputError('min');
        setLastEmittedValue(raw);
        onChange?.(raw);
      } else if (max && parsed > max) {
        setInputError('max');
        setLastEmittedValue(raw);
        onChange?.(raw);
      } else {
        setInputError(null);
        setLastEmittedValue(parsed);
        onChange?.(parsed);
      }
    } else {
      // Incomplete or invalid date:
      if (raw.trim().length >= 10) {
        setInputError('invalid');
      } else {
        // While actively typing partial date (length < 10), keep inline error quiet until blur
        setInputError(null);
      }
      // Inform parent that current input is raw string, so parent state does NOT retain old valid date
      setLastEmittedValue(raw);
      onChange?.(raw);
    }
  };

  const handleInputBlur = () => {
    const trimmed = inputValue.trim();
    if (!trimmed) {
      setInputError(null);
      setInputValue('');
      setLastEmittedValue('');
      onChange?.('');
      return;
    }

    const parsed = parseDisplayToIso(trimmed, isEn);
    if (parsed) {
      if (min && parsed < min) {
        setInputError('min');
        setLastEmittedValue(trimmed);
        onChange?.(trimmed);
      } else if (max && parsed > max) {
        setInputError('max');
        setLastEmittedValue(trimmed);
        onChange?.(trimmed);
      } else {
        setInputError(null);
        const formatted = formatIsoToDisplay(parsed, isEn);
        setInputValue(formatted);
        setLastEmittedValue(parsed);
        onChange?.(parsed);
      }
    } else {
      // Preserve invalid input so user can inspect and correct it; do not revert silently
      setInputError('invalid');
      setLastEmittedValue(trimmed);
      onChange?.(trimmed);
    }
  };

  const selectDate = (iso) => {
    if (isDateDisabled(iso)) return;
    setInputError(null);
    setLastEmittedValue(iso);
    onChange?.(iso);
    setInputValue(formatIsoToDisplay(iso, isEn));
    setIsOpen(false);
    inputRef.current?.focus();
  };

  const prevMonth = () => {
    if (navMonth === 0) {
      setNavMonth(11);
      setNavYear((y) => y - 1);
    } else {
      setNavMonth((m) => m - 1);
    }
  };

  const nextMonth = () => {
    if (navMonth === 11) {
      setNavMonth(0);
      setNavYear((y) => y + 1);
    } else {
      setNavMonth((m) => m + 1);
    }
  };

  // Keyboard navigation inside calendar
  const focusDayOnNextTick = (selector) => {
    const schedule = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : (cb) => setTimeout(cb, 0);
    schedule(() => {
      const targetBtn = calendarRef.current?.querySelector(selector);
      if (targetBtn && typeof targetBtn.focus === 'function') {
        targetBtn.focus();
      }
    });
  };

  const handleKeyDownCalendar = (e) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' && e.altKey) {
        e.preventDefault();
        setIsOpen(true);
        focusDayOnNextTick(
          `button.lv-datepicker-day[data-iso="${focusedDate}"], button.lv-datepicker-day:not(:disabled)`
        );
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      setIsOpen(false);
      inputRef.current?.focus();
      return;
    }

    const target = e.target;
    const dayButton = target?.closest?.('button.lv-datepicker-day');
    const isInput = target === inputRef.current;

    if (dayButton) {
      if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        e.preventDefault();
        const activeIso = dayButton.getAttribute('data-iso') || focusedDate || todayIso;
        const current = new Date(activeIso);
        const nextDate = new Date(current);

        if (e.key === 'ArrowLeft') nextDate.setDate(current.getDate() - 1);
        if (e.key === 'ArrowRight') nextDate.setDate(current.getDate() + 1);
        if (e.key === 'ArrowUp') nextDate.setDate(current.getDate() - 7);
        if (e.key === 'ArrowDown') nextDate.setDate(current.getDate() + 7);
        if (e.key === 'Home') nextDate.setDate(1);
        if (e.key === 'End') {
          const lastDay = new Date(Date.UTC(current.getFullYear(), current.getMonth() + 1, 0)).getUTCDate();
          nextDate.setDate(lastDay);
        }
        if (e.key === 'PageUp') nextDate.setMonth(current.getMonth() - 1);
        if (e.key === 'PageDown') nextDate.setMonth(current.getMonth() + 1);

        const nextIso = nextDate.toISOString().slice(0, 10);
        setFocusedDate(nextIso);
        setNavYear(nextDate.getFullYear());
        setNavMonth(nextDate.getMonth());
        focusDayOnNextTick(`button.lv-datepicker-day[data-iso="${nextIso}"]`);
      } else if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        e.stopPropagation();
        const dayIso = dayButton.getAttribute('data-iso') || focusedDate;
        if (dayIso && !isDateDisabled(dayIso)) {
          selectDate(dayIso);
        }
      }
      return;
    }

    if (isInput) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        focusDayOnNextTick(
          `button.lv-datepicker-day[data-iso="${focusedDate}"], button.lv-datepicker-day:not(:disabled)`
        );
      } else if (e.key === 'Enter') {
        e.preventDefault();
        handleInputBlur();
        const trimmed = inputValue.trim();
        const parsed = parseDisplayToIso(trimmed, isEn);
        if (!trimmed || (parsed && !isDateDisabled(parsed))) {
          setIsOpen(false);
        }
      }
    }
  };

  // Build calendar matrix
  const daysInMonth = new Date(Date.UTC(navYear, navMonth + 1, 0)).getUTCDate();
  const firstDayOfWeek = new Date(Date.UTC(navYear, navMonth, 1)).getUTCDay();
  const startOffset = (firstDayOfWeek + 6) % 7;

  const calendarCells = [];

  // Padding days from previous month
  const prevMonthDays = new Date(Date.UTC(navYear, navMonth, 0)).getUTCDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const d = prevMonthDays - i;
    const m = navMonth === 0 ? 12 : navMonth;
    const y = navMonth === 0 ? navYear - 1 : navYear;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, iso, currentMonth: false });
  }

  // Days of current month
  for (let d = 1; d <= daysInMonth; d++) {
    const iso = `${navYear}-${String(navMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, iso, currentMonth: true });
  }

  // Padding days for next month to complete grid (multiples of 7)
  const remaining = (7 - (calendarCells.length % 7)) % 7;
  for (let d = 1; d <= remaining; d++) {
    const m = navMonth === 11 ? 1 : navMonth + 2;
    const y = navMonth === 11 ? navYear + 1 : navYear;
    const iso = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    calendarCells.push({ day: d, iso, currentMonth: false });
  }

  const weekHeaders = isEn
    ? ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
    : ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];

  const monthNames = isEn
    ? ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
    : ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6', 'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];

  const yearRange = [];
  const currentYear = new Date().getFullYear();
  const minYear = min ? Number(min.slice(0, 4)) : currentYear - 110;
  const maxYear = max ? Number(max.slice(0, 4)) : currentYear + 20;
  for (let y = maxYear; y >= minYear; y--) {
    yearRange.push(y);
  }

  const todayIso = new Date().toISOString().slice(0, 10);

  const errorMessage = buildValidationMessage(inputError, { isEn, min, max });
  const effectiveDescribedBy = [ariaDescribedby, errorMessage ? errorId : null].filter(Boolean).join(' ') || undefined;

  return (
    <div
      ref={containerRef}
      className={`lv-datepicker-container ${className} ${disabled ? 'is-disabled' : ''} ${errorMessage ? 'has-error' : ''}`}
      onKeyDown={handleKeyDownCalendar}
    >
      <div className="lv-datepicker-input-wrap">
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onBlur={handleInputBlur}
          disabled={disabled}
          required={required}
          placeholder={placeholder || defaultPlaceholder}
          className={`lv-datepicker-input ${errorMessage ? 'is-invalid' : ''}`}
          aria-label={ariaLabel || (isEn ? 'Date input' : 'Nhập ngày')}
          aria-invalid={Boolean(ariaInvalid || errorMessage)}
          aria-describedby={effectiveDescribedBy}
          autoComplete="off"
        />
        {value && !disabled && (
          <button
            type="button"
            className="lv-datepicker-clear-btn"
            onClick={() => {
              setInputError(null);
              setInputValue('');
              setLastEmittedValue('');
              onChange?.('');
              inputRef.current?.focus();
            }}
            aria-label={isEn ? 'Clear date' : 'Xóa ngày'}
            title={isEn ? 'Clear date' : 'Xóa ngày'}
          >
            <XIcon size={14} aria-hidden="true" />
          </button>
        )}
        <button
          type="button"
          className="lv-datepicker-toggle-btn"
          onClick={() => {
            if (!disabled) setIsOpen((prev) => !prev);
          }}
          disabled={disabled}
          aria-haspopup="dialog"
          aria-expanded={isOpen}
          aria-label={isEn ? 'Choose date from calendar' : 'Chọn ngày từ lịch'}
          title={isEn ? 'Choose date' : 'Chọn ngày'}
        >
          <CalendarIcon size={16} aria-hidden="true" />
        </button>
      </div>

      {errorMessage && (
        <span id={errorId} className="lv-datepicker-error-msg" role="alert">
          {errorMessage}
        </span>
      )}

      {isOpen && (
        <div
          ref={calendarRef}
          className="lv-datepicker-popover"
          style={popoverStyle || undefined}
          role="dialog"
          aria-modal="true"
          aria-label={isEn ? 'Choose date' : 'Chọn ngày'}
        >
          {/* Header Month / Year Navigation */}
          <div className="lv-datepicker-header">
            <button
              type="button"
              className="lv-datepicker-nav-btn"
              onClick={prevMonth}
              aria-label={isEn ? 'Previous month' : 'Tháng trước'}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </button>

            <div className="lv-datepicker-title-group">
              <select
                className="lv-datepicker-select"
                value={navMonth}
                onChange={(e) => setNavMonth(Number(e.target.value))}
                aria-label={isEn ? 'Select month' : 'Chọn tháng'}
              >
                {monthNames.map((name, i) => (
                  <option key={i} value={i}>
                    {name}
                  </option>
                ))}
              </select>

              <select
                className="lv-datepicker-select"
                value={navYear}
                onChange={(e) => setNavYear(Number(e.target.value))}
                aria-label={isEn ? 'Select year' : 'Chọn năm'}
              >
                {yearRange.map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="lv-datepicker-nav-btn"
              onClick={nextMonth}
              aria-label={isEn ? 'Next month' : 'Tháng sau'}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </button>
          </div>

          {/* Weekday Labels */}
          <div className="lv-datepicker-weekdays" role="row">
            {weekHeaders.map((w, i) => (
              <span key={i} className="lv-datepicker-weekday" role="columnheader">
                {w}
              </span>
            ))}
          </div>

          {/* Days Grid */}
          <div className="lv-datepicker-grid" role="grid">
            {calendarCells.map((cell, idx) => {
              const isSelected = cell.iso === value;
              const isToday = cell.iso === todayIso;
              const isDisabled = isDateDisabled(cell.iso);
              const isFocused = cell.iso === focusedDate;

              return (
                <button
                  key={idx}
                  type="button"
                  data-iso={cell.iso}
                  tabIndex={isFocused ? 0 : -1}
                  disabled={isDisabled}
                  onClick={() => selectDate(cell.iso)}
                  className={`lv-datepicker-day ${!cell.currentMonth ? 'is-outside' : ''} ${
                    isSelected ? 'is-selected' : ''
                  } ${isToday ? 'is-today' : ''} ${isDisabled ? 'is-disabled' : ''}`}
                  aria-pressed={isSelected}
                  aria-label={`${cell.day} ${monthNames[navMonth]} ${navYear}`}
                >
                  {cell.day}
                </button>
              );
            })}
          </div>

          {/* Footer quick shortcuts */}
          <div className="lv-datepicker-footer">
            <button
              type="button"
              className="lv-datepicker-footer-btn"
              disabled={isDateDisabled(todayIso)}
              onClick={() => selectDate(todayIso)}
            >
              {isEn ? 'Today' : 'Hôm nay'}
            </button>
            <button
              type="button"
              className="lv-datepicker-footer-btn lv-datepicker-footer-btn--secondary"
              onClick={() => setIsOpen(false)}
            >
              {isEn ? 'Close' : 'Đóng'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default DatePicker;
