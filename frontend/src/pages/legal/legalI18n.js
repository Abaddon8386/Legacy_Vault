export const legalI18n = {
  vi: {
    // ==========================================
    // PS-28 / ST-14: Xác minh tử vong
    // ==========================================
    pageTitle: 'Xác minh tử vong',
    formSubtitle: 'Thẩm định hồ sơ sự kiện tử vong độc lập theo quy trình pháp lý.',

    // Cảnh báo quy tắc nghiệp vụ PS-28
    dmsWarningTitle: 'Lưu ý xác minh tử vong',
    dmsWarningBody:
      'Cảnh báo từ hệ thống giám sát hoạt động không đủ để xác nhận tử vong. Thẩm định sự kiện tử vong bắt buộc cần chuyên viên pháp lý kiểm tra và xác minh bằng chứng.',

    // Hàng đợi hồ sơ PS-28
    queueSectionTitle: 'Hàng đợi hồ sơ thẩm định',
    queueUnconnectedTitle: 'Chưa thể tải hồ sơ',
    queueUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ cần thẩm định.',

    // Biểu mẫu PS-28
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

    // Khu vực lịch sử thẩm định PS-28
    reviewHistoryTitle: 'Lịch sử thẩm định',
    reviewHistoryNoData: 'Chưa thể tải lịch sử thẩm định',
    reviewHistoryDesc: 'Chưa thể kết nối thông tin lịch sử thẩm định của hồ sơ.',
    currentUserLabel: 'Tài khoản thẩm định:',
    currentUserNote: '(Tách biệt với lịch sử thẩm định)',

    // Nút hành động & validation PS-28
    btnSubmit: 'Xác nhận thẩm định',
    validationSuccess: 'Biểu mẫu đã điền đủ thông tin (đã chọn kết quả và có lý do thẩm định).',
    validationFailure: 'Vui lòng kiểm tra lại: cần chọn một kết quả và nhập lý do thẩm định.',
    decisionRequired: 'Vui lòng chọn quyết định thẩm định.',
    decisionInvalid: 'Lựa chọn thẩm định không hợp lệ.',
    reasonRequired: 'Lý do thẩm định không được để trống.',

    // ==========================================
    // PS-29 / ST-15: Đối chiếu di chúc (Tách key tránh ghi đè)
    // ==========================================
    willPageTitle: 'Đối chiếu di chúc',
    willFormSubtitle: 'Đối chiếu tài liệu di chúc bản giấy với phiên bản và mã băm SHA-256 của bản số hóa đã lưu trữ.',

    // Cảnh báo quy tắc nghiệp vụ LV-WILL-001
    willNoticeTitle: 'Lưu ý đối chiếu di chúc (LV-WILL-001)',
    willNoticeBody:
      'Kết quả đối chiếu không thay thế quyết định thẩm định pháp lý. Việc tài liệu trùng khớp về số hóa không đồng nghĩa với việc hồ sơ được tự động phê duyệt pháp lý (Legal Approved).',

    // Thông tin bản số hóa lưu trữ PS-29
    willQueueSectionTitle: 'Thông tin bản số hóa lưu trữ',
    willQueueUnconnectedTitle: 'Chưa thể tải hồ sơ/tài liệu',
    willQueueUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ hoặc dữ liệu bản số hóa cần đối chiếu từ máy chủ.',
    docVersionLabel: 'Phiên bản di chúc số lưu trữ:',
    docVersionUnloaded: 'Chưa có dữ liệu kết nối',
    docHashLabel: 'Mã băm SHA-256 bản số hóa:',
    docHashUnloaded: 'Chưa có dữ liệu kết nối',
    docHashHint: 'Mã băm SHA-256 đầy đủ được bảo toàn để đối chiếu với bản gốc giấy:',

    // Biểu mẫu đối chiếu PS-29
    willFormTitle: 'Phiếu đối chiếu tài liệu di chúc',
    willFormDesc: 'Chọn kết quả đối chiếu giữa bản giấy và dữ liệu số hóa lưu trữ để ghi nhận vết kiểm toán.',

    willDocketRefHint: 'Mã số hồ sơ hoặc mã kho cần đối chiếu (tùy chọn khi xem giao diện).',
    willDocketRefPlaceholder: 'VD: WILL-DOC-2026-001',

    comparisonLabel: 'Kết quả đối chiếu di chúc (Bắt buộc)',
    comparisonMatch: 'Khớp',
    comparisonMatchDesc: 'Bản giấy trùng khớp hoàn toàn với phiên bản và mã băm bản số hóa lưu trữ.',
    comparisonMismatch: 'Không khớp',
    comparisonMismatchDesc: 'Phát hiện sai lệch giữa bản giấy và thông tin bản số hóa lưu trữ.',

    willNotesLabel: 'Ghi chú đối chiếu (Tùy chọn)',
    willNotesPlaceholder: 'Nhập ghi chú chi tiết nếu phát hiện điểm cần lưu ý đối chiếu...',

    // Khu vực lịch sử đối chiếu PS-29
    willReviewHistoryTitle: 'Lịch sử đối chiếu',
    willReviewHistoryNoData: 'Chưa thể tải lịch sử đối chiếu',
    willReviewHistoryDesc: 'Chưa thể kết nối thông tin lịch sử đối chiếu của hồ sơ.',
    willCurrentUserLabel: 'Tài khoản đối chiếu:',
    willCurrentUserNote: '(Tách biệt với lịch sử đối chiếu)',

    // Nút hành động & validation PS-29
    willBtnSubmit: 'Xác nhận đối chiếu',
    willValidationSuccess: 'Biểu mẫu đã chọn kết quả đối chiếu hợp lệ.',
    willValidationFailure: 'Vui lòng kiểm tra lại: cần chọn kết quả đối chiếu (Khớp hoặc Không khớp).',

    // Mã lỗi validation PS-29 (dynamic i18n)
    comparisonRequired: 'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).',
    comparisonInvalid: 'Kết quả đối chiếu không hợp lệ.',

    // ==========================================
    // Dùng chung
    // ==========================================
    btnSubmitHelper: 'Chức năng hiện chưa khả dụng',
    btnValidateLocal: 'Kiểm tra biểu mẫu',
    btnReset: 'Làm mới',
  },

  en: {
    // ==========================================
    // PS-28 / ST-14: Death Verification
    // ==========================================
    pageTitle: 'Death Verification',
    formSubtitle: 'Independent legal adjudication of death verification claims.',

    // Business regulatory rule PS-28
    dmsWarningTitle: 'Verification Notice',
    dmsWarningBody:
      'Activity monitoring alerts are not sufficient to confirm death. Verification requires independent legal review of evidence.',

    // Queue status PS-28
    queueSectionTitle: 'Verification Review Queue',
    queueUnconnectedTitle: 'Unable to load dockets',
    queueUnconnectedDesc: 'Unable to retrieve pending verification dockets.',

    // Form PS-28
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

    // Review history PS-28
    reviewHistoryTitle: 'Verification History',
    reviewHistoryNoData: 'Unable to load verification history',
    reviewHistoryDesc: 'Unable to retrieve verification history for this docket.',
    currentUserLabel: 'Verifying account:',
    currentUserNote: '(Distinct from past verification history)',

    // Action buttons & validation PS-28
    btnSubmit: 'Confirm Decision',
    validationSuccess: 'Form is complete (decision selected and rationale provided).',
    validationFailure: 'Please check the form: a decision and rationale are required.',
    decisionRequired: 'Please select a verification option.',
    decisionInvalid: 'Invalid verification option selected.',
    reasonRequired: 'Verification rationale / reason cannot be empty.',

    // ==========================================
    // PS-29 / ST-15: Will Document Verification
    // ==========================================
    willPageTitle: 'Will Document Verification',
    willFormSubtitle: 'Compare physical paper will documents against the stored version and SHA-256 hash of the digitized record.',

    // Business regulatory rule LV-WILL-001
    willNoticeTitle: 'Will Verification Notice (LV-WILL-001)',
    willNoticeBody:
      'Comparison result does not replace legal adjudication decision. A matching document record does not automatically grant legal approval.',

    // Queue / Digitized Record metadata PS-29
    willQueueSectionTitle: 'Stored Digitized Record Metadata',
    willQueueUnconnectedTitle: 'Unable to load docket / documents',
    willQueueUnconnectedDesc: 'Unable to retrieve pending verification dockets or digitized record data from the server.',
    docVersionLabel: 'Stored Digitized Will Version:',
    docVersionUnloaded: 'Not loaded (API unready)',
    docHashLabel: 'Digitized SHA-256 Hash:',
    docHashUnloaded: 'Not loaded (API unready)',
    docHashHint: 'Full SHA-256 hash preserved for complete visual cross-examination against paper will:',

    // Form PS-29
    willFormTitle: 'Will Document Verification Docket',
    willFormDesc: 'Record comparison between paper document and stored digitized record for audit trail.',

    willDocketRefHint: 'Docket or vault reference identifier (optional during review).',
    willDocketRefPlaceholder: 'e.g. WILL-DOC-2026-001',

    comparisonLabel: 'Will Comparison Result (Required)',
    comparisonMatch: 'Match',
    comparisonMatchDesc: 'Physical paper will matches the stored version and SHA-256 hash completely.',
    comparisonMismatch: 'Mismatch',
    comparisonMismatchDesc: 'Discrepancy detected between paper will and stored digitized record.',

    willNotesLabel: 'Verification Notes (Optional)',
    willNotesPlaceholder: 'Enter verification notes or discrepancies observed...',

    // Review history PS-29
    willReviewHistoryTitle: 'Verification History',
    willReviewHistoryNoData: 'Unable to load verification history',
    willReviewHistoryDesc: 'Unable to retrieve verification history for this docket.',
    willCurrentUserLabel: 'Verifying account:',
    willCurrentUserNote: '(Distinct from past verification history)',

    // Action buttons & validation PS-29
    willBtnSubmit: 'Confirm Verification',
    willValidationSuccess: 'Form has a valid comparison selection.',
    willValidationFailure: 'Please check the form: a comparison decision (Match or Mismatch) is required.',

    // Validation error codes PS-29 (dynamic i18n)
    comparisonRequired: 'Please select a comparison result (Match or Mismatch).',
    comparisonInvalid: 'Invalid comparison option selected.',

    // ==========================================
    // Dùng chung
    // ==========================================
    btnSubmitHelper: 'Function is currently unavailable',
    btnValidateLocal: 'Check Form Completeness',
    btnReset: 'Reset Form',
  },
};
