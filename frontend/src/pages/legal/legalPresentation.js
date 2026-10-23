const labels = {
  ACTIVE: ['Đang hoạt động', 'Active'], HANDOVER_IN_PROGRESS: ['Đang bàn giao tài sản', 'Asset handover in progress'],
  OPEN: ['Đang xử lý', 'In progress'], CLOSED: ['Đã đóng', 'Closed'], ARCHIVED: ['Đã lưu trữ', 'Archived'],
  AWAITING_VERIFICATION: ['Chờ xác minh giấy tờ', 'Awaiting verification'], DOCUMENT_VERIFICATION: ['Đang kiểm tra giấy tờ', 'Document verification'],
  WILL_VERIFICATION: ['Đang đối chiếu di chúc', 'Will comparison'], AWAITING_LEGAL_BASIS: ['Chờ hồ sơ pháp lý', 'Awaiting legal documents'],
  LEGAL_BASIS_VERIFICATION: ['Đang thẩm định pháp lý', 'Legal review'], UNLOCKED: ['Đã mở khóa', 'Unlocked'],
  COMPLETED: ['Đã hoàn tất', 'Completed'], ON_HOLD: ['Tạm dừng xử lý', 'On hold'],
  VALID: ['Hợp lệ', 'Valid'], INVALID: ['Không hợp lệ', 'Invalid'], INCONCLUSIVE: ['Chưa đủ cơ sở', 'Inconclusive'],
};
export const legalStatus = (value, en = false) => labels[value]?.[en ? 1 : 0] || (en ? 'Not yet determined' : 'Chưa xác định');
export const legalReadOnly = context => ['CLOSED', 'ARCHIVED', 'COMPLETED'].includes(context.caseStatus)
  || ['CLOSED', 'ARCHIVED', 'COMPLETED', 'UNLOCKED', 'HANDOVER_IN_PROGRESS'].includes(context.vaultStatus);
const blockers = {
  LEGAL_APPROVAL_REQUIRED: ['Cần chuyên viên pháp lý phê duyệt hồ sơ trước khi mở khóa.', 'A Legal verifier must approve this case before unlocking.', 'approval-review'],
  LEGAL_DECISION_STALE: ['Giấy tờ hoặc thông tin phân chia đã thay đổi. Chuyên viên pháp lý cần thẩm định lại phiên bản hiện tại.', 'Documents or allocations changed. A Legal verifier must review the current version.', 'dossier-review'],
  LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ đang tạm dừng. Chuyên viên pháp lý cần kiểm tra lý do và điều kiện tiếp tục.', 'This case is on hold. A Legal verifier must review the reason and conditions for resuming.', 'dossier-review'],
  COURT_DECISION_REQUIRED: ['Chưa có kết luận hợp lệ cho quyết định tòa án. Chuyên viên pháp lý cần hoàn tất thẩm định.', 'A Legal verifier must complete the court decision assessment.', 'dossier-review'],
  BASIS_DOSSIER_INVALID_STATE: ['Hồ sơ pháp lý chưa đủ điều kiện. Kiểm tra giấy tờ và phiên bản đã được nhân viên chuyển thẩm định.', 'Check the documents and the version forwarded by Staff for Legal review.', 'dossier-review'],
};
export function legalBlocker(code, en) {
  const value = blockers[code];
  return { text: value?.[en ? 1 : 0] || (en ? 'Review the required documents and reload the case before continuing.' : 'Kiểm tra các giấy tờ cần thiết và tải lại hồ sơ trước khi tiếp tục.'), step: value?.[2] || 'dossier-review' };
}
export function legalDate(value) {
  if (!value) return '—';
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value.split('-').reverse().join('/');
  const normalized = /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) ? value : `${value}Z`;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return '—';
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(date).map(p => [p.type, p.value]));
  return `${parts.day}/${parts.month}/${parts.year}, ${parts.hour}:${parts.minute}`;
}
