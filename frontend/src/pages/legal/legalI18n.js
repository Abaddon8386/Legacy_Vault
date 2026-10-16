export const legalI18n = {
  vi: {
    pageTitle: 'Xác minh tử vong',
    formSubtitle: 'Thẩm định hồ sơ sự kiện tử vong độc lập theo quy trình pháp lý.',

    // Cảnh báo quy tắc nghiệp vụ
    dmsWarningTitle: 'Lưu ý xác minh tử vong',
    dmsWarningBody:
      'Cảnh báo từ hệ thống giám sát hoạt động không đủ để xác nhận tử vong. Thẩm định sự kiện tử vong bắt buộc cần chuyên viên pháp lý kiểm tra và xác minh bằng chứng.',

    // Hàng đợi hồ sơ
    queueSectionTitle: 'Hàng đợi hồ sơ thẩm định',
    queueUnconnectedTitle: 'Chưa thể tải hồ sơ',
    queueUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ cần thẩm định.',

    // Biểu mẫu
    formTitle: 'Phiếu thẩm định sự kiện tử vong',
    formDesc: 'Chọn kết quả thẩm định và nhập lý do để lưu vết kiểm toán.',

    docketRefLabel: 'Mã hồ sơ / Tham chiếu',
    docketRefHint: 'Mã số hồ sơ hoặc mã kho cần thẩm định (tùy chọn khi xem giao diện).',
    docketRefPlaceholder: 'VD: DOCKET-2026-001',

    decisionLabel: 'Kết quả thẩm định (Bắt buộc)',
    decisionApprove: 'Xác nhận tử vong',
    decisionApproveDesc: 'Chấp thuận sự kiện tử vong dựa trên đầy đủ bằng chứng hợp lệ.',
    decisionReject: 'Bác bỏ',
    decisionRejectDesc: 'Bác bỏ do không đủ cơ sở pháp lý hoặc thông tin không chính xác.',
    decisionRequestEvidence: 'Yêu cầu bổ sung bằng chứng',
    decisionRequestEvidenceDesc: 'Tài liệu chưa đủ căn cứ, cần cung cấp thêm bằng chứng xác thực.',

    reasonLabel: 'Lý do thẩm định (Bắt buộc)',
    reasonHint: 'Nhập nội dung lý do thẩm định (bắt buộc).',
    reasonPlaceholder: 'Nhập lý do thẩm định sự kiện tử vong...',

    notesLabel: 'Ghi chú thêm (Tùy chọn)',
    notesPlaceholder: 'Nhập ghi chú đối chiếu bổ sung nếu có...',

    // Khu vực lịch sử thẩm định
    reviewHistoryTitle: 'Lịch sử thẩm định',
    reviewHistoryNoData: 'Chưa thể tải lịch sử thẩm định',
    reviewHistoryDesc: 'Chưa thể kết nối thông tin lịch sử thẩm định của hồ sơ.',
    currentUserLabel: 'Tài khoản thẩm định:',
    currentUserNote: '(Tách biệt với lịch sử thẩm định)',

    // Nút hành động
    btnSubmit: 'Xác nhận thẩm định',
    btnSubmitHelper: 'Chức năng hiện chưa khả dụng',
    btnValidateLocal: 'Kiểm tra biểu mẫu',
    btnReset: 'Làm mới',

    validationSuccess: 'Biểu mẫu đã điền đủ thông tin (đã chọn kết quả và có lý do thẩm định).',
    validationFailure: 'Vui lòng kiểm tra lại: cần chọn một kết quả và nhập lý do thẩm định.',
    decisionRequired: 'Vui lòng chọn quyết định thẩm định.',
    decisionInvalid: 'Lựa chọn thẩm định không hợp lệ.',
    reasonRequired: 'Lý do thẩm định không được để trống.',
  },

  en: {
    pageTitle: 'Death Verification',
    formSubtitle: 'Independent legal adjudication of death verification claims.',

    // Business regulatory rule
    dmsWarningTitle: 'Verification Notice',
    dmsWarningBody:
      'Activity monitoring alerts are not sufficient to confirm death. Verification requires independent legal review of evidence.',

    // Queue status
    queueSectionTitle: 'Verification Review Queue',
    queueUnconnectedTitle: 'Unable to load dockets',
    queueUnconnectedDesc: 'Unable to retrieve pending verification dockets.',

    // Form
    formTitle: 'Death Verification Docket',
    formDesc: 'Select an adjudication decision and provide rationale for audit trail.',

    docketRefLabel: 'Docket / Reference Identifier',
    docketRefHint: 'Docket or vault reference identifier (optional during review).',
    docketRefPlaceholder: 'e.g. DOCKET-2026-001',

    decisionLabel: 'Adjudication Decision (Required)',
    decisionApprove: 'Confirm Death',
    decisionApproveDesc: 'Confirm claim based on sufficient official legal evidence.',
    decisionReject: 'Reject',
    decisionRejectDesc: 'Reject due to insufficient evidence or conflicting information.',
    decisionRequestEvidence: 'Request More Evidence',
    decisionRequestEvidenceDesc: 'Documentation is insufficient; additional proof required.',

    reasonLabel: 'Verification Rationale (Required)',
    reasonHint: 'Enter verification rationale (required).',
    reasonPlaceholder: 'Enter verification rationale for this claim...',

    notesLabel: 'Additional Notes (Optional)',
    notesPlaceholder: 'Enter additional reference notes if applicable...',

    // Review history
    reviewHistoryTitle: 'Verification History',
    reviewHistoryNoData: 'Unable to load verification history',
    reviewHistoryDesc: 'Unable to retrieve verification history for this docket.',
    currentUserLabel: 'Verifying account:',
    currentUserNote: '(Distinct from past verification history)',

    // Action buttons
    btnSubmit: 'Confirm Decision',
    btnSubmitHelper: 'Function is currently unavailable',
    btnValidateLocal: 'Check Form Completeness',
    btnReset: 'Reset Form',

    validationSuccess: 'Form is complete (decision selected and rationale provided).',
    validationFailure: 'Please check the form: a decision and rationale are required.',
    decisionRequired: 'Please select a verification option.',
    decisionInvalid: 'Invalid verification option selected.',
    reasonRequired: 'Verification rationale / reason cannot be empty.',
  },
};
