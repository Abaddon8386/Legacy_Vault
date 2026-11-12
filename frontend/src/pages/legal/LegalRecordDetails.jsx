/**
 * Danh sách thông tin dạng định nghĩa (dl/dt/dd) dùng để hiển thị các cặp "tên - giá trị" của hồ sơ pháp lý (LegalFinalDecision, LegalLiveWorkflow).
 *
 * @param {{rows: Array<[string, *]>}} props rows là mảng cặp [nhãn, giá trị]; giá trị null/undefined hiển thị dấu "—".
 * @returns {JSX.Element} Thẻ dl.
 */
export function LegalRecordDetails({ rows }) {
  return <dl className="lv-legal-facts">{rows.map(([name, value]) => <div key={name}><dt>{name}</dt><dd>{value ?? '—'}</dd></div>)}</dl>;
}
