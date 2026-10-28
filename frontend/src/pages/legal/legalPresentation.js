const labels = {
  ACTIVE: ['Đang hoạt động', 'Active'], HANDOVER_IN_PROGRESS: ['Đang bàn giao tài sản', 'Asset handover in progress'],
  OPEN: ['Đang xử lý', 'In progress'], CLOSED: ['Đã đóng', 'Closed'], CANCELLED: ['Đã hủy xác minh', 'Verification cancelled'], ARCHIVED: ['Đã lưu trữ', 'Archived'],
  AWAITING_VERIFICATION: ['Chờ xác minh giấy tờ', 'Awaiting verification'], DOCUMENT_VERIFICATION: ['Đang kiểm tra giấy tờ', 'Document verification'],
  WILL_VERIFICATION: ['Đang đối chiếu di chúc', 'Will comparison'], AWAITING_LEGAL_BASIS: ['Chờ hồ sơ pháp lý', 'Awaiting legal documents'],
  LEGAL_BASIS_VERIFICATION: ['Đang thẩm định pháp lý', 'Legal review'], UNLOCKED: ['Đã mở khóa', 'Unlocked'],
  COMPLETED: ['Đã hoàn tất', 'Completed'], ON_HOLD: ['Tạm dừng xử lý', 'On hold'],
  VALID: ['Hợp lệ', 'Valid'], INVALID: ['Không hợp lệ', 'Invalid'], INCONCLUSIVE: ['Chưa đủ cơ sở', 'Inconclusive'],
};
export const legalStatus = (value, en = false) => labels[value]?.[en ? 1 : 0] || (en ? 'Not yet determined' : 'Chưa xác định');
export function legalStatusTone(value) {
  if (['ON_HOLD', 'AWAITING_VERIFICATION', 'AWAITING_LEGAL_BASIS'].includes(value)) return 'warning';
  if (['CANCELLED', 'CLOSED', 'ARCHIVED'].includes(value)) return 'neutral';
  if (['COMPLETED', 'UNLOCKED', 'VALID'].includes(value)) return 'success';
  if (value === 'INVALID') return 'error';
  return 'info';
}
export const legalReadOnly = context => ['CLOSED', 'CANCELLED', 'ARCHIVED', 'COMPLETED'].includes(context.caseStatus)
  || ['CLOSED', 'ARCHIVED', 'COMPLETED', 'UNLOCKED', 'HANDOVER_IN_PROGRESS'].includes(context.vaultStatus);
const blockers = {
  LEGAL_APPROVAL_REQUIRED: ['Cần chuyên viên pháp lý phê duyệt hồ sơ trước khi mở khóa.', 'A Legal verifier must approve this case before unlocking.', 'approval-review'],
  LEGAL_DECISION_STALE: ['Giấy tờ hoặc thông tin phân chia đã thay đổi. Chuyên viên pháp lý cần thẩm định lại phiên bản hiện tại.', 'Documents or allocations changed. A Legal verifier must review the current version.', 'basis-route-selection'],
  LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ đang tạm dừng. Chuyên viên pháp lý cần kiểm tra lý do và điều kiện tiếp tục.', 'This case is on hold. A Legal verifier must review the reason and conditions for resuming.', 'basis-route-selection'],
  COURT_DECISION_REQUIRED: ['Chưa có kết luận hợp lệ cho quyết định tòa án. Chuyên viên pháp lý cần hoàn tất thẩm định.', 'A Legal verifier must complete the court decision assessment.', 'basis-route-selection'],
  BASIS_DOSSIER_INVALID_STATE: ['Hồ sơ pháp lý chưa đủ điều kiện. Kiểm tra giấy tờ và phiên bản đã được nhân viên chuyển thẩm định.', 'Check the documents and the version forwarded by Staff for Legal review.', 'basis-route-selection'],
};
export function legalBlocker(code, en) {
  const value = blockers[code];
  return { text: value?.[en ? 1 : 0] || (en ? 'This step is not available yet. Reload the case. If you still cannot continue, contact the person handling the case.' : 'Chưa thể thực hiện bước này. Hãy tải lại hồ sơ; nếu vẫn không thể tiếp tục, liên hệ người phụ trách hồ sơ.'), step: value?.[2] || null };
}
// Explain an existing disabled action. This is presentation only: callers retain
// their current eligibility checks and the server remains the authorization gate.
export function legalStepBlocker(step, { data, documentId, documentCount = 0, action } = {}, en = false) {
  const say = (vi, english) => en ? english : vi;
  if (step === 'death-verification') {
    if (!documentCount) return say('Hồ sơ chưa có giấy tờ khai tử. Nhân viên cần tiếp nhận giấy tờ trước khi Pháp lý xác minh.', 'No death documents have been received. Staff must receive the documents before Legal can verify them.');
    if (!documentId) return say('Chọn giấy tờ khai tử phía trên để xem nội dung và ghi nhận quyết định.', 'Select a death document above to view it and record a decision.');
    if (data?.decisions?.length) return say('Giấy tờ này đã có quyết định. Bạn có thể xem kết quả đã ghi nhận; không ghi thêm quyết định cho cùng giấy tờ.', 'This document already has a recorded decision. Review its history; another decision cannot be recorded for the same document.');
    return say('Trạng thái hiện tại không cho phép xác minh giấy tờ khai tử. Kiểm tra trạng thái hồ sơ và bước xử lý hiện hành.', 'The current case state does not allow death-document verification. Check the case status and current processing step.');
  }
  if (step === 'will-document-verification') {
    if (!data?.originalWillIntakes?.length) return say('Chưa có di chúc bản cứng được tiếp nhận. Nhân viên cần ghi nhận bản gốc và bản scan trước khi đối chiếu.', 'No original paper will has been received. Staff must record the original and its scan before comparison.');
    if (!data?.wills?.some(will => will.versions?.length)) return say('Hồ sơ chưa có phiên bản di chúc số để đối chiếu. Cần bổ sung bản di chúc số trước khi ghi nhận kết quả.', 'No digitized will version is available for comparison. A digitized version must be supplied before recording a result.');
    return say('Giai đoạn hiện tại không cho phép đối chiếu di chúc. Kiểm tra kết quả và trạng thái hồ sơ trước khi tiếp tục.', 'The current stage does not allow will comparison. Check the existing result and case status before continuing.');
  }

  if (data?.dossier?.route === 'ON_HOLD' || data?.will?.vaultStatus === 'ON_HOLD') return say('Hồ sơ đang tạm dừng. Kiểm tra lý do và phân loại lại căn cứ khi đủ điều kiện trước khi tiếp tục thẩm định.', 'This case is on hold. Review the reason and reclassify its legal basis when eligible before resuming assessment.');
  if (!data?.dossier) return say('Chưa có hồ sơ căn cứ pháp lý. Hoàn tất phân loại căn cứ trước khi thẩm định.', 'No legal-basis dossier is available. Complete legal-basis classification before assessment.');
  if (action === 'hold') return say('Trạng thái hiện tại không cho phép tạm dừng hồ sơ. Kiểm tra trạng thái mới nhất trước khi tiếp tục.', 'The current state does not allow placing this case on hold. Check the latest case status before continuing.');
  const latest = data.dossier.versions?.reduce((best, item) => !best || item.version > best.version ? item : best, null);
  if (!latest) return say('Chưa có phiên bản văn bản Tòa án. Nhân viên cần tiếp nhận và chuyển văn bản để Pháp lý thẩm định.', 'No court-document version is available. Staff must receive and forward it for Legal assessment.');
  if (latest.version < data.dossier.requiredVersion) return say('Văn bản đang xem đã được thay thế. Nhân viên cần chuyển bản mới nhất để thẩm định.', 'The available version is older than the required version. Staff must provide and forward the new version for assessment.');
  if (latest.forwardStatus !== 'FORWARDED' || data.dossier.status !== 'LEGAL_BASIS_FORWARDED') return say('Nhân viên chưa chuyển phiên bản giấy tờ phân chia hiện tại để thẩm định. Hãy chờ chuyển hồ sơ, không nộp lại quyết định trên bản cũ.', 'Staff have not forwarded the current distribution-document version for assessment. Wait for the handoff; do not submit a decision against an older version.');
  return say('Chưa thể thực hiện bước này. Hãy tải lại hồ sơ và kiểm tra các bước thẩm định trước đó.', 'This step is not available yet. Reload the case and check the earlier review steps.');
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
