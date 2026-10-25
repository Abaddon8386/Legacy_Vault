import { useId } from 'react';
import { Info, CheckCircle2, AlertTriangle, CircleAlert } from 'lucide-react';
import './FeedbackNotice.css';

const icons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: CircleAlert };

/** Present feedback supplied by the caller; never infer permissions or API state. */
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
