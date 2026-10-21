export const staffLegalDocumentsI18n = {
  vi: {
    pageTitle: 'Hồ sơ căn cứ pháp lý',
    formSubtitle: 'Quản lý thông tin văn bản căn cứ pháp lý và chuẩn bị hồ sơ chuyển sang ban pháp lý thẩm định.',

    // Cảnh báo quy tắc nghiệp vụ
    staffNoticeTitle: 'Lưu ý hồ sơ căn cứ pháp lý',
    staffNoticeBody:
      'Thông tin văn bản và hồ sơ phải được đối chiếu chính xác trước khi chuyển cho ban pháp lý. Việc tiếp nhận văn bản không đồng nghĩa hồ sơ đã được phê duyệt hoặc tài sản đã được mở khóa.',

    // Lựa chọn hồ sơ ca xác minh
    caseSelectTitle: 'Hồ sơ xác minh xử lý',
    caseSelectLabel: 'Mã hồ sơ xác minh',
    caseSelectPlaceholder: 'Mã hồ sơ hoặc chọn từ danh sách...',
    btnLoadDossier: 'Mở hồ sơ',
    loadingDossier: 'Đang tải thông tin hồ sơ...',
    btnSelectCase: 'Chọn hồ sơ',
    btnChangeCase: 'Đổi hồ sơ',
    noCaseSelected: 'Chưa chọn hồ sơ xác minh. Vui lòng chọn hồ sơ từ danh sách để tiếp tục.',
    activeCaseHeading: 'Hồ sơ đang xử lý',

    // Trạng thái hồ sơ
    dossierSectionTitle: 'Thông tin hồ sơ và phiên bản lưu trữ',
    dossierStatusLabel: 'Trạng thái hồ sơ:',
    routeLabel: 'Nhánh căn cứ pháp lý:',
    dossierVersionLabel: 'Phiên bản hồ sơ lưu trữ:',
    dossierHashLabel: 'Mã băm SHA-256 lưu trữ:',
    forwardStatusLabel: 'Trạng thái chuyển pháp chế:',
    forwardedAtLabel: 'Thời điểm chuyển:',
    selectedDossierLabel: 'Hồ sơ chỉ định chuyển:',
    selectedDossierUnloaded: 'Chưa có hồ sơ được chỉ định',
    dossierVersionUnloaded: 'Chưa có phiên bản',
    dossierHashUnloaded: 'Chưa có mã băm',

    // Nhánh & Trạng thái dịch
    routeNotarial: 'Công chứng (NOTARIAL)',
    routeCourt: 'Tòa án (COURT)',
    routeOnHold: 'Tạm dừng (ON_HOLD)',
    statusDraft: 'Bản thảo (Chờ tiếp nhận văn bản)',
    statusProvided: 'Đã tiếp nhận văn bản (Chờ chuyển Pháp chế)',
    statusForwarded: 'Đã chuyển Pháp chế thẩm định',
    statusOnHold: 'Đang tạm giữ / Chờ xử lý tranh chấp',
    forwardStatusNotForwarded: 'Chưa chuyển Pháp chế',
    forwardStatusForwarded: 'Đã chuyển Pháp chế',

    // Cảnh báo trạng thái đặc biệt
    awaitingLegalDossierTitle: 'Chưa có hồ sơ căn cứ pháp lý',
    awaitingLegalDossierDesc: 'Chuyên viên Pháp lý chưa tạo hồ sơ và phân loại nhánh căn cứ pháp lý cho ca xác minh này. Nhân viên quầy chưa thể tiếp nhận văn bản số hóa.',
    dossierOnHoldTitle: 'Hồ sơ đang ở trạng thái TẠM DỪNG (ON_HOLD)',
    dossierOnHoldDesc: 'Hồ sơ đang được giữ để xác minh bổ sung hoặc phân loại lại. Chưa thể tiếp nhận văn bản mới cho đến khi có quyết định tiếp tục từ Pháp lý.',
    dossierAlreadyForwardedNotice: 'Phiên bản mới nhất đã được chuyển cho Ban Pháp lý thẩm định. Không cần chuyển lại.',

    // Biểu mẫu thông tin văn bản căn cứ
    formTitle: 'Tiếp nhận phiên bản văn bản căn cứ mới',
    formDesc: 'Nhập thông tin chi tiết và tải lên tệp số hóa của văn bản căn cứ pháp lý.',
    legalBasisTypeLabel: 'Loại văn bản căn cứ (Bắt buộc)',
    typeNotarialPartition: 'Văn bản thỏa thuận phân chia di sản công chứng',
    typeCourtJudgment: 'Bản án có hiệu lực pháp luật của Tòa án',
    typeCourtDecision: 'Quyết định công nhận thỏa thuận của Tòa án',

    // Cơ quan ban hành
    issuerLabel: 'Cơ quan ban hành (Bắt buộc)',
    issuerPlaceholder: 'VD: Văn phòng Công chứng Thăng Long, TAND TP. Hà Nội...',
    issuerHint: 'Tên cơ quan hoặc tổ chức có thẩm quyền ban hành/công chứng văn bản.',

    // Số hiệu văn bản
    documentNumberLabel: 'Số hiệu văn bản (Bắt buộc)',
    documentNumberPlaceholder: 'VD: 118/2026/VB-CC, 45/2026/QĐ-TA...',
    documentNumberHint: 'Số hiệu chính thức ghi trên văn bản căn cứ.',

    // Ngày ban hành
    issuanceDateLabel: 'Ngày ban hành (Bắt buộc)',
    issuanceDateHint: 'Ngày ban hành văn bản (không được ở tương lai)',

    // Thông tin công chứng bổ sung (bắt buộc với NOTARIAL)
    notarySectionTitle: 'Thông tin công chứng xác thực',
    notaryAuthorityLabel: 'Tổ chức hành nghề công chứng',
    notaryAuthorityPlaceholder: 'Tên tổ chức hành nghề công chứng...',
    notarialDocNumberLabel: 'Số công chứng',
    notarialDocNumberPlaceholder: 'Số công chứng trong sổ lưu trữ...',
    notarizedAtLabel: 'Ngày công chứng',

    // Tham chiếu chứng từ & ghi chú
    evidenceReferenceLabel: 'Mã tham chiếu hồ sơ giấy (Tùy chọn)',
    evidenceReferencePlaceholder: 'VD: HS-GIAY-2026-09, Ngăn lưu trữ B-12...',
    evidenceReferenceHint: 'Mã số biên nhận lưu trữ hoặc vị trí lưu trữ bản gốc giấy tại văn phòng.',
    notesLabel: 'Ghi chú bổ sung (Tùy chọn)',
    notesPlaceholder: 'Nội dung ghi chú hoặc lưu ý đặc biệt về văn bản...',

    // Tệp số hóa chứng cứ
    fileUploadLabel: 'Tệp số hóa văn bản căn cứ (Bắt buộc)',
    fileUploadHint: 'Định dạng PDF, JPEG hoặc PNG (tối đa 10 MB)',

    // Nút hành động
    btnSubmitVersion: 'Tiếp nhận & Lưu phiên bản',
    submittingVersion: 'Đang tiếp nhận và tải tệp lên...',
    btnForwardToLegal: 'Chuyển Ban Pháp lý thẩm định',
    forwardingToLegal: 'Đang chuyển cho Ban Pháp lý...',
    btnForwardHelper: 'Chỉ khả dụng khi hồ sơ đã có phiên bản mới nhất chưa chuyển',

    // Phản hồi hành động
    uploadSuccessNotice: 'Tiếp nhận văn bản thành công. Phiên bản số hóa đã được lưu trữ an toàn.',
    forwardSuccessNotice: 'Đã chuyển thành công phiên bản mới nhất cho Ban Pháp lý thẩm định.',
    versionStaleError: 'Phiên bản cần chuyển không phải phiên bản mới nhất của hồ sơ (BASIS_VERSION_STALE).',
    dossierStateInvalid: 'Trạng thái hồ sơ hoặc ca xác minh không cho phép thao tác này.',

    // Lỗi validation
    issuerRequired: 'Vui lòng nhập cơ quan ban hành.',
    documentNumberRequired: 'Vui lòng nhập số hiệu văn bản.',
    issuanceDateRequired: 'Vui lòng chọn ngày ban hành.',
    issuanceDateInvalid: 'Ngày ban hành không hợp lệ hoặc ở tương lai.',
    notaryRequired: 'Văn bản thỏa thuận công chứng bắt buộc có đầy đủ thông tin tổ chức, số công chứng và ngày công chứng.',
    fileRequired: 'Vui lòng tải lên tệp số hóa của văn bản căn cứ.',

    // Tabs
    tabOverview: 'Tổng quan',
    tabIntake: 'Tiếp nhận văn bản',
    tabHistory: 'Lịch sử các phiên bản',
    versionText: 'Phiên bản',

    // Allocations (Finding B)
    allocationsSectionTitle: 'Phạm vi phân bổ tài sản theo văn bản Tòa án',
    allocationsSectionDesc: 'Danh sách tài sản và người nhận được Tòa án phán quyết phân chia. Bắt buộc có ít nhất một mục phân bổ hợp lệ.',
    allocationAssetId: 'Mã tài sản (assetId)',
    allocationBeneficiaryId: 'Mã người nhận (beneficiaryId)',
    allocationDescription: 'Nội dung phân chia theo phán quyết',
    btnAddAllocation: '+ Thêm phân bổ',
    btnRemoveAllocation: 'Xóa',
    allocationBlockerWarning: 'Văn bản căn cứ pháp lý bắt buộc phải có ít nhất một mục phân bổ tài sản cho người nhận theo bản án tòa án (Chờ dữ liệu liên kết tài sản - người thụ hưởng từ PS-88/PS-93/PS-102).',
    allocationInvalidWarning: 'Mỗi mục phân bổ phải có mã tài sản và mã người nhận hợp lệ (UUID), không được trùng lặp.',
    allocationEmptyTitle: 'Chưa có phân bổ tài sản',

    // Legacy Notarial and Technical details
    legacyNotarialNotice: 'Văn bản thỏa thuận công chứng (NOTARIAL) thuộc luồng cũ, chỉ dùng để tra cứu lịch sử. Toàn bộ quy trình mới áp dụng văn bản Tòa án (COURT).',
    technicalDetailsTitle: 'Chi tiết kỹ thuật lưu trữ',
    btnGoToIntake: 'Tiếp nhận phiên bản mới',

    // Unsaved draft modal
    unsavedChangesTitle: 'Bản nháp chưa lưu',
    unsavedChangesDesc: 'Bạn có dữ liệu tiếp nhận văn bản chưa lưu. Bạn có chắc chắn muốn đổi sang hồ sơ khác và hủy bản nháp này?',
    btnDiscardAndSwitch: 'Hủy bản nháp và đổi hồ sơ',
    btnKeepEditing: 'Tiếp tục chỉnh sửa',

    // Dữ liệu mẫu preview
    previewBannerLabel: 'CHẾ ĐỘ MINH HỌA (DEV PREVIEW)',
    previewBannerDesc: 'Dữ liệu đang hiển thị là mô phỏng phục vụ kiểm thử giao diện. Các thao tác ghi nhận không làm thay đổi cơ sở dữ liệu thật.',

    // NOTARIAL read-only & Blocker PS-88/93/102
    notarialReadOnlyBannerTitle: 'Hồ sơ Công chứng (NOTARIAL) chỉ đọc',
    notarialReadOnlyBannerDesc: 'Hồ sơ thuộc nhánh Công chứng là dữ liệu lịch sử chỉ đọc. Nhân viên quầy không thể tiếp nhận phiên bản mới hoặc chuyển Ban Pháp lý cho nhánh này (Chờ BE COURT-only PS-102).',
    metadataBlockerLiveNotice: 'Chưa có danh mục tài sản để lập phân bổ. Chưa thể tiếp nhận phiên bản mới.',
    metadataBlockedTooltip: 'Chờ danh mục tài sản của hồ sơ',
  },

  en: {
    pageTitle: 'Legal Basis Documents',
    formSubtitle: 'Manage legal basis document metadata and prepare dossiers for Legal Department verification.',

    // Business regulatory notice
    staffNoticeTitle: 'Legal Basis Document Notice',
    staffNoticeBody:
      'Document metadata and dossiers must be verified accurately before sending to Legal Department. Entering metadata does not imply that the dossier has been approved or assets unlocked.',

    // Case selection
    caseSelectTitle: 'Verification Case Processing',
    caseSelectLabel: 'Case reference',
    caseSelectPlaceholder: 'Case reference or select from list...',
    btnLoadDossier: 'Open dossier',
    loadingDossier: 'Loading dossier records...',
    btnSelectCase: 'Select case',
    btnChangeCase: 'Change case',
    noCaseSelected: 'No verification case selected. Please select a case from the list to continue.',
    activeCaseHeading: 'Active Case',

    // Stored dossier and version section
    dossierSectionTitle: 'Stored Dossier & Version Records',
    dossierStatusLabel: 'Dossier Status:',
    routeLabel: 'Legal Basis Route:',
    dossierVersionLabel: 'Stored Dossier Version:',
    dossierHashLabel: 'Stored SHA-256 Hash:',
    forwardStatusLabel: 'Legal Forward Status:',
    forwardedAtLabel: 'Forwarded At:',
    selectedDossierLabel: 'Designated Transfer Dossier:',
    selectedDossierUnloaded: 'No dossier designated',
    dossierVersionUnloaded: 'No version loaded',
    dossierHashUnloaded: 'No hash loaded',

    // Route & Status
    routeNotarial: 'Notarial Route (NOTARIAL)',
    routeCourt: 'Court Route (COURT)',
    routeOnHold: 'On Hold (ON_HOLD)',
    statusDraft: 'Draft (Awaiting Document Intake)',
    statusProvided: 'Legal Basis Provided (Ready for Legal Forward)',
    statusForwarded: 'Forwarded to Legal Department',
    statusOnHold: 'On Hold / Dispute Pending',
    forwardStatusNotForwarded: 'Not Forwarded to Legal',
    forwardStatusForwarded: 'Forwarded to Legal',

    // Special status notices
    awaitingLegalDossierTitle: 'No Legal Basis Dossier Found',
    awaitingLegalDossierDesc: 'The Legal Verifier has not yet created or classified a legal basis dossier for this verification case. Counter staff cannot intake digitized documents at this time.',
    dossierOnHoldTitle: 'Dossier is ON HOLD',
    dossierOnHoldDesc: 'The dossier is currently on hold for supplementary verification or re-review. Document intake is suspended until resumed by the Legal Department.',
    dossierAlreadyForwardedNotice: 'The latest version has already been forwarded to the Legal Department. No re-forwarding required.',

    // Document metadata form
    formTitle: 'Intake New Legal Basis Version',
    formDesc: 'Enter document metadata and upload the digitized copy of the legal basis document.',
    legalBasisTypeLabel: 'Document Basis Type (Required)',
    typeNotarialPartition: 'Notarized Estate Partition Agreement',
    typeCourtJudgment: 'Legally Effective Court Judgment',
    typeCourtDecision: 'Court Settlement Decision',

    // Issuing authority
    issuerLabel: 'Issuing Authority (Required)',
    issuerPlaceholder: "e.g. Thang Long Notary Office, People's Court of Hanoi...",
    issuerHint: 'Authorized organization or agency issuing or notarizing the document.',

    // Document number
    documentNumberLabel: 'Document Number (Required)',
    documentNumberPlaceholder: 'e.g. 118/2026/VB-CC, 45/2026/QD-TA...',
    documentNumberHint: 'Official reference number printed on the legal document.',

    // Issuance date
    issuanceDateLabel: 'Issuance Date (Required)',
    issuanceDateHint: 'Date of issuance (cannot be in the future)',

    // Notary fields
    notarySectionTitle: 'Notarial Certification Details',
    notaryAuthorityLabel: 'Notary Practice Organization',
    notaryAuthorityPlaceholder: 'Name of the notary practice organization...',
    notarialDocNumberLabel: 'Notarial Document Number',
    notarialDocNumberPlaceholder: 'Notarial registry number...',
    notarizedAtLabel: 'Notarization Date',

    // References & notes
    evidenceReferenceLabel: 'Physical Record Reference (Optional)',
    evidenceReferencePlaceholder: 'e.g. HS-PHYS-2026-09, Storage Locker B-12...',
    evidenceReferenceHint: 'Physical receipt docket code or storage location of original paper documents.',
    notesLabel: 'Additional Notes (Optional)',
    notesPlaceholder: 'Enter any additional remarks or observations...',

    // File upload
    fileUploadLabel: 'Digitized Document File (Required)',
    fileUploadHint: 'PDF, JPEG, or PNG format (up to 10 MB)',

    // Action buttons
    btnSubmitVersion: 'Intake & Save Version',
    submittingVersion: 'Intaking and uploading file...',
    btnForwardToLegal: 'Send to Legal Department',
    forwardingToLegal: 'Forwarding to Legal Department...',
    btnForwardHelper: 'Only available when the dossier has a latest version that has not yet been forwarded',

    // Feedback
    uploadSuccessNotice: 'Document intake successful. The digitized version has been securely stored.',
    forwardSuccessNotice: 'The latest version was successfully forwarded to Legal Department for verification.',
    versionStaleError: 'The version being forwarded is not the latest version of the dossier (BASIS_VERSION_STALE).',
    dossierStateInvalid: 'The dossier or verification case state does not permit this action.',

    // Validation errors
    issuerRequired: 'Please enter the issuing authority.',
    documentNumberRequired: 'Please enter the document number.',
    issuanceDateRequired: 'Please select the issuance date.',
    issuanceDateInvalid: 'Invalid issuance date or date is in the future.',
    notaryRequired: 'Notarized documents require notary organization, document number, and notarization date.',
    fileRequired: 'Please upload a digitized document file.',

    // Tabs
    tabOverview: 'Overview',
    tabIntake: 'Document Intake',
    tabHistory: 'Version History',
    versionText: 'Version',

    // Allocations (Finding B)
    allocationsSectionTitle: 'Asset Allocation Scope per Court Judgment',
    allocationsSectionDesc: 'List of assets and designated beneficiaries apportioned by the Court. At least one valid allocation entry is required.',
    allocationAssetId: 'Asset ID (UUID)',
    allocationBeneficiaryId: 'Beneficiary ID (UUID)',
    allocationDescription: 'Allocation description per judgment',
    btnAddAllocation: '+ Add allocation',
    btnRemoveAllocation: 'Remove',
    allocationBlockerWarning: 'Court legal basis document requires at least one asset-beneficiary allocation per court judgment (Awaiting asset-beneficiary linkage data from PS-88/PS-93/PS-102).',
    allocationInvalidWarning: 'Each allocation item must contain valid asset ID and beneficiary ID (UUID), with no duplicate pairs.',
    allocationEmptyTitle: 'No asset allocations defined',

    // Legacy Notarial and Technical details
    legacyNotarialNotice: 'Notarized partition agreements (NOTARIAL) belong to the legacy workflow and are retained for historical reference only. All new procedures use Court judgments/decisions (COURT).',
    technicalDetailsTitle: 'Technical Storage Details',
    btnGoToIntake: 'Intake new version',

    // Unsaved draft modal
    unsavedChangesTitle: 'Unsaved Draft Changes',
    unsavedChangesDesc: 'You have unsaved document intake changes. Are you sure you want to switch cases and discard this draft?',
    btnDiscardAndSwitch: 'Discard draft and switch',
    btnKeepEditing: 'Keep editing',

    // Preview
    previewBannerLabel: 'PREVIEW DEMONSTRATION MODE',
    previewBannerDesc: 'Data shown is synthetic for UI testing purposes. Intake and forward actions do not affect the live database.',

    // NOTARIAL read-only & Blocker PS-88/93/102
    notarialReadOnlyBannerTitle: 'Notarial Dossier is Read-Only',
    notarialReadOnlyBannerDesc: 'This dossier belongs to the legacy Notarial route and is read-only. Staff cannot upload new versions or forward to Legal for this route (COURT route only per PS-102).',
    metadataBlockerLiveNotice: 'The asset catalog is unavailable. A new allocation and document version cannot be recorded yet.',
    metadataBlockedTooltip: 'Awaiting the case asset catalog',
  },
};
