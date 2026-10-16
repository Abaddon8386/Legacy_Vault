export const legalBasisRouteI18n = {
  vi: {
    pageTitle: 'Thẩm định căn cứ',
    formSubtitle: 'Lựa chọn phương án xử lý căn cứ pháp lý phù hợp với tình trạng hồ sơ.',

    // Cảnh báo quy tắc nghiệp vụ
    basisNoticeTitle: 'Lưu ý thẩm định căn cứ',
    basisNoticeBody:
      'Chọn phương án xử lý phù hợp với bằng chứng và tình trạng tranh chấp. Việc lựa chọn không đồng nghĩa hồ sơ đã được phê duyệt hoặc tài sản đã được mở khóa.',

    // Hàng đợi / Dữ liệu hồ sơ máy chủ (chưa có API)
    docketSectionTitle: 'Thông tin hồ sơ thẩm định',
    docketUnconnectedTitle: 'Chưa thể tải dữ liệu hồ sơ',
    docketUnconnectedDesc: 'Chưa thể kết nối danh sách hồ sơ hoặc thông tin căn cứ pháp lý từ máy chủ.',
    recordedStatusLabel: 'Trạng thái hồ sơ hiện tại:',
    recordedStatusUnloaded: 'Chưa thể tải thông tin',

    // Biểu mẫu lựa chọn phương án xử lý
    formTitle: 'Lựa chọn phương án xử lý',
    formDesc: 'Chọn một phương án xử lý và nhập lý do lựa chọn.',

    docketRefLabel: 'Mã hồ sơ / Tham chiếu',
    docketRefHint: 'Mã số hồ sơ hoặc mã kho cần thẩm định.',
    docketRefPlaceholder: 'VD: BASIS-ROUTE-2026-001',

    // 3 lựa chọn theo AC (không hiển thị mã nội bộ)
    routeGroupLabel: 'Phương án xử lý (Bắt buộc)',
    routeNotarialTitle: 'Công chứng',
    routeNotarialDesc: 'Áp dụng khi phù hợp và không có tranh chấp.',
    routeCourtTitle: 'Tòa án',
    routeCourtDesc: 'Áp dụng khi có tranh chấp.',
    routeOnHoldTitle: 'Tạm dừng xử lý',
    routeOnHoldDesc: 'Áp dụng khi thiếu bằng chứng hoặc phát sinh tranh chấp mới.',

    // Lý do lựa chọn
    reasonLabel: 'Lý do lựa chọn (Bắt buộc)',
    reasonHint: 'Nhập lý do lựa chọn phương án xử lý.',
    reasonPlaceholder: 'Nhập lý do lựa chọn phương án xử lý...',

    // Khu vực lịch sử xử lý
    reviewHistoryTitle: 'Lịch sử xử lý',
    reviewHistoryNoData: 'Chưa thể tải lịch sử xử lý',
    reviewHistoryDesc: 'Chưa thể kết nối thông tin lịch sử của hồ sơ.',
    currentUserLabel: 'Tài khoản thẩm định:',
    currentUserNote: '(Tách biệt với lịch sử xử lý)',

    // Nút hành động
    btnSubmit: 'Xác nhận phương án xử lý',
    btnSubmitHelper: 'Chức năng hiện chưa khả dụng',
    btnValidateLocal: 'Kiểm tra biểu mẫu',
    btnReset: 'Làm mới',

    // Phản hồi kiểm tra biểu mẫu
    validationSuccess: 'Biểu mẫu đã điền đủ thông tin (đã chọn phương án và nhập lý do hợp lệ).',
    validationFailure: 'Vui lòng kiểm tra lại: cần chọn một phương án xử lý và nhập lý do.',

    // Mã lỗi validation (dynamic i18n)
    routeRequired: 'Vui lòng chọn một phương án xử lý.',
    routeInvalid: 'Phương án xử lý được chọn không hợp lệ.',
    reasonRequired: 'Vui lòng nhập lý do lựa chọn phương án xử lý.',
  },

  en: {
    pageTitle: 'Basis Adjudication',
    formSubtitle: 'Select the appropriate legal basis handling option based on dossier status.',

    // Business regulatory rule notice
    basisNoticeTitle: 'Basis Adjudication Notice',
    basisNoticeBody:
      'Select a handling option appropriate to the evidence and dispute status. Selection does not imply that the docket has been approved or assets have been unlocked.',

    // Docket / Server data status (API unready)
    docketSectionTitle: 'Docket Adjudication Information',
    docketUnconnectedTitle: 'Unable to load docket data',
    docketUnconnectedDesc: 'Unable to retrieve adjudication dockets or legal basis information from the server.',
    recordedStatusLabel: 'Current Docket Status:',
    recordedStatusUnloaded: 'Unable to load information',

    // Form
    formTitle: 'Handling Option Selection',
    formDesc: 'Select a handling option and provide the selection rationale.',

    docketRefLabel: 'Docket / Reference Identifier',
    docketRefHint: 'Docket or vault reference identifier.',
    docketRefPlaceholder: 'e.g. BASIS-ROUTE-2026-001',

    // 3 options per AC (no internal codes displayed)
    routeGroupLabel: 'Handling Option (Required)',
    routeNotarialTitle: 'Notarial',
    routeNotarialDesc: 'Applicable when suitable and undisputed.',
    routeCourtTitle: 'Court',
    routeCourtDesc: 'Applicable when a dispute exists.',
    routeOnHoldTitle: 'On-hold',
    routeOnHoldDesc: 'Applicable when evidence is lacking or a new dispute arises.',

    // Selection rationale
    reasonLabel: 'Selection Rationale (Required)',
    reasonHint: 'Enter rationale for the selected handling option.',
    reasonPlaceholder: 'Enter rationale for the selected handling option...',

    // Processing history
    reviewHistoryTitle: 'Processing History',
    reviewHistoryNoData: 'Unable to load processing history',
    reviewHistoryDesc: 'Unable to retrieve history for this docket.',
    currentUserLabel: 'Verifying account:',
    currentUserNote: '(Distinct from past processing history)',

    // Action buttons
    btnSubmit: 'Confirm Handling Option',
    btnSubmitHelper: 'Function is currently unavailable',
    btnValidateLocal: 'Check Form Completeness',
    btnReset: 'Reset Form',

    // Local validation feedback
    validationSuccess: 'Form is complete (handling option selected and valid rationale provided).',
    validationFailure: 'Please check the form: a handling option and rationale are required.',

    // Validation error codes (dynamic i18n)
    routeRequired: 'Please select a handling option.',
    routeInvalid: 'Invalid handling option selected.',
    reasonRequired: 'Please enter rationale for the selected handling option.',
  },
};
