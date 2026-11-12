/** Bảng nhãn trạng thái hồ sơ/kho/kết luận pháp lý: mã trạng thái -> [nhãn tiếng Việt, nhãn tiếng Anh]. Dùng bởi legalStatus(). */
const labels = {
  ACTIVE: ['Đang hoạt động', 'Active'], HANDOVER_IN_PROGRESS: ['Đang bàn giao tài sản', 'Asset handover in progress'],
  OPEN: ['Đang xử lý', 'In progress'], CLOSED: ['Đã đóng', 'Closed'], CANCELLED: ['Đã hủy xác minh', 'Verification cancelled'], ARCHIVED: ['Đã lưu trữ', 'Archived'],
  AWAITING_VERIFICATION: ['Chờ xác minh giấy tờ', 'Awaiting verification'], DOCUMENT_VERIFICATION: ['Đang kiểm tra giấy tờ', 'Document verification'],
  WILL_VERIFICATION: ['Đang đối chiếu di chúc', 'Will comparison'], AWAITING_WILL_COMPARISON: ['Chờ đối chiếu di chúc', 'Awaiting will comparison'], AWAITING_DOCUMENT_REQUEST: ['Cần yêu cầu giấy tờ phân chia', 'Distribution documents to request'], AWAITING_LEGAL_BASIS: ['Chờ hồ sơ pháp lý', 'Awaiting legal documents'],
  LEGAL_BASIS_VERIFICATION: ['Đang thẩm định pháp lý', 'Legal review'], UNLOCKED: ['Đã mở khóa', 'Unlocked'],
  COMPLETED: ['Đã hoàn tất', 'Completed'], ON_HOLD: ['Tạm dừng xử lý', 'On hold'],
  VALID: ['Hợp lệ', 'Valid'], INVALID: ['Không hợp lệ', 'Invalid'], INCONCLUSIVE: ['Chưa đủ cơ sở', 'Inconclusive'],
};
/**
 * Suy ra giai đoạn thực tế của hồ sơ Legal cho các trạng thái kho sớm (DOCUMENT_VERIFICATION, WILL_VERIFICATION),
 * vì trạng thái kho chỉ đổi khi Legal ghi nhận lần đối chiếu di chúc đầu tiên và khi chọn căn cứ pháp lý nên thường chậm hơn công việc thực tế.
 * Dựa vào điều kiện tiên quyết do server trả về: chưa duyệt khai tử -> giữ nguyên; chưa khớp di chúc -> AWAITING_WILL_COMPARISON;
 * phase === 'DOCUMENT_REQUEST_NEEDED' -> AWAITING_DOCUMENT_REQUEST; ngược lại AWAITING_LEGAL_BASIS.
 *
 * @param {string} status Trạng thái kho/hồ sơ hiện tại.
 * @param {{deathApproved?: boolean, willMatched?: boolean}} [prerequisites] Điều kiện tiên quyết từ server.
 * @param {string} [phase] Pha xử lý hiện tại.
 * @returns {string} Mã trạng thái hiển thị (có thể là trạng thái gốc).
 */
// The vault only changes when Legal records the first will match (to WILL_VERIFICATION) and later picks a basis route, so
// it lags behind the real work. Derive the real stage from the server's own prerequisites and phase for the early vault states.
export const legalStageStatus = (status, prerequisites, phase) => {
  if (!['DOCUMENT_VERIFICATION', 'WILL_VERIFICATION'].includes(status) || prerequisites?.deathApproved !== true) return status;
  if (prerequisites.willMatched !== true) return 'AWAITING_WILL_COMPARISON';
  return phase === 'DOCUMENT_REQUEST_NEEDED' ? 'AWAITING_DOCUMENT_REQUEST' : 'AWAITING_LEGAL_BASIS';
};
/**
 * Tạo nhãn dùng chung cho mọi ô chọn "lần tiếp nhận" (giấy tờ khai tử và di chúc bản gốc): số lần, thời điểm nhận, đánh dấu bản mới nhất.
 *
 * @param {boolean} en Dùng tiếng Anh nếu true.
 * @param {number} number Số thứ tự lần nhận.
 * @param {string} [receivedAt] Thời điểm nhận (ISO), định dạng bởi legalDate.
 * @param {boolean} [latest] Là lần nhận mới nhất.
 * @returns {string} Nhãn hiển thị.
 */
// One label for every "which receipt" picker (death documents and original wills): number, received time, newest marked.
export const receiptOptionLabel = (en, number, receivedAt, latest) => `${en ? 'Intake' : 'Lần nhận'} ${number}${receivedAt ? ' · ' + legalDate(receivedAt) : ''}${latest ? (en ? ' · Latest' : ' · Mới nhất') : ''}`;
/**
 * Trả về nhãn của một mã trạng thái pháp lý theo ngôn ngữ; mã lạ trả về "Chưa xác định" / "Not yet determined".
 *
 * @param {string} value Mã trạng thái.
 * @param {boolean} [en=false] Dùng tiếng Anh nếu true.
 * @returns {string} Nhãn hiển thị.
 */
export const legalStatus = (value, en = false) => labels[value]?.[en ? 1 : 0] || (en ? 'Not yet determined' : 'Chưa xác định');
/**
 * Ánh xạ mã trạng thái sang tông màu huy hiệu: warning (chờ/tạm dừng/chưa đủ cơ sở), neutral (đã đóng/lưu trữ), success (hoàn tất/đã mở khóa/hợp lệ), error (đã hủy/không hợp lệ), mặc định info.
 *
 * @param {string} value Mã trạng thái.
 * @returns {'warning'|'neutral'|'success'|'error'|'info'} Tông màu.
 */
export function legalStatusTone(value) {
  if (['ON_HOLD', 'AWAITING_VERIFICATION', 'AWAITING_LEGAL_BASIS', 'AWAITING_WILL_COMPARISON', 'AWAITING_DOCUMENT_REQUEST', 'INCONCLUSIVE'].includes(value)) return 'warning';
  if (['CLOSED', 'ARCHIVED'].includes(value)) return 'neutral';
  if (['COMPLETED', 'UNLOCKED', 'VALID'].includes(value)) return 'success';
  if (['CANCELLED', 'INVALID'].includes(value)) return 'error';
  return 'info';
}
/**
 * Cho biết hồ sơ Legal đang ở chế độ chỉ xem: trạng thái case thuộc CLOSED/CANCELLED/ARCHIVED/COMPLETED hoặc trạng thái kho thuộc CLOSED/ARCHIVED/COMPLETED/UNLOCKED/HANDOVER_IN_PROGRESS.
 *
 * @param {{caseStatus: string, vaultStatus: string}} context Ngữ cảnh hồ sơ (từ loadLegalContext).
 * @returns {boolean} true nếu không được thao tác thêm.
 */
export const legalReadOnly = context => ['CLOSED', 'CANCELLED', 'ARCHIVED', 'COMPLETED'].includes(context.caseStatus)
  || ['CLOSED', 'ARCHIVED', 'COMPLETED', 'UNLOCKED', 'HANDOVER_IN_PROGRESS'].includes(context.vaultStatus);
/** Bảng lý do chặn mở khóa/phê duyệt theo mã lỗi backend: mã -> [thông báo vi, thông báo en, bước cần quay lại (approval-review hoặc basis-route-selection)]. */
const blockers = {
  LEGAL_APPROVAL_REQUIRED: ['Cần chuyên viên pháp lý phê duyệt hồ sơ trước khi mở khóa.', 'A Legal verifier must approve this case before unlocking.', 'approval-review'],
  LEGAL_DECISION_STALE: ['Giấy tờ hoặc thông tin phân chia đã thay đổi. Chuyên viên pháp lý cần thẩm định lại phiên bản hiện tại.', 'Documents or allocations changed. A Legal verifier must review the current version.', 'basis-route-selection'],
  LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ đang tạm dừng. Chuyên viên pháp lý cần kiểm tra lý do và điều kiện tiếp tục.', 'This case is on hold. A Legal verifier must review the reason and conditions for resuming.', 'basis-route-selection'],
  COURT_DECISION_REQUIRED: ['Chưa có kết luận hợp lệ cho quyết định tòa án. Chuyên viên pháp lý cần hoàn tất thẩm định.', 'A Legal verifier must complete the court decision assessment.', 'basis-route-selection'],
  BASIS_DOSSIER_INVALID_STATE: ['Hồ sơ pháp lý chưa đủ điều kiện. Kiểm tra giấy tờ và phiên bản đã được nhân viên chuyển thẩm định.', 'Check the documents and the version forwarded by Staff for Legal review.', 'basis-route-selection'],
};
/**
 * Diễn giải mã lỗi chặn của backend thành thông báo thân thiện và bước cần quay lại.
 *
 * @param {string} code Mã lỗi (ví dụ LEGAL_APPROVAL_REQUIRED, LEGAL_DECISION_STALE, LEGAL_WORKFLOW_ON_HOLD, COURT_DECISION_REQUIRED, BASIS_DOSSIER_INVALID_STATE).
 * @param {boolean} en Dùng tiếng Anh nếu true.
 * @returns {{text: string, step?: string}} Thông báo và bước đề xuất (có thông báo mặc định cho mã lạ).
 */
export function legalBlocker(code, en) {
  const value = blockers[code];
  return { text: value?.[en ? 1 : 0] || (en ? 'This step is not available yet. Reload the case. If you still cannot continue, contact the person handling the case.' : 'Chưa thể thực hiện bước này. Hãy tải lại hồ sơ; nếu vẫn không thể tiếp tục, liên hệ người phụ trách hồ sơ.'), step: value?.[2] || null };
}
/**
 * Giải thích vì sao một hành động của Legal đang bị vô hiệu hóa. Chỉ phục vụ hiển thị: các hàm gọi vẫn giữ kiểm tra điều kiện riêng và server vẫn là nơi cấp quyền cuối cùng.
 * Xét theo bước: 'death-verification' (chưa có giấy tờ khai tử, chưa chọn giấy tờ, đã có quyết định), 'will-document-verification' (chưa có di chúc bản cứng/bản số),
 * còn lại là bước thẩm định căn cứ (đang tạm dừng, chưa có hồ sơ căn cứ, chưa có/đã cũ phiên bản văn bản Tòa án, Staff chưa chuyển phiên bản).
 *
 * @param {string} step Mã bước.
 * @param {{data?: object, documentId?: string, documentCount?: number, action?: string}} [state] Dữ liệu hồ sơ hiện tại.
 * @param {boolean} [en=false] Dùng tiếng Anh nếu true.
 * @returns {string} Thông báo giải thích.
 */
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
/**
 * Định dạng ngày/giờ cho giao diện Legal theo múi giờ Asia/Ho_Chi_Minh. Chuỗi chỉ có ngày (YYYY-MM-DD) trả về DD/MM/YYYY; chuỗi thời điểm được coi là UTC nếu thiếu múi giờ và trả về "DD/MM/YYYY, HH:mm".
 *
 * @param {string} [value] Chuỗi ngày hoặc thời điểm ISO.
 * @returns {string} Chuỗi đã định dạng hoặc "—" nếu rỗng/không hợp lệ.
 */
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
