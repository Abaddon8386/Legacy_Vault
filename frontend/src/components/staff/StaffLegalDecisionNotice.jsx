/**
 * Đầu vào `decision` là dữ liệu đã được FE chuẩn hóa (không phải trường backend mới); quyết định của phiên bản cũ bị bỏ qua.
 * Thông báo khi Ban Pháp lý đã từ chối (`LEGAL_REJECTED`) đúng phiên bản hồ sơ hiện tại.
 * Chỉ hiển thị nếu quyết định thuộc cùng `caseId`, cùng `documentVersion` với `currentVersion` và có lý do;
 * ngược lại trả `null` (bỏ qua quyết định của phiên bản cũ). Nhắc Staff chỉ gửi thay đổi sau khi Legal yêu cầu bổ sung.
 *
 * @param {object} props
 * @param {object} props.decision quyết định đã được FE chuẩn hóa (không phải trường backend mới).
 * @param {string} props.caseId hồ sơ hiện tại.
 * @param {number} props.currentVersion phiên bản giấy tờ hiện tại.
 * @param {'vi'|'en'} [props.lang='vi'] ngôn ngữ.
 * @param {Function} [props.onViewHistory] mở lịch sử giấy tờ.
 * @returns {JSX.Element|null}
 */
export default function StaffLegalDecisionNotice({decision,caseId,currentVersion,lang='vi',onViewHistory}) {
  if(!decision||decision.caseId!==caseId||decision.documentVersion!==currentVersion||decision.decision!=='LEGAL_REJECTED'||typeof decision.reason!=='string'||!decision.reason.trim())return null;
  const en=lang==='en';
  return <section className="lv-distribution-context" role="status"><h2>{en?'Legal rejected this document version':'Legal đã từ chối phiên bản hồ sơ này'}</h2><p>{decision.reason}</p><p>{en?'Review the reason with Legal and prepare the requested corrections. Staff can submit changes only after Legal requests additional documents; do not start handover.':'Đối chiếu lý do với Legal và chuẩn bị nội dung cần sửa. Staff chỉ gửi thay đổi sau khi Legal yêu cầu bổ sung giấy tờ; chưa được thực hiện bàn giao.'}</p>{onViewHistory&&<button type="button" onClick={onViewHistory}>{en?'View document history':'Xem lịch sử giấy tờ'}</button>}</section>;
}
