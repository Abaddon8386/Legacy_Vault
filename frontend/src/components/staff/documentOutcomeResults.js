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

export function versionOutcomeChip(version, en = false) {
  const latest = version?.legalHistory?.[0];
  const label = latest && outcomeResults[latest.result];
  if (!label) return null;
  const short = chipLabels[latest.result];
  return { label: (short || label)[en ? 1 : 0], tone: label[2] };
}

