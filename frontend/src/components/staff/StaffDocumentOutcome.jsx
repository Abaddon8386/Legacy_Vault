import './StaffDocumentOutcome.css';

const results = {
  MATCH: ['Đối chiếu khớp', 'Comparison matches', 'positive'],
  MISMATCH: ['Đối chiếu không khớp', 'Comparison does not match', 'negative'],
  INCONCLUSIVE: ['Chưa đủ cơ sở kết luận', 'Comparison inconclusive', 'warning'],
  LEGAL_APPROVED: ['Đã phê duyệt hồ sơ', 'Case approved', 'positive'],
  LEGAL_REJECTED: ['Đã từ chối phê duyệt', 'Approval rejected', 'negative'],
  APPROVE_DOCUMENTS: ['Đã chấp thuận giấy tờ', 'Documents accepted', 'positive'],
  REQUEST_DOCUMENT_SUPPLEMENTATION: ['Cần bổ sung giấy tờ', 'Additional documents required', 'warning'],
  APPROVE_ALLOCATIONS: ['Đã chấp thuận phân bổ', 'Allocations accepted', 'positive'],
  REQUEST_ALLOCATION_CHANGES: ['Cần sửa phân bổ', 'Allocation changes required', 'warning'],
  FRESH: ['Đã ghi nhận thẩm định', 'Assessment recorded', 'positive'],
  REVIEW_REQUIRED: ['Cần bổ sung hoặc thẩm định lại', 'Supplementation or reassessment required', 'warning'],
  COURT_VALID: ['Căn cứ Tòa án hợp lệ', 'Court evidence accepted', 'positive'],
  COURT_INVALID: ['Căn cứ Tòa án không hợp lệ', 'Court evidence rejected', 'negative'],
  COURT_INCONCLUSIVE: ['Chưa đủ cơ sở xác nhận căn cứ', 'Court evidence inconclusive', 'warning'],
};
function Outcome({ result, reason, at, en, children }) {
  const label = results[result];
  if (!label) return <p className="lv-staff-outcome-unavailable">{en ? 'Legal result could not be read.' : 'Chưa đọc được kết quả Legal.'}</p>;
  return <div className={`lv-staff-outcome is-${label[2]}`}>
    <strong>{label[en ? 1 : 0]}</strong>
    {reason && <p><strong>{en ? 'Legal’s reason: ' : 'Lý do của Ban Pháp lý: '}</strong>{reason}</p>}
    {at && <time dateTime={at}>{en ? 'Recorded: ' : 'Ghi nhận: '}{new Intl.DateTimeFormat(en ? 'en-GB' : 'vi-VN', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(at))}</time>}
    {children}
  </div>;
}

export function WillComparisonOutcome({ comparison, en = false }) {
  if (comparison === undefined) return <p className="lv-staff-outcome-unavailable">{en ? 'Comparison results are unavailable. Refresh the documents.' : 'Chưa có dữ liệu kết quả đối chiếu. Vui lòng cập nhật giấy tờ.'}</p>;
  if (comparison === null) return <div className="lv-staff-outcome"><strong>{en ? 'Awaiting Legal comparison' : 'Chờ Legal đối chiếu'}</strong></div>;
  return <Outcome result={comparison.result} reason={comparison.reason} at={comparison.comparedAt} en={en}>
    <p>{en ? 'Compared digital document: version ' : 'Bản di chúc số đã đối chiếu: phiên bản '}{comparison.digitalVersion}</p>
  </Outcome>;
}

export function BasisVersionOutcome({ version, en = false, compact = false }) {
  if (!version) return null;
  if (version.legalHistory === undefined) return <p className="lv-staff-outcome-unavailable">{en ? 'Legal results for this version are unavailable.' : 'Chưa có dữ liệu kết quả thẩm định của phiên bản này.'}</p>;
  if (!version.legalHistory.length) return <div className="lv-staff-outcome"><strong>{version.forwardStatus === 'FORWARDED'
    ? (en ? 'No Legal result recorded for this version yet' : 'Chưa ghi nhận kết quả thẩm định cho phiên bản này')
    : (en ? 'Not yet forwarded to Legal' : 'Chưa chuyển Ban Pháp lý')}</strong></div>;
  const latest = version.legalHistory[0];
  const final = version.legalHistory.find(entry => ['LEGAL_APPROVED', 'LEGAL_REJECTED'].includes(entry.result));
  const entries = compact ? [latest] : final && final.id !== latest.id ? [latest, final] : [latest];
  const otherEntries = version.legalHistory.filter(entry => !entries.includes(entry));
  const render = entry => <Outcome key={entry.id} result={entry.result} reason={entry.reason} at={entry.decidedAt} en={en}>
    {!entry.currentScope && <p className="lv-staff-outcome-history">{version.current === false
      ? (en ? 'Previous document version — historical result only.' : 'Phiên bản giấy tờ cũ — chỉ xem lịch sử.')
      : (en ? 'Allocations or case conditions have changed — historical result only.' : 'Phân bổ hoặc tình trạng hồ sơ đã thay đổi — chỉ xem lịch sử.')}</p>}
  </Outcome>;
  return <div className="lv-staff-version-outcomes" aria-label={en ? `Legal results for version ${version.version}` : `Kết quả thẩm định phiên bản ${version.version}`}>
    {entries.map(render)}
    {!compact && otherEntries.length > 0 && <details className="lv-staff-outcome-more"><summary>{en ? `View ${otherEntries.length} other processing results` : `Xem ${otherEntries.length} kết quả xử lý khác`}</summary>{otherEntries.map(render)}</details>}
  </div>;
}
