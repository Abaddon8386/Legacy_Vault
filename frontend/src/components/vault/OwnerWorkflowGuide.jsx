import { useEffect, useId, useRef, useState } from 'react';
import { Check } from 'lucide-react';
import { fetchVault } from '../../utils/vaultService.js';
import { fetchVaultSummary } from '../../utils/vaultSummaryService.js';
import { willService } from '../../utils/willService.js';
import { ownerWorkflow } from '../../utils/ownerWorkflow.js';
import './OwnerWorkflowGuide.css';

export default function OwnerWorkflowGuide({ accessToken, ownerId, lang, refreshKey, route, onNavigate, onUnauthorized }) {
  const [revision, setRevision] = useState(0);
  const [state, setState] = useState(null);
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null), buttonRef = useRef(null), panelId = useId();
  const key = [accessToken, ownerId, lang, refreshKey, route, revision].join('|');
  useEffect(() => {
    const controller = new AbortController();
    const options = { accessToken, ownerId, lang, signal: controller.signal };
    (async () => {
      try {
        const vault = await fetchVault(options);
        let summary, wills;
        if (vault) {
          const results = await Promise.allSettled([fetchVaultSummary(vault.id, options), willService.getWills(vault.id, { ...options, size: 1 })]);
          const unauthorized = results.find(r => r.status === 'rejected' && r.reason.status === 401);
          if (unauthorized) throw unauthorized.reason;
          summary = results[0].status === 'fulfilled' ? results[0].value : undefined;
          wills = results[1].status === 'fulfilled' ? results[1].value.totalElements : undefined;
        }
        if (!controller.signal.aborted) setState({ key, vault, summary, wills });
      } catch (error) {
        if (!controller.signal.aborted) {
          if (error.status === 401) onUnauthorized?.();
          setState({ key, error: true });
        }
      }
    })();
    return () => controller.abort();
  }, [accessToken, ownerId, lang, key, onUnauthorized]);
  useEffect(() => {
    if (!open) return undefined;
    const onPointer = event => { if (!rootRef.current?.contains(event.target)) setOpen(false); };
    const onKey = event => { if (event.key === 'Escape') { setOpen(false); buttonRef.current?.focus(); } };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey); };
  }, [open]);

  const loading = state?.key !== key, en = lang === 'en';
  const model = ownerWorkflow({ ...(loading ? {} : state), loading, lang });
  const total = model.steps.length, done = model.steps.filter(item => item.state === 'done').length;
  const complete = !loading && total > 0 && done === total;
  const title = en ? 'Vault setup' : 'Thiết lập kho';
  const label = loading ? (en ? 'Checking setup…' : 'Đang kiểm tra…') : complete ? (en ? 'Setup complete' : 'Đã thiết lập xong') : `${title} · ${done}/${total}`;
  const radius = 11, circumference = 2 * Math.PI * radius;
  const go = (event, href) => {
    if (onNavigate && href && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey) { event.preventDefault(); setOpen(false); onNavigate(href); }
  };
  return <div className="lv-owner-workflow" ref={rootRef}>
    {open && <div className="lv-owner-workflow__panel" id={panelId} role="region" aria-label={title}>
      <ol>{model.steps.map((item, index) => {
        const status = item.statusLabel || (item.state === 'done' ? (en ? 'Complete' : 'Hoàn tất') : item.state === 'blocked' ? (en ? 'Not eligible' : 'Chưa đủ điều kiện') : item.state === 'waiting' ? (en ? 'Waiting' : 'Đang chờ') : (en ? 'To do' : 'Cần làm'));
        const content = <><span className="lv-owner-workflow__mark" aria-hidden="true">{item.state === 'done' ? <Check size={14} strokeWidth={3} /> : index + 1}</span><span className="lv-owner-workflow__step-text">{item.label}<small>{status}</small></span></>;
        return <li key={item.id} className={`is-${item.state}`} aria-current={item.id === model.current ? 'step' : undefined}>
          {item.href ? <a href={item.href} onClick={event => go(event, item.href)}>{content}</a> : <span>{content}</span>}
        </li>;
      })}</ol>
      <button type="button" className="lv-owner-workflow__reload" disabled={loading} onClick={() => setRevision(n => n + 1)}>{en ? 'Reload status' : 'Tải lại trạng thái'}</button>
    </div>}
    <button type="button" ref={buttonRef} className="lv-owner-workflow__trigger" aria-expanded={open} aria-controls={open ? panelId : undefined} onClick={() => setOpen(value => !value)}>
      <svg className={`lv-owner-workflow__ring${complete ? ' is-complete' : ''}`} width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
        <circle cx="14" cy="14" r={radius} className="lv-owner-workflow__ring-track" />
        <circle cx="14" cy="14" r={radius} className="lv-owner-workflow__ring-value" strokeDasharray={`${total ? circumference * done / total : 0} ${circumference}`} transform="rotate(-90 14 14)" />
      </svg>
      <span>{label}</span>
    </button>
  </div>;
}
