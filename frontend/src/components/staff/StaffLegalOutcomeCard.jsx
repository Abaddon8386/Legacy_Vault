import { AlertTriangle, CheckCircle2, History, XCircle } from 'lucide-react';
import { BasisVersionOutcome } from './StaffDocumentOutcome.jsx';
import { outcomeResults, versionOutcomeChip } from './documentOutcomeResults.js';
import './StaffLegalOutcomeCard.css';

const icons = { positive: CheckCircle2, negative: XCircle, warning: AlertTriangle, history: History };

// The latest Legal decision on a document version, drawn as a flat verdict band (not an information card).
export default function StaffLegalOutcomeCard({ version, en = false }) {
  const latest = version?.legalHistory?.[0];
  const chip = versionOutcomeChip(version, en);
  const title = en ? 'Decision from the Legal Department' : 'Quyết định của Ban Pháp lý';
  if (!latest || !outcomeResults[latest.result] || !chip) {
    return <section className="lv-dossier-card lv-staff-glow" aria-labelledby="legal-outcome-heading">
      <div className="lv-dossier-card__header"><h2 id="legal-outcome-heading">{title}</h2></div>
      <BasisVersionOutcome version={version} en={en} compact />
    </section>;
  }
  const Icon = icons[chip.tone] || AlertTriangle;
  const recorded = latest.decidedAt && new Intl.DateTimeFormat(en ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(latest.decidedAt));
  return <section className={`lv-staff-legal-outcome is-${chip.tone}`} aria-label={title}>
    <Icon className="lv-staff-legal-outcome__icon" size={28} aria-hidden="true" />
    <div className="lv-staff-legal-outcome__body">
      <p className="lv-staff-legal-outcome__label">{title}</p>
      <p className="lv-staff-legal-outcome__verdict">{chip.stale ? `${chip.resultLabel} · ${en ? 'no longer current' : 'không còn hiệu lực'}` : chip.label}</p>
      {latest.reason && <p className="lv-staff-legal-outcome__reason"><span>{en ? 'Reason: ' : 'Lý do: '}</span>{latest.reason}</p>}
      {!latest.currentScope && <p className="lv-staff-legal-outcome__history">{version.current === false
        ? (en ? 'Previous document version — historical result only.' : 'Phiên bản giấy tờ cũ — chỉ xem lịch sử.')
        : (en ? 'Allocations or case conditions have changed — historical result only.' : 'Phân bổ hoặc tình trạng hồ sơ đã thay đổi — chỉ xem lịch sử.')}</p>}
    </div>
    {recorded && <time className="lv-staff-legal-outcome__time" dateTime={latest.decidedAt}>{recorded}</time>}
  </section>;
}

