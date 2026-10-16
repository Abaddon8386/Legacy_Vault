export const staffLegalDocumentsI18n = {
  vi: {
    pageTitle: 'Hồ sơ căn cứ pháp lý',
    formSubtitle: 'Quản lý thông tin văn bản căn cứ pháp lý và chuẩn bị hồ sơ chuyển sang ban pháp lý thẩm định.',

    // Cảnh báo quy tắc nghiệp vụ
    staffNoticeTitle: 'Lưu ý hồ sơ căn cứ pháp lý',
    staffNoticeBody:
      'Thông tin văn bản và hồ sơ phải được đối chiếu chính xác trước khi chuyển cho ban pháp lý. Việc nhập thông tin không đồng nghĩa hồ sơ đã được phê duyệt hoặc tài sản đã được mở khóa.',

    // Khu vực hồ sơ và phiên bản lưu trữ (chưa có API)
    dossierSectionTitle: 'Thông tin hồ sơ và phiên bản lưu trữ',
    dossierUnconnectedTitle: 'Chưa thể tải hồ sơ/thông tin phiên bản',
    dossierUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ hoặc thông tin phiên bản từ máy chủ.',
    dossierVersionLabel: 'Phiên bản hồ sơ lưu trữ:',
    dossierVersionUnloaded: 'Chưa thể tải thông tin',
    dossierHashLabel: 'Mã băm SHA-256 lưu trữ:',
    dossierHashUnloaded: 'Chưa thể tải thông tin',
    selectedDossierLabel: 'Hồ sơ chỉ định chuyển:',
    selectedDossierUnloaded: 'Chưa có hồ sơ được chỉ định',

    // Biểu mẫu thông tin văn bản căn cứ
    formTitle: 'Thông tin văn bản căn cứ',
    formDesc: 'Nhập các thông tin cơ bản của văn bản căn cứ pháp lý.',

    // Cơ quan ban hành
    issuerLabel: 'Cơ quan ban hành (Bắt buộc)',
    issuerPlaceholder: 'VD: Tòa án nhân dân TP. Hà Nội, Văn phòng Công chứng...',
    issuerHint: 'Tên cơ quan hoặc tổ chức có thẩm quyền ban hành văn bản.',

    // Số hiệu văn bản
    documentNumberLabel: 'Số hiệu văn bản (Bắt buộc)',
    documentNumberPlaceholder: 'VD: 125/2026/QĐ-TA, 45/CC-HĐ...',
    documentNumberHint: 'Số hiệu chính thức ghi trên văn bản căn cứ.',

    // Ngày ban hành
    issuanceDateLabel: 'Ngày ban hành (Bắt buộc)',
    issuanceDateHint: 'Ngày/tháng/năm (DD/MM/YYYY)',

    // Nút hành động
    btnForwardToLegal: 'Chuyển cho ban pháp lý',
    btnForwardHelper: 'Chức năng hiện chưa khả dụng (cần kết nối hồ sơ và phiên bản hợp lệ từ máy chủ)',
    btnValidateForm: 'Kiểm tra tính đầy đủ',
    btnReset: 'Làm mới',

    // Phản hồi kiểm tra biểu mẫu
    validationSuccess: 'Thông tin văn bản đã được điền đầy đủ.',
    validationFailure: 'Vui lòng điền đầy đủ các thông tin văn bản bắt buộc.',

    // Mã lỗi validation (dynamic i18n)
    issuerRequired: 'Vui lòng nhập cơ quan ban hành.',
    documentNumberRequired: 'Vui lòng nhập số hiệu văn bản.',
    issuanceDateRequired: 'Vui lòng chọn ngày ban hành.',
    issuanceDateInvalid: 'Ngày ban hành không hợp lệ.',
  },

  en: {
    pageTitle: 'Legal Basis Documents',
    formSubtitle: 'Manage legal basis document metadata and prepare dossiers for Legal Department verification.',

    // Business regulatory notice
    staffNoticeTitle: 'Legal Basis Document Notice',
    staffNoticeBody:
      'Document metadata and dossiers must be verified accurately before sending to Legal Department. Entering metadata does not imply that the dossier has been approved or assets unlocked.',

    // Stored dossier and version section (API unready)
    dossierSectionTitle: 'Stored Dossier & Version Records',
    dossierUnconnectedTitle: 'Unable to load dossier/version information',
    dossierUnconnectedDesc: 'Unable to retrieve dossier records or version metadata from the server.',
    dossierVersionLabel: 'Stored Dossier Version:',
    dossierVersionUnloaded: 'Unable to load information',
    dossierHashLabel: 'Stored SHA-256 Hash:',
    dossierHashUnloaded: 'Unable to load information',
    selectedDossierLabel: 'Designated Transfer Dossier:',
    selectedDossierUnloaded: 'No dossier designated',

    // Document metadata form
    formTitle: 'Document Metadata',
    formDesc: 'Enter core metadata for the legal basis document.',

    // Issuing authority
    issuerLabel: 'Issuing Authority (Required)',
    issuerPlaceholder: "e.g. People's Court of Hanoi, Notary Office...",
    issuerHint: 'Name of the authorized issuing organization or agency.',

    // Document number
    documentNumberLabel: 'Document Number (Required)',
    documentNumberPlaceholder: 'e.g. 125/2026/QD-TA, 45/CC-HD...',
    documentNumberHint: 'Official reference number printed on the legal document.',

    // Issuance date
    issuanceDateLabel: 'Issuance Date (Required)',
    issuanceDateHint: 'Day/Month/Year (DD/MM/YYYY)',

    // Action buttons
    btnForwardToLegal: 'Send to Legal Department',
    btnForwardHelper: 'Function is currently unavailable (requires valid dossier and version from server)',
    btnValidateForm: 'Check Form Completeness',
    btnReset: 'Reset Form',

    // Form completeness feedback
    validationSuccess: 'Document metadata is complete.',
    validationFailure: 'Please fill in all required document metadata fields.',

    // Validation error codes (dynamic i18n)
    issuerRequired: 'Please enter the issuing authority.',
    documentNumberRequired: 'Please enter the document number.',
    issuanceDateRequired: 'Please select the issuance date.',
    issuanceDateInvalid: 'Invalid issuance date.',
  },
};
