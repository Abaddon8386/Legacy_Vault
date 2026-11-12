import { useRef, useCallback } from 'react';
import './MagneticButton.css';

/**
 * MagneticButton — Henedo Cursor-Reactive Button Component
 *
 * Creates a subtle, elegant magnetic pull effect toward the cursor
 * within the button boundary (2–5px translation), elevating shadow
 * and highlight while maintaining crisp active press and keyboard accessibility.
 *
 * Thông số: {@code magneticStrength} (hệ số kéo theo con trỏ, mặc định 0.2) và {@code maxOffset} (độ lệch tối đa px, mặc định 5).
 * Nút đặt biến CSS {@code --btn-x}/{@code --btn-y} theo vị trí con trỏ, bỏ qua khi {@code disabled} hoặc người dùng chọn giảm chuyển động.
 */
export default function MagneticButton({
  children,
  className = '',
  onClick,
  disabled = false,
  type = 'button',
  magneticStrength = 0.2,
  maxOffset = 5,
  ...rest
}) {
  const buttonRef = useRef(null);

  /**
   * Tính độ lệch của nút theo vị trí con trỏ so với tâm nút (giới hạn bởi maxOffset) và ghi vào biến CSS.
   */
  const handleMouseMove = useCallback(
    (e) => {
      if (disabled) return;
      if (
        typeof window !== 'undefined' &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
      ) {
        return;
      }
      const btn = buttonRef.current;
      if (!btn) return;
      const rect = btn.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const deltaX = (e.clientX - centerX) * magneticStrength;
      const deltaY = (e.clientY - centerY) * magneticStrength;

      const clampedX = Math.max(-maxOffset, Math.min(maxOffset, deltaX));
      const clampedY = Math.max(-maxOffset, Math.min(maxOffset, deltaY));

      btn.style.setProperty('--btn-x', `${clampedX.toFixed(2)}px`);
      btn.style.setProperty('--btn-y', `${clampedY.toFixed(2)}px`);
    },
    [disabled, magneticStrength, maxOffset]
  );

  /**
   * Đưa nút về vị trí gốc khi con trỏ rời đi.
   */
  const handleMouseLeave = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    btn.style.setProperty('--btn-x', '0px');
    btn.style.setProperty('--btn-y', '0px');
  }, []);

  return (
    <button
      ref={buttonRef}
      type={type}
      className={`lv-magnetic-btn ${className}`}
      onClick={onClick}
      disabled={disabled}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      {...rest}
    >
      <span className="lv-magnetic-btn-inner">{children}</span>
    </button>
  );
}
