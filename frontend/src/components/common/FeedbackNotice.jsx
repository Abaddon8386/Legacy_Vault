import { useId } from 'react';
import { Info, CheckCircle2, AlertTriangle, CircleAlert } from 'lucide-react';
import './FeedbackNotice.css';

/**
 * Icon theo loại thông báo (info, success, warning, error).
 */
const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: CircleAlert };

/**
 * Hộp thông báo phản hồi do bên gọi cung cấp (không suy luận quyền hay trạng thái API). Lỗi dùng {@code role="alert"}, các loại khác dùng {@code role="status"}.
 *
 * @param {object} props
 * @param {('info'|'success'|'warning'|'error')} [props.tone='info']
 * @param {string} [props.title] Tiêu đề.
 * @param {*} [props.children] Nội dung.
 * @param {*} [props.action] Phần tử hành động (nút/liên kết).
 * @param {string} [props.className]
 * @param {string} [props.id]
 */
export default function FeedbackNotice({
  tone = 'info', title, children, action, className = '', id,
}) {
  const titleId = useId();
  const resolvedTone = Object.hasOwn(icons, tone) ? tone : 'info';
  const Icon = icons[resolvedTone];

  return (
    <div
      id={id}
      className={`lv-feedback lv-feedback--${resolvedTone} ${className}`.trim()}
      role={resolvedTone === 'error' ? 'alert' : 'status'}
      aria-labelledby={title ? titleId : undefined}
    >
      <Icon className="lv-feedback__icon" size={20} aria-hidden="true" />
      <div className="lv-feedback__content">
        {title && <p id={titleId} className="lv-feedback__title">{title}</p>}
        {children && <div className="lv-feedback__message">{children}</div>}
      </div>
      {action && <div className="lv-feedback__action">{action}</div>}
    </div>
  );
}
