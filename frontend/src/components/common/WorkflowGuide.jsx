import { useId, useState } from 'react';
import { CheckCircle2, Circle, Clock3, LockKeyhole, ArrowRight, ChevronDown, ChevronUp } from 'lucide-react';
import './WorkflowGuide.css';

const icons = { done: CheckCircle2, waiting: Clock3, action: Circle, blocked: LockKeyhole };
export default function WorkflowGuide({ model, lang = 'vi', onNavigate, title, showNext = true, className = '', collapsible = false }) {
  const id = useId(), en = lang === 'en';
  const [showDoneOnMobile, setShowDoneOnMobile] = useState(false);
  const [open, setOpen] = useState(false);
  const labels = en ? { done: 'Complete', waiting: 'Waiting', action: 'To do', blocked: 'Not eligible' }
    : { done: 'Hoàn tất', waiting: 'Đang chờ', action: 'Cần làm', blocked: 'Chưa đủ điều kiện' };
  const link = (event, href) => { if (onNavigate && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); onNavigate(href); } };

  const doneSteps = model.steps.filter(item => item.state === 'done');
  const hasDoneSteps = doneSteps.length > 0;

  return <section className={`lv-workflow-guide ${className}${collapsible ? ' lv-workflow-guide--collapsible' : ''}`.trim()} aria-labelledby={id}>
    <div className="lv-workflow-guide__heading"><h2 id={id}>{title || (en ? 'Case progress' : 'Tiến trình xử lý')}</h2>
      <span className="lv-workflow-guide__count">{en ? `${doneSteps.length}/${model.steps.length} steps complete` : `${doneSteps.length}/${model.steps.length} bước hoàn tất`}</span>
    </div>
    <progress className="lv-workflow-guide__progress" value={doneSteps.length} max={Math.max(1,model.steps.length)}
      aria-label={en ? 'Completed workflow steps' : 'Số bước đã hoàn tất'}
      aria-valuetext={en ? `${doneSteps.length} of ${model.steps.length} steps complete` : `${doneSteps.length} trên ${model.steps.length} bước hoàn tất`} />

    {collapsible && (() => {
      const index = Math.max(0, model.steps.findIndex(item => item.id === model.current)), now = model.steps[index];
      const allDone = !model.loading && doneSteps.length === model.steps.length && model.steps.length > 0;
      return <div className="lv-workflow-guide__bar">
        <p>{allDone
          ? <><CheckCircle2 size={18} className="lv-workflow-guide__bar-icon" aria-hidden="true" /><strong>{title || (en ? 'Case progress' : 'Tiến trình xử lý')}</strong> · {en ? `${model.steps.length}/${model.steps.length} steps complete` : `${model.steps.length}/${model.steps.length} bước hoàn tất`}</>
          : <><strong>{en ? `Step ${index + 1} of ${model.steps.length}` : `Bước ${index + 1}/${model.steps.length}`}</strong> · {now.label} · {now.statusLabel || labels[now.state]}</>}</p>
        <button type="button" onClick={() => setOpen(v => !v)} aria-expanded={open} aria-controls={`${id}-steps`}>
          {open ? (en ? 'Hide steps' : 'Thu gọn') : (en ? 'Show steps' : 'Xem các bước')}
          {open ? <ChevronUp size={16} aria-hidden="true" /> : <ChevronDown size={16} aria-hidden="true" />}
        </button>
      </div>;
    })()}

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

    <ol id={`${id}-steps`} hidden={collapsible && !open}>{model.steps.map((item, index) => {
      const Icon = icons[item.state] || Circle;
      const isDone = item.state === 'done';
      const content = <><span className="lv-workflow-guide__number" aria-hidden="true">{item.state === 'done' ? <Icon size={18} /> : index + 1}</span><span className="lv-workflow-guide__label">{item.label}<small><Icon size={14} aria-hidden="true" />{item.statusLabel || labels[item.state]}</small>{item.id === model.current && <span className="lv-workflow-guide__view-label">{en ? 'Viewing' : 'Đang xem'}</span>}</span></>;
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
