export const legalI18n = {
  vi: {
    pageTitle: 'Đối chiếu di chúc',
    formSubtitle: 'Đối chiếu tài liệu di chúc bản giấy với phiên bản và mã băm SHA-256 của bản số hóa đã lưu trữ.',

    // Cảnh báo quy tắc nghiệp vụ LV-WILL-001
    willNoticeTitle: 'Lưu ý đối chiếu di chúc (LV-WILL-001)',
    willNoticeBody:
      'Kết quả đối chiếu không thay thế quyết định thẩm định pháp lý. Việc tài liệu trùng khớp về số hóa không đồng nghĩa với việc hồ sơ được tự động phê duyệt pháp lý (Legal Approved).',

    // Hàng đợi / Dữ liệu bản số hóa lưu trữ
    queueSectionTitle: 'Thông tin bản số hóa lưu trữ',
    queueUnconnectedTitle: 'Chưa thể tải hồ sơ/tài liệu',
    queueUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ hoặc dữ liệu bản số hóa cần đối chiếu từ máy chủ.',
    docVersionLabel: 'Phiên bản di chúc số lưu trữ:',
    docVersionUnloaded: 'Chưa có dữ liệu kết nối',
    docHashLabel: 'Mã băm SHA-256 bản số hóa:',
    docHashUnloaded: 'Chưa có dữ liệu kết nối',
    docHashHint: 'Mã băm SHA-256 đầy đủ được bảo toàn để đối chiếu với bản gốc giấy:',

    // Biểu mẫu đối chiếu
    formTitle: 'Phiếu đối chiếu tài liệu di chúc',
    formDesc: 'Chọn kết quả đối chiếu giữa bản giấy và dữ liệu số hóa lưu trữ để ghi nhận vết kiểm toán.',

    docketRefLabel: 'Mã hồ sơ / Tham chiếu',
    docketRefHint: 'Mã số hồ sơ hoặc mã kho cần đối chiếu (tùy chọn khi xem giao diện).',
    docketRefPlaceholder: 'VD: WILL-DOC-2026-001',

    comparisonLabel: 'Kết quả đối chiếu di chúc (Bắt buộc)',
    comparisonMatch: 'Khớp',
    comparisonMatchDesc: 'Bản giấy trùng khớp hoàn toàn với phiên bản và mã băm bản số hóa lưu trữ.',
    comparisonMismatch: 'Không khớp',
    comparisonMismatchDesc: 'Phát hiện sai lệch giữa bản giấy và thông tin bản số hóa lưu trữ.',

    notesLabel: 'Ghi chú đối chiếu (Tùy chọn)',
    notesPlaceholder: 'Nhập ghi chú chi tiết nếu phát hiện điểm cần lưu ý đối chiếu...',

    // Khu vực lịch sử đối chiếu
    reviewHistoryTitle: 'Lịch sử đối chiếu',
    reviewHistoryNoData: 'Chưa thể tải lịch sử đối chiếu',
    reviewHistoryDesc: 'Chưa thể kết nối thông tin lịch sử đối chiếu của hồ sơ.',
    currentUserLabel: 'Tài khoản đối chiếu:',
    currentUserNote: '(Tách biệt với lịch sử đối chiếu)',

    // Nút hành động
    btnSubmit: 'Xác nhận đối chiếu',
    btnSubmitHelper: 'Chức năng hiện chưa khả dụng',
    btnValidateLocal: 'Kiểm tra biểu mẫu',
    btnReset: 'Làm mới',

    validationSuccess: 'Biểu mẫu đã chọn kết quả đối chiếu hợp lệ.',
    validationFailure: 'Vui lòng kiểm tra lại: cần chọn kết quả đối chiếu (Khớp hoặc Không khớp).',

    // Mã lỗi validation (dynamic i18n)
    comparisonRequired: 'Vui lòng chọn kết quả đối chiếu (Khớp hoặc Không khớp).',
    comparisonInvalid: 'Kết quả đối chiếu không hợp lệ.',
  },

  en: {
    pageTitle: 'Will Document Verification',
    formSubtitle: 'Compare physical paper will documents against the stored version and SHA-256 hash of the digitized record.',

    // Business regulatory rule LV-WILL-001
    willNoticeTitle: 'Will Verification Notice (LV-WILL-001)',
    willNoticeBody:
      'Comparison result does not replace legal adjudication decision. A matching document record does not automatically grant legal approval.',

    // Queue / Digitized Record metadata
    queueSectionTitle: 'Stored Digitized Record Metadata',
    queueUnconnectedTitle: 'Unable to load docket / documents',
    queueUnconnectedDesc: 'Unable to retrieve pending verification dockets or digitized record data from the server.',
    docVersionLabel: 'Stored Digitized Will Version:',
    docVersionUnloaded: 'Not loaded (API unready)',
    docHashLabel: 'Digitized SHA-256 Hash:',
    docHashUnloaded: 'Not loaded (API unready)',
    docHashHint: 'Full SHA-256 hash preserved for complete visual cross-examination against paper will:',

    // Form
    formTitle: 'Will Document Verification Docket',
    formDesc: 'Record comparison between paper document and stored digitized record for audit trail.',

    docketRefLabel: 'Docket / Reference Identifier',
    docketRefHint: 'Docket or vault reference identifier (optional during review).',
    docketRefPlaceholder: 'e.g. WILL-DOC-2026-001',

    comparisonLabel: 'Will Comparison Result (Required)',
    comparisonMatch: 'Match',
    comparisonMatchDesc: 'Physical paper will matches the stored version and SHA-256 hash completely.',
    comparisonMismatch: 'Mismatch',
    comparisonMismatchDesc: 'Discrepancy detected between paper will and stored digitized record.',

    notesLabel: 'Verification Notes (Optional)',
    notesPlaceholder: 'Enter verification notes or discrepancies observed...',

    // Review history
    reviewHistoryTitle: 'Verification History',
    reviewHistoryNoData: 'Unable to load verification history',
    reviewHistoryDesc: 'Unable to retrieve verification history for this docket.',
    currentUserLabel: 'Verifying account:',
    currentUserNote: '(Distinct from past verification history)',

    // Action buttons
    btnSubmit: 'Confirm Verification',
    btnSubmitHelper: 'Function is currently unavailable',
    btnValidateLocal: 'Check Form Completeness',
    btnReset: 'Reset Form',

    validationSuccess: 'Form has a valid comparison selection.',
    validationFailure: 'Please check the form: a comparison decision (Match or Mismatch) is required.',

    // Validation error codes (dynamic i18n)
    comparisonRequired: 'Please select a comparison result (Match or Mismatch).',
    comparisonInvalid: 'Invalid comparison option selected.',
  },
};
