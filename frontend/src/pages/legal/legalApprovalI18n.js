/**
 * LegacyVault — Song ngữ (VI/EN) cho Phê duyệt Hồ sơ Di sản
 *
 * Tiêu chuẩn giao diện: trang trọng, chính xác, không dùng mã ticket nội bộ trong nhãn người dùng.
 */

export const LEGAL_APPROVAL_TRANSLATIONS = {
  vi: {
    portalTitle: 'Cổng thẩm định pháp lý — Phê duyệt hồ sơ',
    roleBadge: 'Chuyên viên thẩm định pháp lý',
    previewTag: 'Xem trước DEV (Mô phỏng)',
    logoutBtn: 'Đăng xuất',
    refreshBtn: 'Làm mới dữ liệu',
    refreshingBtn: 'Đang làm mới...',
    pageTitle: 'Phê duyệt hồ sơ',
    pageSubtitle:
      'Kiểm tra giấy tờ và thông tin phân chia tài sản trước khi ghi nhận quyết định.',

    // Trợ giúp quy tắc nghiệp vụ thu gọn
    boundary: {
      title: 'Trợ giúp quy tắc & thẩm quyền phê duyệt',
      notice1:
        'Quyết định phê duyệt chỉ xác nhận tính hợp lệ của văn bản di chúc và phạm vi phân bổ tài sản trong hồ sơ.',
      notice2:
        'Phê duyệt hồ sơ không tự động mở khóa kho di sản. Mở khóa cần một lần xác nhận riêng.',
      notice3:
        'Nếu giấy tờ, thông tin phân chia hoặc tình trạng tranh chấp thay đổi, cần xem xét lại phê duyệt trước đó.',
    },

    // Thanh chọn kịch bản DEV preview
    scenarioBar: {
      label: 'Kịch bản xem trước DEV:',
      complete: 'Hồ sơ đầy đủ (Hợp lệ)',
      stale: 'Hồ sơ đã thay đổi, cần thẩm định lại',
      disputed: 'Hồ sơ đang có tranh chấp',
      missingScope: 'Hồ sơ chưa có phạm vi phân bổ tài sản',
      liveNotice: 'Chế độ thật: Chờ tích hợp dịch vụ',
      resetBtn: 'Đặt lại kịch bản',
      initialLabel: 'Kịch bản gốc:',
      currentLabel: 'Trạng thái hiện tại:',
      statePristine: 'Chưa thao tác',
      stateModified: 'Đã thay đổi',
      stateSubmitted: 'Đã ghi nhận quyết định',
    },

    // Thẻ 1: Thông tin tham chiếu hồ sơ
    dossierSection: {
      title: 'Thông tin tham chiếu hồ sơ',
      dossierId: 'Mã hồ sơ',
      vaultName: 'Kho di sản',
      vaultId: 'Mã kho',
      ownerName: 'Chủ sở hữu di sản',
      createdAt: 'Thời điểm tiếp nhận hồ sơ',
      status: 'Trạng thái hồ sơ',
      unspecified: 'Chưa xác định',
    },

    // Thẻ 2: Phiên bản & Toàn vẹn mã băm SHA-256
    integritySection: {
      title: 'Văn bản di chúc',
      versionLabel: 'Phiên bản văn bản',
      fileNameLabel: 'Tệp số hóa lưu trữ',
      uploadedAtLabel: 'Thời điểm cập nhật bản số hóa',
    },

    // Thẻ 3: Phạm vi phân bổ tài sản & Người thụ hưởng
    scopeSection: {
      title: 'Phạm vi phân bổ tài sản',
      tableAsset: 'Tài sản phân bổ',
      tableCategory: 'Phân loại',
      tableBeneficiary: 'Người thụ hưởng chỉ định',
      tableShare: 'Tỷ lệ / Phần phân bổ',
      tableConditions: 'Điều kiện đi kèm',
      noConditions: 'Không có điều kiện đặc biệt',
      emptyScopeTitle: 'Chưa có phạm vi phân bổ tài sản',
      emptyScopeDesc:
        'Hồ sơ này chưa có danh mục phân bổ tài sản được xác nhận. Không thể thẩm định khi thiếu phạm vi phân bổ.',
    },

    // Thẻ 4: Trạng thái hiệu lực phê duyệt & Tranh chấp
    approvalStatusSection: {
      title: 'Trạng thái hiệu lực phê duyệt',
      freshTitle: 'Hồ sơ sẵn sàng thẩm định',
      freshDesc:
        'Kiểm tra giấy tờ và thông tin phân chia tài sản trước khi quyết định.',
      staleTitle: 'CẢNH BÁO: Phê duyệt cũ đã hết hiệu lực',
      staleDesc:
        'Nội dung văn bản hoặc phạm vi phân bổ đã được cập nhật sau lần phê duyệt gần nhất. Bắt buộc thẩm định lại theo phiên bản mới.',
      disputedTitle: 'CẢNH BÁO: Hồ sơ đang có tranh chấp',
      disputedDesc:
        'Hệ thống ghi nhận hồ sơ đang có tranh chấp hoặc khiếu nại. Mọi thao tác phê duyệt bị tạm ngừng cho đến khi tranh chấp được giải quyết.',
      disputeDetails: 'Nội dung tranh chấp:',
    },

    // Thẻ 5: Biểu mẫu ghi nhận quyết định thẩm định
    decisionSection: {
      title: 'Quyết định thẩm định',
      prompt: 'Lựa chọn quyết định thẩm định (Bắt buộc):',
      approveOption: 'Chấp thuận hồ sơ (Phê duyệt)',
      approveDesc:
        'Chấp thuận giấy tờ và thông tin phân chia tài sản đang xem.',
      rejectOption: 'Từ chối hồ sơ',
      rejectDesc:
        'Từ chối khi giấy tờ chưa hợp lệ hoặc thông tin phân chia chưa đủ căn cứ.',
      reasonLabel: 'Lý do & Căn cứ thẩm định (Bắt buộc)',
      reasonPlaceholder:
        'Nhập chi tiết nhận xét, viện dẫn căn cứ hoặc yêu cầu bổ sung nếu có...',
      reasonHint:
        'Lý do quyết định sẽ được lưu trong lịch sử hồ sơ.',
      btnReview: 'Xem lại & Xác nhận quyết định',
      btnSubmitting: 'Đang ghi nhận...',
      validationDecisionRequired: 'Vui lòng chọn quyết định Chấp thuận hoặc Từ chối.',
      validationReasonRequired: 'Lý do quyết định là bắt buộc và không được để trống.',
      disabledStaleNote:
        'Phê duyệt cũ đã hết hiệu lực do có thay đổi mới. Vui lòng thẩm định lại theo phiên bản hiện tại.',
      disabledDisputeNote:
        'Không thể gửi quyết định phê duyệt khi hồ sơ đang trong tình trạng tranh chấp.',
      disabledMissingScopeNote:
        'Không thể gửi quyết định phê duyệt khi hồ sơ chưa có phạm vi phân bổ tài sản.',
    },

    // Hộp thoại xác nhận quyết định
    confirmModal: {
      title: 'Xác nhận quyết định thẩm định',
      subtitle:
        'Vui lòng rà soát lại thông tin trước khi lưu quyết định.',
      dossierLabel: 'Mã hồ sơ:',
      versionLabel: 'Phiên bản tài liệu:',
      decisionLabel: 'Quyết định:',
      reasonLabel: 'Lý do ghi nhận:',
      warningAudit:
        'Quyết định được lưu vào lịch sử hồ sơ. Phê duyệt không tự động mở khóa kho di sản.',
      btnCancel: 'Quay lại chỉnh sửa',
      btnConfirm: 'Xác nhận & Lưu quyết định',
    },

    // Thẻ biên nhận sau khi gửi thành công
    receiptCard: {
      title: 'Biên nhận quyết định thẩm định',
      simulationTag: 'Mô phỏng DEV',
      receiptId: 'Mã biên nhận',
      recordedAt: 'Thời điểm ghi nhận',
      verifier: 'Cán bộ thực hiện',
      decisionLabel: 'Kết quả thẩm định',
      approvedVersion: 'Phiên bản được duyệt',
      btnCloseReceipt: 'Đóng biên nhận',
    },

    // Trạng thái hệ thống & Chế độ thật
    liveNotReady: {
      title: 'Dịch vụ phê duyệt chưa sẵn sàng',
      desc: 'Chưa thể gửi quyết định lúc này. Vui lòng thử lại sau.',
    },
    errorState: {
      title: 'Không thể tải thông tin hồ sơ',
      saveFailed: 'Chưa xác nhận được kết quả lưu quyết định. Hãy tải lại hồ sơ trước khi thử lại.',
      btnRetry: 'Thử lại',
    },
    notFoundState: {
      title: 'Không tìm thấy hồ sơ thẩm định',
      desc: 'Mã hồ sơ yêu cầu không tồn tại hoặc đã bị hủy.',
    },
    forbiddenState: {
      title: 'Không có quyền truy cập',
      desc: 'Tài khoản của bạn chưa được cấp quyền thẩm định hồ sơ này.',
    },
  },

  en: {
    portalTitle: 'Legal Review Portal — Dossier Approval',
    roleBadge: 'Legal Specialist',
    previewTag: 'DEV Preview (Synthetic)',
    logoutBtn: 'Sign Out',
    refreshBtn: 'Refresh Data',
    refreshingBtn: 'Refreshing...',
    pageTitle: 'Dossier Approval',
    pageSubtitle:
      'Check the documents and asset allocations before recording your decision.',

    // Collapsible Rules & Guidance
    boundary: {
      title: 'Approval Rules & Operational Guidance',
      notice1:
        'The approval determination only certifies the validity of the digitized will document and asset allocation scope.',
      notice2:
        'Approval does not automatically unlock the vault. Unlocking needs a separate confirmation.',
      notice3:
        'Changes to the documents, asset allocations or dispute status require the previous approval to be reviewed.',
    },

    // DEV Scenario Picker
    scenarioBar: {
      label: 'DEV Preview Scenario:',
      complete: 'Complete Dossier (Valid)',
      stale: 'Case updated; a new review is needed',
      disputed: 'Active Dispute',
      missingScope: 'Missing Asset Allocation Scope',
      liveNotice: 'Live mode: Awaiting service integration',
      resetBtn: 'Reset Scenario',
      initialLabel: 'Initial Scenario:',
      currentLabel: 'Current Working State:',
      statePristine: 'Pristine (No changes)',
      stateModified: 'Modified in session',
      stateSubmitted: 'Determination Recorded',
    },

    // Section 1: Dossier Reference
    dossierSection: {
      title: 'Estate Dossier Reference',
      dossierId: 'Dossier ID',
      vaultName: 'Heritage Vault',
      vaultId: 'Vault ID',
      ownerName: 'Estate Owner',
      createdAt: 'Intake Timestamp',
      status: 'Dossier Status',
      unspecified: 'Unspecified',
    },

    // Section 2: Version & Hash Integrity
    integritySection: {
      title: 'Will document',
      versionLabel: 'Document Version',
      fileNameLabel: 'Archived Digitized File',
      uploadedAtLabel: 'Version Upload Timestamp',
    },

    // Section 3: Allocation Scope & Beneficiaries
    scopeSection: {
      title: 'Asset Allocation Scope',
      tableAsset: 'Allocated Asset',
      tableCategory: 'Category',
      tableBeneficiary: 'Designated Beneficiary',
      tableShare: 'Share / Allocation Portion',
      tableConditions: 'Conditions',
      noConditions: 'No special conditions',
      emptyScopeTitle: 'Asset Allocation Scope Unspecified',
      emptyScopeDesc:
        'This dossier lacks configured asset allocations. Approval cannot proceed without a verified allocation scope.',
    },

    // Section 4: Approval Freshness & Dispute Status
    approvalStatusSection: {
      title: 'Approval Freshness & Dispute Status',
      freshTitle: 'Dossier Ready for Legal Determination',
      freshDesc:
        'Check the documents and asset allocations before recording a decision.',
      staleTitle: 'WARNING: Previous Approval is Expired',
      staleDesc:
        'Document contents or allocation scope have been modified since the previous determination. Re-evaluation is mandatory.',
      disputedTitle: 'WARNING: Dossier Has an Active Dispute',
      disputedDesc:
        'The system records an active contestation or estate claim. All approval determinations are halted pending formal legal resolution.',
      disputeDetails: 'Dispute Details:',
    },

    // Section 5: Legal Determination Form
    decisionSection: {
      title: 'Legal Determination Decision',
      prompt: 'Select Determination (Required):',
      approveOption: 'Approve Dossier',
      approveDesc:
        'Approve the documents and asset allocations being reviewed.',
      rejectOption: 'Reject Dossier',
      rejectDesc:
        'Reject when the documents or asset allocations are not adequately supported.',
      reasonLabel: 'Determination Justification (Required)',
      reasonPlaceholder:
        'Provide detailed findings, references, or required amendments...',
      reasonHint:
        'Your reason will be saved in the case history.',
      btnReview: 'Review Decision',
      btnSubmitting: 'Recording...',
      validationDecisionRequired: 'Please select an approval or rejection decision.',
      validationReasonRequired: 'Decision justification is required and cannot be empty.',
      disabledStaleNote:
        'The previous approval is stale due to updates. Please review and provide a fresh determination.',
      disabledDisputeNote:
        'Determinations are disabled while an active legal dispute is unresolved.',
      disabledMissingScopeNote:
        'Determinations cannot be submitted without an asset allocation scope.',
    },

    // Confirmation Modal
    confirmModal: {
      title: 'Confirm Legal Determination Decision',
      subtitle:
        'Check the case details before saving your decision.',
      dossierLabel: 'Dossier ID:',
      versionLabel: 'Document Version:',
      decisionLabel: 'Decision:',
      reasonLabel: 'Recorded Justification:',
      warningAudit:
        'Your decision will be saved in the case history. Approval does not automatically unlock the vault.',
      btnCancel: 'Back to Edit',
      btnConfirm: 'Confirm & Sign Determination',
    },

    // Success Receipt Card
    receiptCard: {
      title: 'Legal Determination Receipt',
      simulationTag: 'DEV Preview Simulation',
      receiptId: 'Receipt ID',
      recordedAt: 'Recorded At',
      verifier: 'Reviewed By',
      decisionLabel: 'Determination Result',
      approvedVersion: 'Approved Version',
      btnCloseReceipt: 'Dismiss Receipt',
    },

    // Error & Live States
    liveNotReady: {
      title: 'Legal Approval Service Not Ready',
      desc: 'Your decision cannot be sent right now. Please try again later.',
    },
    errorState: {
      title: 'Unable to Load Dossier Information',
      saveFailed: 'Your decision could not be confirmed. Reload the case before trying again.',
      btnRetry: 'Retry',
    },
    notFoundState: {
      title: 'Dossier Not Found',
      desc: 'The requested dossier ID does not exist or has been revoked.',
    },
    forbiddenState: {
      title: 'Access Denied',
      desc: 'Your account does not have permission to review this case.',
    },
  },
};

export function getLegalApprovalTranslations(lang = 'vi') {
  return LEGAL_APPROVAL_TRANSLATIONS[lang] || LEGAL_APPROVAL_TRANSLATIONS.vi;
}
