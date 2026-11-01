// FE adapter input, not an invented backend field. Ignore decisions from older document versions.
export default function StaffLegalDecisionNotice({decision,caseId,currentVersion,lang='vi',onViewHistory}) {
  if(!decision||decision.caseId!==caseId||decision.documentVersion!==currentVersion||decision.decision!=='LEGAL_REJECTED'||typeof decision.reason!=='string'||!decision.reason.trim())return null;
  const en=lang==='en';
  return <section className="lv-distribution-context" role="status"><h2>{en?'Legal rejected this document version':'Legal đã từ chối phiên bản hồ sơ này'}</h2><p>{decision.reason}</p><p>{en?'Review the reason with Legal and prepare the requested corrections. Staff can submit changes only after Legal opens the document or allocation correction step; do not start handover.':'Đối chiếu lý do với Legal và chuẩn bị nội dung cần sửa. Staff chỉ gửi thay đổi sau khi Legal mở bước bổ sung giấy tờ hoặc sửa phân bổ; chưa được thực hiện bàn giao.'}</p>{onViewHistory&&<button type="button" onClick={onViewHistory}>{en?'View document history':'Xem lịch sử giấy tờ'}</button>}</section>;
}
