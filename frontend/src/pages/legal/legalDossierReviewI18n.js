export const legalDossierReviewI18n = {
  vi: {
    pageTitle: 'Thẩm định hồ sơ',

    // Băng lưu ý nghiệp vụ ngắn gọn
    noticeTitle: 'Lưu ý',
    noticeBody:
      'Thẩm định trên phiên bản hồ sơ hiện tại. Kết quả không tự động mở khóa tài sản.',

    // Cảnh báo khi hồ sơ đã cập nhật phiên bản mới (Stale review alert)
    staleNoticeTitle: 'Cảnh báo cập nhật hồ sơ',
    staleNoticeBody:
      'Hồ sơ đã được cập nhật. Vui lòng xem phiên bản mới trước khi tiếp tục thẩm định.',

    // Khu vực thông tin hồ sơ
    dossierSectionTitle: 'Hồ sơ cần thẩm định',
    dossierUnloaded: 'Chưa thể tải hồ sơ',
    dossierUnloadedDesc: 'Chưa thể kết nối thông tin hồ sơ hoặc phiên bản từ máy chủ.',
    versionLabel: 'Phiên bản hồ sơ',
    versionUnloaded: 'Chưa thể tải thông tin',
    hashLabel: 'Mã kiểm tra tính toàn vẹn (SHA-256)',
    hashUnloaded: 'Chưa thể tải thông tin',
    issuerLabel: 'Cơ quan ban hành:',
    docNumberLabel: 'Số hiệu văn bản:',
    issuanceDateLabel: 'Ngày ban hành:',

    // Khu vực lựa chọn kết quả (4 lựa chọn theo AC, không mô tả phụ)
    decisionSectionTitle: 'Kết quả thẩm định',
    decisionApprove: 'Chấp thuận',
    decisionReject: 'Từ chối',
    decisionHold: 'Tạm dừng xử lý',
    decisionReReview: 'Thẩm định lại',

    // Ghi chú
    notesLabel: 'Ghi chú',

    // Lịch sử thẩm định
    historySectionTitle: 'Lịch sử thẩm định',
    historyUnloaded: 'Chưa thể tải lịch sử thẩm định',
    historyUnloadedDesc:
      'Chưa thể kết nối lịch sử thẩm định từ máy chủ.',
    historyVersionCol: 'Phiên bản',
    historyDecisionCol: 'Kết quả',
    historyTimeCol: 'Thời gian',
    historyNotesCol: 'Ghi chú',

    // Các nút hành động
    btnSubmitDecision: 'Xác nhận kết quả',
    btnSubmitDisabledHelper: 'Chức năng hiện chưa khả dụng',
    btnReset: 'Làm mới',

    // Mã lỗi validation (dynamic i18n)
    decisionRequired: 'Vui lòng chọn một kết quả thẩm định.',
    decisionInvalid: 'Kết quả thẩm định không hợp lệ.',
  },

  en: {
    pageTitle: 'Dossier Review',

    // Concise regulatory notice
    noticeTitle: 'Notice',
    noticeBody:
      'Review on the current dossier version. Decisions do not automatically unlock assets.',

    // Stale review alert
    staleNoticeTitle: 'Dossier Update Warning',
    staleNoticeBody:
      'The dossier has been updated. Please review the new version before proceeding with the review.',

    // Dossier information section
    dossierSectionTitle: 'Dossier for Review',
    dossierUnloaded: 'Unable to load dossier',
    dossierUnloadedDesc:
      'Unable to retrieve dossier records or version metadata from the server.',
    versionLabel: 'Dossier Version',
    versionUnloaded: 'Unable to load information',
    hashLabel: 'Integrity Verification Code (SHA-256)',
    hashUnloaded: 'Unable to load information',
    issuerLabel: 'Issuing Authority:',
    docNumberLabel: 'Document Number:',
    issuanceDateLabel: 'Issuance Date:',

    // Decision selection section (4 AC choices without redundant descriptions)
    decisionSectionTitle: 'Review Decision',
    decisionApprove: 'Approve',
    decisionReject: 'Reject',
    decisionHold: 'Put on Hold',
    decisionReReview: 'Re-review',

    // Notes
    notesLabel: 'Notes',

    // Review history
    historySectionTitle: 'Review History',
    historyUnloaded: 'Unable to load review history',
    historyUnloadedDesc:
      'Unable to retrieve review history from the server.',
    historyVersionCol: 'Version',
    historyDecisionCol: 'Decision',
    historyTimeCol: 'Timestamp',
    historyNotesCol: 'Notes',

    // Action buttons
    btnSubmitDecision: 'Confirm Review Result',
    btnSubmitDisabledHelper: 'Function is currently unavailable',
    btnReset: 'Reset',

    // Validation error codes (dynamic i18n)
    decisionRequired: 'Please select a review decision.',
    decisionInvalid: 'Invalid review decision.',
  },
};
