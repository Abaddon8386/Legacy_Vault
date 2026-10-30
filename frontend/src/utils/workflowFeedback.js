// Only explicit workflow codes mean a business prerequisite is missing.
// A 404 cannot tell us whether a record is absent or outside the caller's scope.
export function workflowFailure(error, lang = 'vi') {
  const en = lang === 'en';
  const value = (kind, viTitle, enTitle, vi, english) => ({kind, title: en ? enTitle : viTitle, description: en ? english : vi});
  if (error?.status === 401) return value('access', 'Phiên đăng nhập đã hết hạn', 'Sign-in expired', 'Đăng nhập lại để tiếp tục.', 'Sign in again to continue.');
  if (error?.status === 403) return value('access', 'Không có quyền thực hiện', 'Access denied', 'Tài khoản này không được phép truy cập hoặc thực hiện thao tác này.', 'This account cannot access this record or perform this action.');
  if (error?.status === 404) return value('access', 'Không truy cập được hồ sơ hoặc phiên đã chọn', 'Case or session unavailable', 'Hồ sơ/phiên có thể không còn tồn tại hoặc không thuộc phạm vi tài khoản. Chọn lại hồ sơ được phân công; đây không phải thông báo Legal chưa duyệt.', 'The record may no longer exist or may be outside this account’s scope. Select an assigned case; this does not mean Legal approval is pending.');
  if (error?.status >= 500) return value('system', 'Máy chủ gặp lỗi', 'Server request failed', 'Không tải được dữ liệu từ máy chủ. Thử lại; lỗi này không xác định việc Staff hay Legal đã làm xong hay chưa.', 'The server request failed. Retry; this does not establish whether Staff or Legal have completed their work.');
  const business = {
    LEGAL_APPROVAL_REQUIRED: ['Chờ Legal phê duyệt', 'Awaiting Legal approval', 'Legal cần phê duyệt hồ sơ hiện hành trước khi Staff bàn giao.', 'Legal must approve the current case before Staff can proceed.'],
    LEGAL_WORKFLOW_ON_HOLD: ['Hồ sơ đang tạm dừng', 'Case on hold', 'Staff kiểm tra yêu cầu bổ sung; Legal xét tiếp sau khi có đủ thông tin.', 'Staff must check the supplementation request before Legal can resume processing.'],
    LEGAL_DECISION_STALE: ['Cần Legal kiểm tra lại', 'Legal reassessment required', 'Giấy tờ hoặc phân bổ đã đổi. Legal cần kiểm tra và phê duyệt phiên bản hiện hành.', 'Documents or allocations changed. Legal must assess and approve the current version.'],
  }[error?.code];
  if (business) return value('waiting', ...business);
  if (error?.status === 409) return value('changed', 'Trạng thái hồ sơ đã thay đổi', 'Case state changed', 'Kiểm tra lại trạng thái mới nhất trước khi thao tác. Chưa thể kết luận bước nào còn thiếu từ phản hồi này.', 'Check the latest state before proceeding. This response does not establish which prerequisite is missing.');
  return value('system', 'Không tải được dữ liệu', 'Unable to load data', error?.code === 'INVALID_RESPONSE' ? 'Máy chủ trả dữ liệu không hợp lệ. Thử tải lại; nếu vẫn lỗi cần kiểm tra hệ thống.' : 'Kết nối hoặc máy chủ gặp lỗi. Thử lại; lỗi này không có nghĩa Staff hay Legal chưa hoàn thành công việc.', error?.code === 'INVALID_RESPONSE' ? 'The server returned invalid data. Retry; persistent failures require investigation.' : 'A connection or server request failed. Retry; this does not mean Staff or Legal have unfinished work.');
}

export function staffSessionPrerequisite(item, lang = 'vi') {
  const en = lang === 'en';
  const phase = {
    DOCUMENT_REQUEST_NEEDED: ['Chờ Legal yêu cầu giấy tờ phân chia', 'Awaiting Legal document request', 'Legal cần ghi rõ giấy tờ cần nộp trước khi Staff tiếp nhận căn cứ.', 'Legal must request the required distribution documents before Staff intake.'],
    AWAITING_DOCUMENTS: ['Chờ Staff tiếp nhận giấy tờ', 'Awaiting Staff document intake', 'Người nộp mang giấy tờ Legal yêu cầu; Staff tải lên và chuyển thẩm định.', 'The applicant brings the requested documents; Staff uploads and forwards them.'],
    DOCUMENTS_UNDER_REVIEW: ['Chờ Legal thẩm định căn cứ', 'Awaiting Legal document assessment', 'Staff đã chuyển giấy tờ. Legal cần duyệt hoặc yêu cầu bổ sung kèm lý do.', 'Staff forwarded the documents. Legal must accept them or request supplementation with a reason.'],
    AWAITING_ALLOCATIONS: ['Chờ Staff lập phân bổ tài sản', 'Awaiting Staff asset allocations', 'Căn cứ đã duyệt. Staff lập phân bổ rồi gửi Legal kiểm tra.', 'The basis is accepted. Staff prepares allocations and sends them to Legal.'],
    ALLOCATIONS_UNDER_REVIEW: ['Chờ Legal kiểm tra phân bổ', 'Awaiting Legal allocation review', 'Staff đã gửi phân bổ. Legal kiểm tra từng tài sản và người nhận.', 'Staff submitted allocations. Legal checks each asset and recipient.'],
    FINAL_APPROVAL: ['Chờ Legal phê duyệt hồ sơ', 'Awaiting final Legal approval', 'Phân bổ đã được chấp thuận. Legal cần ghi quyết định phê duyệt cuối.', 'Allocations are accepted. Legal must record the final approval decision.'],
    APPROVED: ['Chờ Legal mở khóa kho', 'Awaiting Legal unlocking', 'Hồ sơ đã phê duyệt. Legal cần xác nhận mở khóa riêng trước khi Staff mở phiên.', 'The case is approved. Legal must separately unlock the vault before Staff opens a session.'],
  }[item?.distributionWorkflow?.phase];
  if (phase) return {kind:'waiting', title:phase[en ? 1 : 0], description:phase[en ? 3 : 2], destination:'basis'};
  const states = {
    AWAITING_VERIFICATION: ['Chờ Legal xác minh giấy tờ khai tử', 'Awaiting Legal death-document verification', 'Legal cần ghi nhận kết luận xác minh; sau đó tiếp tục đối chiếu di chúc.', 'Legal must record death-document verification before will comparison.'],
    DOCUMENT_VERIFICATION: ['Chờ hoàn tất thẩm định giấy tờ', 'Document assessment pending', 'Staff tiếp nhận bản gốc/tệp cần thiết; Legal đối chiếu di chúc và xử lý căn cứ.', 'Staff receives the required originals/files; Legal compares the will and assesses the basis.'],
    WILL_VERIFICATION: ['Chờ Legal đối chiếu di chúc', 'Awaiting Legal will comparison', 'Legal cần hoàn tất đối chiếu di chúc trước bước căn cứ phân chia.', 'Legal must complete the will comparison before distribution-basis assessment.'],
    AWAITING_LEGAL_BASIS: ['Đang ở bước căn cứ phân chia', 'Distribution basis pending', 'Xem yêu cầu giấy tờ: Staff tiếp nhận và chuyển tài liệu; Legal thẩm định khi đã nhận đủ.', 'Check the document request: Staff receives and forwards documents; Legal assesses them once available.'],
    LEGAL_BASIS_VERIFICATION: ['Chờ hoàn tất thẩm định và mở khóa', 'Assessment and unlocking pending', 'Xem hồ sơ căn cứ để biết đang chờ giấy tờ/phân bổ của Staff hay quyết định của Legal. Chưa có phiên bàn giao.', 'Check the basis workspace for pending Staff documents/allocations or Legal decisions. No handover session exists yet.'],
    ON_HOLD: ['Hồ sơ đang tạm dừng', 'Case on hold', 'Staff xử lý yêu cầu bổ sung; Legal kiểm tra và cho tiếp tục theo điều kiện hiện hành.', 'Staff addresses the supplementation request; Legal reviews the current conditions before resuming.'],
  }[item?.vaultStatus];
  if (states) return {kind:'waiting', title:states[en ? 1 : 0], description:states[en ? 3 : 2], destination:'basis'};
  return {kind:'waiting', title:en ? 'Staff has not opened a handover session' : 'Staff chưa mở phiên bàn giao', description:en ? 'Open a counter handover session before recording delivery or receipt confirmations.' : 'Mở phiên tại quầy trước khi bàn giao, ký nhận hoặc hoàn tất hồ sơ.', destination:'handover'};
}
