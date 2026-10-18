/**
 * Localization dictionary for PS-55 Completion Progress
 * Clean, user-friendly copy adhering to Henedo art direction.
 * Uses "Chưa đủ thông tin" / "Information unavailable" for missing/indeterminate data.
 */

export const completionProgressI18n = {
  vi: {
    pageTitle: 'Tiến độ hoàn tất hồ sơ',
    pageSubtitle: 'Theo dõi đồng thời hai tiến độ độc lập: bàn giao tài sản và xác nhận của người thụ hưởng.',
    ruleNoticeTitle: 'Điều kiện hoàn tất hồ sơ',
    ruleNoticeBody: 'Hồ sơ chỉ được xác định là hoàn tất khi cả hai điều kiện được đáp ứng đồng thời: 100% tài sản đã được bàn giao VÀ 100% người thụ hưởng đã xác nhận.',
    caseSelectLabel: 'Mã hồ sơ / ca thẩm định',
    caseSelectPlaceholder: 'Nhập hoặc chọn mã hồ sơ...',
    btnReset: 'Đặt lại',
    // Cards
    assetProgressCardTitle: 'Tiến độ bàn giao tài sản',
    assetProgressCardDesc: 'Tỷ lệ tài sản di sản trong phạm vi đã được bàn giao thực tế.',
    benProgressCardTitle: 'Tiến độ xác nhận người thụ hưởng',
    benProgressCardDesc: 'Tỷ lệ người thụ hưởng đã hoàn tất ký nhận và xác nhận.',
    countLabel: 'Số lượng thực hiện',
    percentageLabel: 'Tiến độ',
    unverifiedNotice: 'Chưa có thông tin',
    // Status badges
    statusComplete100: 'Đạt 100%',
    statusIncomplete: 'Chưa hoàn tất',
    statusAwaitingData: 'Chưa có thông tin',
    // Overall status banners
    overallCompletedTitle: 'Đủ điều kiện hoàn tất hồ sơ',
    overallCompletedDesc: 'Cả hai tiêu chí bàn giao tài sản (100%) và xác nhận thụ hưởng (100%) đều đã hoàn thành trọn vẹn.',
    overallIncompleteTitle: 'Chưa đủ điều kiện hoàn tất',
    overallIncompleteDesc: 'Hồ sơ chưa thể hoàn tất do còn điều kiện chưa đạt:',
    overallAwaitingTitle: 'Chưa có thông tin',
    overallAwaitingDesc: 'Chưa có thông tin để xác định tiến độ hoàn tất.',
    // Missing condition labels
    assetDeliveryIncomplete: 'Tài sản chưa được bàn giao đủ 100%.',
    beneficiaryConfirmationIncomplete: 'Người thụ hưởng chưa xác nhận đủ 100%.',
    assetDataUnavailable: 'Chưa có thông tin về tài sản.',
    beneficiaryDataUnavailable: 'Chưa có thông tin về người thụ hưởng.',
  },
  en: {
    pageTitle: 'Case Completion Progress',
    pageSubtitle: 'Track dual independent progress metrics: asset handover and beneficiary confirmations.',
    ruleNoticeTitle: 'Completion Precondition',
    ruleNoticeBody: 'A case is considered complete ONLY when both criteria are met simultaneously: 100% assets delivered AND 100% beneficiaries confirmed.',
    caseSelectLabel: 'Case / Docket Reference',
    caseSelectPlaceholder: 'Enter or select docket reference...',
    btnReset: 'Reset',
    // Cards
    assetProgressCardTitle: 'Asset Handover Progress',
    assetProgressCardDesc: 'Proportion of scoped heritage assets physically delivered.',
    benProgressCardTitle: 'Beneficiary Confirmation Progress',
    benProgressCardDesc: 'Proportion of designated beneficiaries who confirmed acknowledgement.',
    countLabel: 'Execution Count',
    percentageLabel: 'Progress',
    unverifiedNotice: 'Information unavailable',
    // Status badges
    statusComplete100: '100% Completed',
    statusIncomplete: 'Incomplete',
    statusAwaitingData: 'Information unavailable',
    // Overall status banners
    overallCompletedTitle: 'Eligible for Case Completion',
    overallCompletedDesc: 'Both criteria—100% asset delivery and 100% beneficiary confirmation—are fully satisfied.',
    overallIncompleteTitle: 'Completion Criteria Not Met',
    overallIncompleteDesc: 'This case cannot be completed due to unfulfilled criteria:',
    overallAwaitingTitle: 'Information unavailable',
    overallAwaitingDesc: 'Information is unavailable to determine completion progress.',
    // Missing condition labels
    assetDeliveryIncomplete: 'Asset deliveries are not 100% complete.',
    beneficiaryConfirmationIncomplete: 'Beneficiary confirmations are not 100% complete.',
    assetDataUnavailable: 'Asset information is unavailable.',
    beneficiaryDataUnavailable: 'Beneficiary information is unavailable.',
  },
};
