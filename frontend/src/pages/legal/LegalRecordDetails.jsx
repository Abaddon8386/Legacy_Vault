import { useState } from 'react';

export function LegalRecordDetails({ rows }) {
  return <dl className="lv-legal-facts">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}

export function LegalTechnicalDetails({ rows, en }) {
  const [message, setMessage] = useState('');
  const visibleRows = rows.filter(([, value]) => (typeof value === 'string' && value.length > 0) || typeof value === 'number');
  async function copy(value) {
    try { await navigator.clipboard.writeText(String(value)); setMessage(en ? 'Copied.' : 'Đã sao chép.'); }
    catch { setMessage(en ? 'Unable to copy. Select and copy the value below.' : 'Chưa sao chép được. Hãy chọn và sao chép thông tin bên dưới.'); }
  }
  if (!visibleRows.length) return null;
  return <details className="lv-legal-technical"><summary>{en ? 'Technical details' : 'Chi tiết kỹ thuật'}</summary>
    {visibleRows.map(([name, value]) => <div key={name}><span>{name}</span><code>{value}</code>
      <button type="button" onClick={() => copy(value)} aria-label={`${en ? 'Copy' : 'Sao chép'} ${name}`}>{en ? 'Copy' : 'Sao chép'}</button></div>)}
    <p role="status">{message}</p>
  </details>;
}
