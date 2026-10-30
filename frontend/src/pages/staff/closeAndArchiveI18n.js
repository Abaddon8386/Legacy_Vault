/**
 * Bilingual Dictionary for PS-56 / ST-28-29 Close & Archive Case
 * Follows Henedo style principles: concise, formal, and transparent.
 */

export const closeAndArchiveI18n = {
  vi: {
    demo: 'Dữ liệu minh họa', loading: 'Đang tải…', retry: 'Thử lại',
    loadFailed: 'Chưa tải được thông tin phiên. Vui lòng thử lại.', contextRequired: 'Vui lòng chọn hồ sơ và phiên bàn giao.',
    saved: 'Đã ghi nhận. Đang tải lại dữ liệu.', cancelled: 'Đã hủy',
    recipientLabel: 'Người nhận biên bản', selectRecipient: 'Chọn người nhận', receiptScope: 'Tài sản đã giao trong phiên',
    pageTitle: 'Hoàn tất hồ sơ',
    pageSubtitle: 'Tóm tắt biên nhận, thẩm định điều kiện hoàn tất và lưu trữ hồ sơ di sản.',

    // Server status section
    serverStatusHeading: 'Trạng thái hệ thống',
    sessionStatusLabel: 'Phiên bàn giao',
    vaultStatusLabel: 'Kho di sản',
    caseStatusLabel: 'Hồ sơ pháp lý',
    labelSessionStatus: 'Phiên bàn giao',
    labelVaultStatus: 'Kho di sản',
    labelCaseStatus: 'Hồ sơ pháp lý',

    // Server status values
    statusSessionCompleted: 'Đã hoàn thành',
    statusSessionActive: 'Đang hoạt động',
    statusSessionInProgress: 'Đang bàn giao',
    statusVaultArchived: 'Đã lưu trữ',
    statusVaultLocked: 'Đã khóa',
    statusVaultOpen: 'Đang mở',
    statusCaseClosed: 'Đã đóng',
    statusCaseInProgress: 'Đang xử lý',
    statusUnavailable: 'Chưa có thông tin',

    // Read-only notification
    readOnlyBannerTitle: 'Hồ sơ đã lưu trữ (Chỉ đọc)',
    readOnlyBannerBody: 'Hồ sơ và kho di sản này đã chính thức được đóng và lưu trữ. Toàn bộ thông tin được bảo lưu ở chế độ chỉ đọc.',

    // Preconditions section
    preconditionsHeading: 'Điều kiện đóng & lưu trữ',
    preconditionsDesc: 'Hồ sơ chỉ đủ điều kiện đóng khi cả hai tiêu chí đạt 100%:',
    assetDeliveryCondition: 'Bàn giao tài sản: 100%',
    beneficiaryConfirmationCondition: 'Xác nhận của người thụ hưởng: 100%',
    condAssetGateTitle: 'Cổng bàn giao tài sản (100%)',
    condAssetGateMet: 'Đã hoàn tất bàn giao 100% tài sản trong phạm vi được duyệt.',
    condAssetGateUnmet: 'Chưa hoàn tất bàn giao tài sản (yêu cầu đạt 100%).',
    condBeneficiaryGateTitle: 'Cổng xác nhận người thụ hưởng (100%)',
    condBeneficiaryGateMet: 'Toàn bộ người thụ hưởng đã xác nhận tại quầy.',
    condBeneficiaryGateUnmet: 'Chưa đủ xác nhận từ người thụ hưởng (yêu cầu đạt 100%).',

    // Condition evaluation results
    statusEligibleTitle: 'Đủ điều kiện đóng & lưu trữ',
    statusEligibleDesc: 'Cả hai điều kiện bàn giao tài sản và xác nhận thụ hưởng đều đã hoàn thành.',
    statusIneligibleTitle: 'Chưa đủ điều kiện đóng',
    statusIneligibleDesc: 'Hồ sơ chưa đạt đầy đủ điều kiện để thực hiện đóng:',
    statusIndeterminateTitle: 'Chưa có thông tin',
    statusIndeterminateDesc: 'Chưa có thông tin để xác định điều kiện đóng hồ sơ.',

    // Unmet condition labels
    assetDeliveryIncomplete: 'Tài sản chưa được bàn giao đủ 100%.',
    beneficiaryConfirmationIncomplete: 'Người thụ hưởng chưa xác nhận đủ 100%.',
    assetDataUnavailable: 'Chưa có thông tin về tài sản.',
    beneficiaryDataUnavailable: 'Chưa có thông tin về người thụ hưởng.',

    // Receipt summary section
    receiptSummaryHeading: 'Tóm tắt biên nhận',
    receiptSummaryDesc: 'Danh sách biên nhận bàn giao tài sản và văn bản xác nhận đã được phát hành.',
    thReceiptCode: 'Mã biên nhận',
    thType: 'Loại biên nhận',
    thRecipient: 'Người nhận / Thụ hưởng',
    thIssuedDate: 'Ngày phát hành',
    thStatus: 'Trạng thái',
    receiptEmptyTitle: 'Chưa có bản ghi biên nhận',
    receiptEmptyDesc: 'Danh sách biên nhận trống.',
    receiptsUnavailableTitle: 'Chưa có thông tin biên nhận',
    receiptsUnavailableDesc: 'Dữ liệu biên nhận chưa được tải hoặc chưa được cung cấp.',

    // Receipt types
    typeAssetHandover: 'Bàn giao tài sản',
    typeBeneficiaryConfirm: 'Xác nhận người thụ hưởng',
    receiptVerified: 'Đã đối soát',
    receiptIssued: 'Đã phát hành',

    // Action section
    actionHeading: 'Thực hiện đóng & lưu trữ',
    btnExecuteCloseArchive: 'Hoàn tất hồ sơ',
    functionUnavailableNotice: 'Chức năng hiện chưa khả dụng',
    step1Title: 'Bước 1: Đóng phiên bàn giao',
    step1DescPending: 'Yêu cầu hoàn tất 2 cổng nghiệm thu kép (Bàn giao tài sản 100% & Xác nhận thụ hưởng 100%).',
    step1DescDone: 'Phiên đã được đóng thành công với bằng chứng kiểm toán.',
    step1Btn: 'Đóng phiên bàn giao',
    step1BtnDone: 'Phiên đã đóng',
    receiptBtnText: 'Lập biên bản xác nhận',
    step2Title: 'Bước 2: Lưu trữ kho di sản & Đóng ca',
    step2Desc: 'Kết thúc xử lý sau khi đủ ký nhận và biên nhận Staff; giữ hồ sơ để tra cứu.',
    step2Btn: 'Lưu trữ kho di sản & Đóng ca',
  },
  en: {
    demo: 'Illustrative data', loading: 'Loading…', retry: 'Retry',
    loadFailed: 'Session information could not be loaded. Please retry.', contextRequired: 'Select a case and handover session.',
    saved: 'Recorded. Refreshing data.', cancelled: 'Cancelled',
    recipientLabel: 'Receipt recipient', selectRecipient: 'Select a recipient', receiptScope: 'Assets delivered in this session',
    pageTitle: 'Complete case',
    pageSubtitle: 'Review receipt summary, verify completion criteria, and archive heritage dossier.',

    // Server status section
    serverStatusHeading: 'System Status',
    sessionStatusLabel: 'Handover Session',
    vaultStatusLabel: 'Heritage Vault',
    caseStatusLabel: 'Legal Dossier',
    labelSessionStatus: 'Handover Session',
    labelVaultStatus: 'Heritage Vault',
    labelCaseStatus: 'Legal Dossier',

    // Server status values
    statusSessionCompleted: 'Completed',
    statusSessionActive: 'Active',
    statusSessionInProgress: 'Handover in Progress',
    statusVaultArchived: 'Archived',
    statusVaultLocked: 'Locked',
    statusVaultOpen: 'Open',
    statusCaseClosed: 'Closed',
    statusCaseInProgress: 'In Progress',
    statusUnavailable: 'Information unavailable',

    // Read-only notification
    readOnlyBannerTitle: 'Case Archived (Read-Only)',
    readOnlyBannerBody: 'This case and heritage vault are formally closed and archived. All records are permanently locked in read-only mode.',

    // Preconditions section
    preconditionsHeading: 'Close & Archive Criteria',
    preconditionsDesc: 'Case closure is permitted ONLY when both criteria achieve 100%:',
    assetDeliveryCondition: 'Asset Delivery: 100%',
    beneficiaryConfirmationCondition: 'Beneficiary Confirmation: 100%',
    condAssetGateTitle: 'Asset Delivery Gate (100%)',
    condAssetGateMet: 'All approved assets delivered (100%).',
    condAssetGateUnmet: 'Asset deliveries not yet complete (100% required).',
    condBeneficiaryGateTitle: 'Beneficiary Confirmation Gate (100%)',
    condBeneficiaryGateMet: 'All beneficiaries confirmed in person (100%).',
    condBeneficiaryGateUnmet: 'Beneficiary confirmations not yet complete (100% required).',

    // Condition evaluation results
    statusEligibleTitle: 'Eligible for Closure & Archive',
    statusEligibleDesc: 'Both asset delivery and beneficiary confirmation criteria are fully met.',
    statusIneligibleTitle: 'Not Eligible for Closure',
    statusIneligibleDesc: 'This case cannot be closed due to unsatisfied criteria:',
    statusIndeterminateTitle: 'Information unavailable',
    statusIndeterminateDesc: 'Information is unavailable to evaluate closure preconditions.',

    // Unmet condition labels
    assetDeliveryIncomplete: 'Asset deliveries are not 100% complete.',
    beneficiaryConfirmationIncomplete: 'Beneficiary confirmations are not 100% complete.',
    assetDataUnavailable: 'Asset information is unavailable.',
    beneficiaryDataUnavailable: 'Beneficiary information is unavailable.',

    // Receipt summary section
    receiptSummaryHeading: 'Receipt Summary',
    receiptSummaryDesc: 'Summary of issued asset handover receipts and beneficiary acknowledgements.',
    thReceiptCode: 'Receipt Ref',
    thType: 'Receipt Type',
    thRecipient: 'Recipient / Beneficiary',
    thIssuedDate: 'Issued Date',
    thStatus: 'Status',
    receiptEmptyTitle: 'No receipts available',
    receiptEmptyDesc: 'The receipt list is empty.',
    receiptsUnavailableTitle: 'Receipt information unavailable',
    receiptsUnavailableDesc: 'Receipt data has not been loaded or is not provided.',

    // Receipt types
    typeAssetHandover: 'Asset Handover',
    typeBeneficiaryConfirm: 'Beneficiary Confirmation',
    receiptVerified: 'Verified',
    receiptIssued: 'Issued',

    // Action section
    actionHeading: 'Execute Case Closure',
    btnExecuteCloseArchive: 'Complete case',
    functionUnavailableNotice: 'This function is currently unavailable',
    step1Title: 'Step 1: Close Handover Session',
    step1DescPending: 'Requires dual completion gates (Asset delivery 100% & Beneficiary confirmation 100%).',
    step1DescDone: 'Session successfully closed with audit proof.',
    step1Btn: 'Close Handover Session',
    step1BtnDone: 'Session Completed',
    receiptBtnText: 'Generate Staff Receipt',
    step2Title: 'Step 2: Archive Vault & Close Case',
    step2Desc: 'Finish processing after all receipt requirements are met; retain the case history.',
    step2Btn: 'Archive Vault & Close Case',
  },
};
