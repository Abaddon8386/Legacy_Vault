/**
 * Bilingual Dictionary for PS-56 / ST-28-29 Close & Archive Case
 * Follows Henedo style principles: concise, formal, and transparent.
 */

export const closeAndArchiveI18n = {
  vi: {
    pageTitle: 'Đóng & Lưu trữ hồ sơ',
    pageSubtitle: 'Tóm tắt biên nhận, thẩm định điều kiện hoàn tất và lưu trữ hồ sơ di sản.',

    // Server status section
    serverStatusHeading: 'Trạng thái hệ thống (từ Server)',
    sessionStatusLabel: 'Phiên thẩm định',
    vaultStatusLabel: 'Kho di sản',
    caseStatusLabel: 'Hồ sơ pháp lý',

    // Server status values
    statusSessionCompleted: 'Đã hoàn thành',
    statusSessionActive: 'Đang hoạt động',
    statusVaultArchived: 'Đã lưu trữ',
    statusVaultLocked: 'Đã khóa',
    statusVaultOpen: 'Đang mở',
    statusCaseClosed: 'Đã đóng',
    statusCaseInProgress: 'Đang xử lý',
    statusUnknown: 'Chưa rõ',

    // Read-only notification
    readOnlyBannerTitle: 'Hồ sơ đã lưu trữ (Chỉ đọc)',
    readOnlyBannerBody: 'Hồ sơ và kho di sản này đã chính thức được đóng và lưu trữ. Toàn bộ thông tin được bảo lưu ở chế độ chỉ đọc.',

    // Preconditions section
    preconditionsHeading: 'Điều kiện đóng & lưu trữ',
    preconditionsDesc: 'Hồ sơ chỉ đủ điều kiện đóng khi cả hai tiêu chí đạt 100%:',
    assetDeliveryCondition: 'Bàn giao tài sản: 100%',
    beneficiaryConfirmationCondition: 'Xác nhận của người thụ hưởng: 100%',

    // Condition evaluation results
    statusEligibleTitle: 'Đủ điều kiện đóng & lưu trữ',
    statusEligibleDesc: 'Cả hai điều kiện bàn giao tài sản và xác nhận thụ hưởng đều đã hoàn thành.',
    statusIneligibleTitle: 'Chưa đủ điều kiện đóng',
    statusIneligibleDesc: 'Hồ sơ chưa đạt đầy đủ điều kiện để thực hiện đóng:',
    statusIndeterminateTitle: 'Chưa đủ thông tin',
    statusIndeterminateDesc: 'Chưa có đủ số liệu hợp lệ để xác định điều kiện đóng hồ sơ.',

    // Unmet condition labels
    assetDeliveryIncomplete: 'Tài sản chưa được bàn giao đủ 100%.',
    beneficiaryConfirmationIncomplete: 'Người thụ hưởng chưa xác nhận đủ 100%.',
    assetDataUnavailable: 'Chưa đủ thông tin hợp lệ về tài sản.',
    beneficiaryDataUnavailable: 'Chưa đủ thông tin hợp lệ về người thụ hưởng.',

    // Receipt summary section
    receiptSummaryHeading: 'Tóm tắt biên nhận',
    receiptSummaryDesc: 'Danh sách biên nhận bàn giao tài sản và văn bản xác nhận đã được phát hành.',
    thReceiptCode: 'Mã biên nhận',
    thType: 'Loại biên nhận',
    thRecipient: 'Người nhận / Thụ hưởng',
    thIssuedDate: 'Ngày phát hành',
    thStatus: 'Trạng thái',
    receiptEmptyTitle: 'Chưa có bản ghi biên nhận',
    receiptEmptyDesc: 'Chưa có biên nhận nào được ghi nhận cho hồ sơ này.',

    // Receipt types
    typeAssetHandover: 'Bàn giao tài sản',
    typeBeneficiaryConfirm: 'Xác nhận người thụ hưởng',
    receiptVerified: 'Đã đối soát',
    receiptIssued: 'Đã phát hành',

    // Action section
    actionHeading: 'Thực hiện đóng & lưu trữ',
    btnExecuteCloseArchive: 'Đóng & Lưu trữ hồ sơ',
    functionUnavailableNotice: 'Chức năng hiện chưa khả dụng',
    actionDisabledExpl: 'Hành động ghi yêu cầu API hoàn tất từ máy chủ; hiện tại nút bấm tạm thời khóa.',
  },
  en: {
    pageTitle: 'Close & Archive Case',
    pageSubtitle: 'Review receipt summary, verify completion criteria, and archive heritage dossier.',

    // Server status section
    serverStatusHeading: 'System Status (from Server)',
    sessionStatusLabel: 'Execution Session',
    vaultStatusLabel: 'Heritage Vault',
    caseStatusLabel: 'Legal Dossier',

    // Server status values
    statusSessionCompleted: 'Completed',
    statusSessionActive: 'Active',
    statusVaultArchived: 'Archived',
    statusVaultLocked: 'Locked',
    statusVaultOpen: 'Open',
    statusCaseClosed: 'Closed',
    statusCaseInProgress: 'In Progress',
    statusUnknown: 'Unknown',

    // Read-only notification
    readOnlyBannerTitle: 'Case Archived (Read-Only)',
    readOnlyBannerBody: 'This case and heritage vault are formally closed and archived. All records are permanently locked in read-only mode.',

    // Preconditions section
    preconditionsHeading: 'Close & Archive Criteria',
    preconditionsDesc: 'Case closure is permitted ONLY when both criteria achieve 100%:',
    assetDeliveryCondition: 'Asset Delivery: 100%',
    beneficiaryConfirmationCondition: 'Beneficiary Confirmation: 100%',

    // Condition evaluation results
    statusEligibleTitle: 'Eligible for Closure & Archive',
    statusEligibleDesc: 'Both asset delivery and beneficiary confirmation criteria are fully met.',
    statusIneligibleTitle: 'Not Eligible for Closure',
    statusIneligibleDesc: 'This case cannot be closed due to unsatisfied criteria:',
    statusIndeterminateTitle: 'Information unavailable',
    statusIndeterminateDesc: 'Valid data is unavailable to evaluate closure preconditions.',

    // Unmet condition labels
    assetDeliveryIncomplete: 'Asset deliveries are not 100% complete.',
    beneficiaryConfirmationIncomplete: 'Beneficiary confirmations are not 100% complete.',
    assetDataUnavailable: 'Valid asset information is unavailable.',
    beneficiaryDataUnavailable: 'Valid beneficiary information is unavailable.',

    // Receipt summary section
    receiptSummaryHeading: 'Receipt Summary',
    receiptSummaryDesc: 'Summary of issued asset handover receipts and beneficiary acknowledgements.',
    thReceiptCode: 'Receipt Ref',
    thType: 'Receipt Type',
    thRecipient: 'Recipient / Beneficiary',
    thIssuedDate: 'Issued Date',
    thStatus: 'Status',
    receiptEmptyTitle: 'No receipts available',
    receiptEmptyDesc: 'No receipt records have been logged for this case.',

    // Receipt types
    typeAssetHandover: 'Asset Handover',
    typeBeneficiaryConfirm: 'Beneficiary Confirmation',
    receiptVerified: 'Verified',
    receiptIssued: 'Issued',

    // Action section
    actionHeading: 'Execute Case Closure',
    btnExecuteCloseArchive: 'Close & Archive Case',
    functionUnavailableNotice: 'This function is currently unavailable',
    actionDisabledExpl: 'Case closure mutation requires server-side API; write action is currently disabled.',
  },
};
