import { useId, useState } from 'react';
import { CheckCircle2, Circle, Clock3, LockKeyhole, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import './WorkflowGuide.css';

const icons = { done: CheckCircle2, waiting: Clock3, action: Circle, blocked: LockKeyhole };
export default function WorkflowGuide({ model, lang = 'vi', onNavigate, title, showNext = true }) {
  const id = useId(), en = lang === 'en';
  const [showDoneOnMobile, setShowDoneOnMobile] = useState(false);
  const labels = en ? { done: 'Complete', waiting: 'Waiting', action: 'To do', blocked: 'Not eligible' }
    : { done: 'Hoàn tất', waiting: 'Đang chờ', action: 'Cần làm', blocked: 'Chưa đủ điều kiện' };
  const link = (event, href) => { if (onNavigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(href); } };

  const doneSteps = model.steps.filter(item => item.state === 'done');
  const hasDoneSteps = doneSteps.length > 0;

  return <section className="lv-workflow-guide" aria-labelledby={id}>
    <h2 id={id}>{title || (en ? 'Case progress' : 'Tiến trình xử lý')}</h2>

    {hasDoneSteps && (
      <div className="lv-workflow-guide__done-bar">
        <button
          type="button"
          className="lv-workflow-guide__done-toggle"
          onClick={() => setShowDoneOnMobile(v => !v)}
          aria-expanded={showDoneOnMobile}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
            <CheckCircle2 size={16} className="lv-workflow-guide__done-icon" aria-hidden="true" />
            <span>{en ? `${doneSteps.length} step${doneSteps.length > 1 ? 's' : ''} completed` : `${doneSteps.length} bước đã hoàn tất`}</span>
          </span>
          <span className="lv-workflow-guide__done-action">
            {showDoneOnMobile ? (en ? 'Collapse' : 'Thu gọn') : (en ? 'View details' : 'Xem chi tiết')}
            {showDoneOnMobile ? <ChevronUp size={14} aria-hidden="true" /> : <ChevronDown size={14} aria-hidden="true" />}
          </span>
        </button>
      </div>
    )}

    <ol>{model.steps.map((item, index) => {
      const Icon = icons[item.state] || Circle;
      const isDone = item.state === 'done';
      const content = <><span className="lv-workflow-guide__number" aria-hidden="true">{item.state === 'done' ? <Icon size={18} /> : index + 1}</span><span className="lv-workflow-guide__label">{item.label}<small><Icon size={13} aria-hidden="true" />{item.statusLabel || labels[item.state]}</small></span></>;
      return <li key={item.id} className={`is-${item.state}${isDone && !showDoneOnMobile ? ' is-done-mobile-hidden' : ''}`} aria-current={item.id === model.current ? 'step' : undefined}>
        {item.href ? <a href={item.href} onClick={event => link(event, item.href)}>{content}</a> : <span className="lv-workflow-guide__step">{content}</span>}
      </li>;
    })}</ol>
    {showNext && <div className="lv-workflow-guide__next"><p role="status">{model.message}</p>
      {model.next?.href && <a href={model.next.href} onClick={event => link(event, model.next.href)}>{model.next.label}<ArrowRight size={16} aria-hidden="true" /></a>}
    </div>}
  </section>;
}

export function WorkflowActionHint({ id, reason }) {
  return reason ? <p id={id} className="lv-workflow-action-hint"><LockKeyhole size={15} aria-hidden="true" />{reason}</p> : null;
}
