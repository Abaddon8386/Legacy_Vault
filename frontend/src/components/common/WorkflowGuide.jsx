import { useId } from 'react';
import { CheckCircle2, Circle, Clock3, LockKeyhole, ArrowRight } from 'lucide-react';
import './WorkflowGuide.css';

const icons = { done: CheckCircle2, waiting: Clock3, action: Circle, blocked: LockKeyhole };
export default function WorkflowGuide({ model, lang = 'vi', onNavigate }) {
  const id = useId(), en = lang === 'en';
  const labels = en ? { done: 'Complete', waiting: 'Waiting', action: 'To do', blocked: 'Not eligible' }
    : { done: 'Hoàn tất', waiting: 'Đang chờ', action: 'Cần làm', blocked: 'Chưa đủ điều kiện' };
  const link = (event, href) => { if (onNavigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(href); } };
  return <section className="lv-workflow-guide" aria-labelledby={id}>
    <h2 id={id}>{en ? 'Case progress' : 'Tiến trình xử lý'}</h2>
    <ol>{model.steps.map((item, index) => {
      const Icon = icons[item.state] || Circle;
      const content = <><span className="lv-workflow-guide__number" aria-hidden="true">{item.state === 'done' ? <Icon size={18} /> : index + 1}</span><span className="lv-workflow-guide__label">{item.label}<small><Icon size={13} aria-hidden="true" />{item.statusLabel || labels[item.state]}</small></span></>;
      return <li key={item.id} className={`is-${item.state}`} aria-current={item.id === model.current ? 'step' : undefined}>
        {item.href ? <a href={item.href} onClick={event => link(event, item.href)}>{content}</a> : <span className="lv-workflow-guide__step">{content}</span>}
      </li>;
    })}</ol>
    <div className="lv-workflow-guide__next"><p role="status">{model.message}</p>
      {model.next?.href && <a href={model.next.href} onClick={event => link(event, model.next.href)}>{model.next.label}<ArrowRight size={16} aria-hidden="true" /></a>}
    </div>
  </section>;
}

export function WorkflowActionHint({ id, reason }) {
  return reason ? <p id={id} className="lv-workflow-action-hint"><LockKeyhole size={15} aria-hidden="true" />{reason}</p> : null;
}
