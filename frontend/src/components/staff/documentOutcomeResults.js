/**
 * Bảng tra kết quả xử lý của Ban Pháp lý (Legal) đối với giấy tờ/phân bổ/di chúc.
 * Khóa là mã kết quả backend trả về (`result` trong `legalHistory` hoặc `comparison`);
 * giá trị là bộ ba `[nhãn tiếng Việt, nhãn tiếng Anh, tông màu]` với tông màu thuộc
 * `positive | negative | warning`. Được dùng bởi `StaffDocumentOutcome.jsx`,
 * `StaffLegalOutcomeCard.jsx` và hàm `versionOutcomeChip`.
 */
export const outcomeResults = {
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

/**
 * Nhãn ngắn (vi, en) dùng cho chip hiển thị trên thanh ngữ cảnh hồ sơ.
 * Nếu mã kết quả không có ở đây thì `versionOutcomeChip` dùng nhãn dài trong `outcomeResults`.
 */
const chipLabels = {
  LEGAL_APPROVED: ['Đã phê duyệt', 'Approved'],
  LEGAL_REJECTED: ['Bị từ chối', 'Rejected'],
  APPROVE_DOCUMENTS: ['Giấy tờ đã duyệt', 'Documents accepted'],
  APPROVE_ALLOCATIONS: ['Phân bổ đã duyệt', 'Allocations accepted'],
  REQUEST_DOCUMENT_SUPPLEMENTATION: ['Cần bổ sung', 'Needs more documents'],
  REQUEST_ALLOCATION_CHANGES: ['Cần sửa phân bổ', 'Changes required'],
  REVIEW_REQUIRED: ['Cần thẩm định lại', 'Reassessment required'],
  FRESH: ['Đã thẩm định', 'Assessed'],
};

/**
 * Tạo dữ liệu chip kết quả thẩm định mới nhất của một phiên bản giấy tờ.
 * Lấy phần tử đầu của `version.legalHistory` (mới nhất), tra trong `outcomeResults`.
 * Nếu kết quả đã hết hiệu lực (`currentScope === false` hoặc `version.current === false`)
 * thì trả chip tông `history` với nhãn "Kết quả cũ" để không bị nhầm với kết quả hiện hành.
 *
 * @param {object} version phiên bản giấy tờ có mảng `legalHistory` (dữ liệu từ API staff legal-documents).
 * @param {boolean} [en=false] true để dùng nhãn tiếng Anh.
 * @returns {{label: string, tone: string, stale: boolean, resultLabel: string}|null}
 *   null khi chưa có kết quả hoặc mã kết quả không được biết.
 */
export function versionOutcomeChip(version, en = false) {
  const latest = version?.legalHistory?.[0];
  const label = latest && outcomeResults[latest.result];
  if (!label) return null;
  const short = (chipLabels[latest.result] || label)[en ? 1 : 0];
  // A result that no longer applies (old scope or older document version) must not look like the current one.
  const stale = latest.currentScope === false || version.current === false;
  return stale
    ? { label: en ? 'Previous result' : 'Kết quả cũ', tone: 'history', stale: true, resultLabel: short }
    : { label: short, tone: label[2], stale: false, resultLabel: short };
}

