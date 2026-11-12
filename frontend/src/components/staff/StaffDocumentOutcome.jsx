import './StaffDocumentOutcome.css';
import { outcomeResults as results } from './documentOutcomeResults.js';

/**
 * Khối hiển thị một kết quả của Ban Pháp lý: nhãn kết quả (tra trong `outcomeResults`),
 * lý do và thời điểm ghi nhận. Nếu mã `result` không hợp lệ thì báo "Chưa đọc được kết quả Legal".
 *
 * @param {object} props
 * @param {string} props.result mã kết quả (ví dụ `LEGAL_APPROVED`, `MATCH`).
 * @param {string} [props.reason] lý do Legal đưa ra.
 * @param {string} [props.at] thời điểm ISO-8601.
 * @param {boolean} props.en true để hiển thị tiếng Anh.
 * @param {React.ReactNode} [props.children] nội dung phụ nối thêm.
 */
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

/**
 * Hiển thị kết quả Legal đối chiếu di chúc giấy với bản di chúc số.
 * `comparison === undefined`: chưa có dữ liệu (báo cập nhật lại); `null`: đang chờ Ban Pháp lý đối chiếu;
 * ngược lại hiện kết quả cùng phiên bản bản số đã đối chiếu (`digitalVersion`).
 *
 * @param {object} props
 * @param {object|null|undefined} props.comparison `{result, reason, comparedAt, digitalVersion}`.
 * @param {boolean} [props.en=false] tiếng Anh.
 */
export function WillComparisonOutcome({ comparison, en = false }) {
  if (comparison === undefined) return <p className="lv-staff-outcome-unavailable">{en ? 'Comparison results are unavailable. Refresh the documents.' : 'Chưa có dữ liệu kết quả đối chiếu. Vui lòng cập nhật giấy tờ.'}</p>;
  if (comparison === null) return <div className="lv-staff-outcome"><strong>{en ? 'Awaiting Legal comparison' : 'Chờ Ban Pháp lý đối chiếu'}</strong></div>;
  return <Outcome result={comparison.result} reason={comparison.reason} at={comparison.comparedAt} en={en}>
    <p>{en ? 'Compared digital document: version ' : 'Bản di chúc số đã đối chiếu: phiên bản '}{comparison.digitalVersion}</p>
  </Outcome>;
}

/**
 * Hiển thị lịch sử kết quả thẩm định (`legalHistory`) của một phiên bản căn cứ/giấy tờ.
 * Chế độ thường hiện kết quả mới nhất, kèm quyết định cuối cùng (phê duyệt/từ chối) nếu khác,
 * các kết quả còn lại gom vào mục "Xem N kết quả xử lý khác". Chế độ `compact` chỉ hiện kết quả mới nhất.
 * Kết quả không còn đúng phạm vi hiện tại (`currentScope` false) được ghi chú là chỉ để xem lịch sử.
 *
 * @param {object} props
 * @param {object|null} props.version phiên bản giấy tờ (`version`, `current`, `forwardStatus`, `legalHistory`).
 * @param {boolean} [props.en=false] tiếng Anh.
 * @param {boolean} [props.compact=false] chỉ hiện kết quả mới nhất.
 * @returns {JSX.Element|null}
 */
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
