import './Button.css'

/**
 * Nút bấm dùng chung của toàn ứng dụng, với các biến thể và trạng thái đang tải.
 *
 * @param {object} props
 * @param {*} props.children Nội dung nút.
 * @param {('primary'|'secondary'|'danger'|'ghost')} [props.variant='primary'] Kiểu nút.
 * @param {('sm'|'md'|'lg')} [props.size='md'] Kích thước.
 * @param {boolean} [props.isLoading=false] Hiện spinner, khóa nút và đặt {@code aria-busy}.
 * @param {boolean} [props.disabled=false] Khóa nút.
 * @param {string} [props.className] Class bổ sung.
 * @param {string} [props.type='button'] Kiểu HTML của nút.
 * @param {Function} [props.onClick] Xử lý bấm. Các props còn lại được truyền thẳng vào {@code <button>}.
 */
export function Button({
  children,
  variant = 'primary', // 'primary' | 'secondary' | 'danger' | 'ghost'
  size = 'md', // 'sm' | 'md' | 'lg'
  isLoading = false,
  disabled = false,
  className = '',
  type = 'button',
  onClick,
  ...rest
}) {
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled || isLoading}
      aria-busy={isLoading || rest['aria-busy']}
      onClick={onClick}
      className={`lv-btn lv-btn--${variant} lv-btn--${size} ${isLoading ? 'lv-btn--loading' : ''} ${className}`}
    >
      {isLoading && <span className="lv-btn__spinner" aria-hidden="true" />}
      <span className="lv-btn__content">{children}</span>
    </button>
  )
}
