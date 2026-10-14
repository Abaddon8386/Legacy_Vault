import './Button.css'

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
      type={type}
      disabled={disabled || isLoading}
      onClick={onClick}
      className={`lv-btn lv-btn--${variant} lv-btn--${size} ${isLoading ? 'lv-btn--loading' : ''} ${className}`}
      {...rest}
    >
      {isLoading && <span className="lv-btn__spinner" aria-hidden="true" />}
      <span className="lv-btn__content">{children}</span>
    </button>
  )
}
