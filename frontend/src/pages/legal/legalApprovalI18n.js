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
      'Xem xét tính hợp lệ của văn bản di chúc, mã băm SHA-256 và phạm vi phân bổ tài sản trước khi tiến hành mở khóa.',

    // Trợ giúp quy tắc nghiệp vụ thu gọn
    boundary: {
      title: 'Trợ giúp quy tắc & thẩm quyền phê duyệt',
      notice1:
        'Quyết định phê duyệt chỉ xác nhận tính hợp lệ của văn bản di chúc và phạm vi phân bổ tài sản trong hồ sơ.',
      notice2:
        'Thao tác phê duyệt hồ sơ không tự động mở khóa kho di sản và không thay thế lệnh giải mã từ máy chủ.',
      notice3:
        'Phê duyệt phải gắn đúng phiên bản tài liệu, mã băm SHA-256 và phạm vi phân bổ. Khi có cập nhật mới hoặc tranh chấp phát sinh, phê duyệt cũ sẽ hết hiệu lực.',
    },

    // Thanh chọn kịch bản DEV preview
    scenarioBar: {
      label: 'Kịch bản xem trước DEV:',
      complete: 'Hồ sơ đầy đủ (Hợp lệ)',
      stale: 'Phê duyệt cũ hết hiệu lực (Thay đổi nội dung/mã băm)',
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
      title: 'Văn bản di chúc & Mã băm toàn vẹn (SHA-256)',
      versionLabel: 'Phiên bản văn bản',
      fileNameLabel: 'Tệp số hóa lưu trữ',
      hashLabel: 'Mã băm SHA-256 toàn vẹn',
      hashMatchBadge: 'Mã băm trong hồ sơ',
      hashMismatchBadge: 'CẢNH BÁO: Mã băm không khớp',
      hashUnspecifiedBadge: 'Chưa có mã băm',
      uploadedAtLabel: 'Thời điểm cập nhật bản số hóa',
      hashHint:
        'Mã băm SHA-256 bảo đảm tính toàn vẹn của tệp văn bản số hóa. Mọi thay đổi nội dung sẽ làm thay đổi giá trị mã băm.',
    },

    // Thẻ 3: Phạm vi phân bổ tài sản & Người thụ hưởng
    scopeSection: {
      title: 'Phạm vi phân bổ tài sản',
      scopeChecksum: 'Mã kiểm tra phạm vi',
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
        'Hồ sơ có phiên bản tài liệu, mã băm và phạm vi phân bổ để xem xét. Hãy kiểm tra nội dung trước khi quyết định.',
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
        'Xác nhận tính hợp lệ của văn bản di chúc, mã băm SHA-256 và phạm vi phân bổ theo quy định.',
      rejectOption: 'Từ chối hồ sơ',
      rejectDesc:
        'Từ chối do hồ sơ chưa đủ căn cứ pháp lý, sai lệch mã băm hoặc vi phạm điều kiện thừa kế.',
      reasonLabel: 'Lý do & Căn cứ thẩm định (Bắt buộc)',
      reasonPlaceholder:
        'Nhập chi tiết nhận xét, viện dẫn căn cứ hoặc yêu cầu bổ sung nếu có...',
      reasonHint:
        'Cả hai lựa chọn đều yêu cầu nêu rõ lý do để lưu vào nhật ký kiểm toán.',
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
      hashLabel: 'Mã băm SHA-256:',
      decisionLabel: 'Quyết định:',
      reasonLabel: 'Lý do ghi nhận:',
      warningAudit:
        'Quyết định này sẽ được ghi nhận vào nhật ký kiểm toán. Thao tác này không tự động mở khóa kho di sản.',
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
      approvedHash: 'Mã băm được duyệt',
      btnCloseReceipt: 'Đóng biên nhận',
    },

    // Trạng thái hệ thống & Chế độ thật
    liveNotReady: {
      title: 'Dịch vụ phê duyệt chưa sẵn sàng',
      desc: 'Hệ thống máy chủ hiện chưa mở endpoint tiếp nhận phê duyệt hồ sơ. Vui lòng thử lại sau khi API sẵn sàng.',
    },
    errorState: {
      title: 'Không thể tải thông tin hồ sơ',
      btnRetry: 'Thử lại',
    },
    notFoundState: {
      title: 'Không tìm thấy hồ sơ thẩm định',
      desc: 'Mã hồ sơ yêu cầu không tồn tại hoặc đã bị hủy.',
    },
    forbiddenState: {
      title: 'Không có quyền truy cập',
      desc: 'Tài khoản hiện tại không có quyền thực hiện thẩm định hồ sơ (HTTP 403 Forbidden).',
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
      'Review the validity of the digitized will document, SHA-256 hash, and asset allocation scope before unlocking procedures.',

    // Collapsible Rules & Guidance
    boundary: {
      title: 'Approval Rules & Operational Guidance',
      notice1:
        'The approval determination only certifies the validity of the digitized will document and asset allocation scope.',
      notice2:
        'Approval does not automatically unlock the heritage vault and does not replace cryptographic server authorization.',
      notice3:
        'Approval must bind strictly to the specific document version, SHA-256 hash, and allocation scope. Any modification or newly raised dispute invalidates past approval.',
    },

    // DEV Scenario Picker
    scenarioBar: {
      label: 'DEV Preview Scenario:',
      complete: 'Complete Dossier (Valid)',
      stale: 'Stale Approval (Version/Hash Changed)',
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
      title: 'Will Document & Integrity Hash (SHA-256)',
      versionLabel: 'Document Version',
      fileNameLabel: 'Archived Digitized File',
      hashLabel: 'SHA-256 Integrity Hash',
      hashMatchBadge: 'Recorded document hash',
      hashMismatchBadge: 'WARNING: Hash Mismatch',
      hashUnspecifiedBadge: 'No Hash Available',
      uploadedAtLabel: 'Version Upload Timestamp',
      hashHint:
        'The SHA-256 hash guarantees the cryptographic integrity of the digitized file. If a single byte is altered, the hash changes completely.',
    },

    // Section 3: Allocation Scope & Beneficiaries
    scopeSection: {
      title: 'Asset Allocation Scope',
      scopeChecksum: 'Scope Checksum',
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
        'Document version, hash and allocation scope are available for review. Check the dossier before recording a decision.',
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
        'Confirm the validity of the digitized will, SHA-256 hash, and allocation scope under applicable rules.',
      rejectOption: 'Reject Dossier',
      rejectDesc:
        'Reject due to inadequate legal foundation, checksum discrepancy, or statutory inheritance conflict.',
      reasonLabel: 'Determination Justification (Required)',
      reasonPlaceholder:
        'Provide detailed findings, references, or required amendments...',
      reasonHint:
        'Both decisions require a mandatory justification for audit trail logging.',
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
        'Please carefully verify the parameters before signing this record into the audit ledger.',
      dossierLabel: 'Dossier ID:',
      versionLabel: 'Document Version:',
      hashLabel: 'SHA-256 Hash:',
      decisionLabel: 'Decision:',
      reasonLabel: 'Recorded Justification:',
      warningAudit:
        'This determination will be cryptographically logged. This action does NOT unlock the vault.',
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
      approvedHash: 'Approved SHA-256',
      btnCloseReceipt: 'Dismiss Receipt',
    },

    // Error & Live States
    liveNotReady: {
      title: 'Legal Approval Service Not Ready',
      desc: 'The Backend service endpoint is currently not deployed. Please retry when the live API is connected.',
    },
    errorState: {
      title: 'Unable to Load Dossier Information',
      btnRetry: 'Retry',
    },
    notFoundState: {
      title: 'Dossier Not Found',
      desc: 'The requested dossier ID does not exist or has been revoked.',
    },
    forbiddenState: {
      title: 'Access Denied',
      desc: 'Your account lacks authorization to perform legal approval reviews (HTTP 403 Forbidden).',
    },
  },
};

export function getLegalApprovalTranslations(lang = 'vi') {
  return LEGAL_APPROVAL_TRANSLATIONS[lang] || LEGAL_APPROVAL_TRANSLATIONS.vi;
}