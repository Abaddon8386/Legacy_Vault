export function LegalRecordDetails({ rows }) {
  return <dl className="lv-legal-facts">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}
