/**
 * LegacyVault — Song ngữ (VI/EN) cho Bàn giao Di sản tại quầy
 *
 * Tiêu chuẩn giao diện: gọn gàng, rõ ràng, tập trung vào thao tác nghiệp vụ,
 * không đưa mã ticket nội bộ vào nhãn người dùng.
 */

export const COUNTER_HANDOVER_TRANSLATIONS = {
  vi: {
    validation: {fullNameRequired: 'Vui lòng nhập họ và tên người thụ hưởng.', fullNameTooLong: 'Họ và tên không được vượt quá 150 ký tự.', emailRequired: 'Vui lòng nhập email người thụ hưởng.', emailInvalid: 'Định dạng email không hợp lệ.', phoneRequired: 'Vui lòng nhập số điện thoại người thụ hưởng.', phoneInvalid: 'Số điện thoại không đúng định dạng.'},
    portalTitle: 'Cổng bàn giao di sản tại quầy',
    roleBadge: 'Nhân viên tiếp nhận & bàn giao',
    previewTag: 'Xem trước DEV (Mô phỏng)',
    logoutBtn: 'Đăng xuất',
    refreshBtn: 'Làm mới dữ liệu',
    refreshingBtn: 'Đang làm mới...',
    pageTitle: 'Tài khoản người thụ hưởng tại quầy',
    pageSubtitle:
      'Liên kết tài khoản có sẵn hoặc tạo tài khoản cho người thụ hưởng tại quầy.',

    // Trợ giúp quy tắc nghiệp vụ thu gọn
    boundary: {
      title: 'Trợ giúp quy tắc vận hành & điều kiện bàn giao',
      rule1:
        'Rào cản mở khóa: Phiên bàn giao tại quầy chỉ được mở khi Kho di sản đã được hệ thống xác nhận đã mở khóa. DMS timeout hoặc giấy chứng tử riêng lẻ không đủ điều kiện mở khóa.',
      rule2:
        'Tài khoản thụ hưởng: Hồ sơ người thụ hưởng độc lập với tài khoản đăng nhập. Nhân viên hỗ trợ liên kết tài khoản có sẵn hoặc kích hoạt tại quầy; không dùng liên kết qua email hay mã OTP.',
      rule3:
        'Quy tắc độc lập: Tài sản đã bàn giao không tự động làm người thụ hưởng được xác nhận. Bàn giao tài sản và ký nhận biên bản là hai sự kiện riêng biệt.',
      rule4:
        'Điều kiện hoàn tất kép: Thao tác đóng phiên và lưu trữ chỉ được kích hoạt khi cả hai tiến độ đạt 100% (100% tài sản đã giao và 100% người thụ hưởng đã xác nhận). Sau khi lưu trữ, hồ sơ chuyển sang trạng thái chỉ đọc.',
    },

    // Thanh kịch bản xem trước DEV
    scenarioBar: {
      label: 'Kịch bản xem trước DEV:',
      standard: '1. Luồng chuẩn (Kho đã mở khóa — Sẵn sàng bàn giao)',
      lockedVault: '2. Kho chưa mở khóa (Chặn mở phiên)',
      outOfScope: '3. Có tài sản ngoài phạm vi phân bổ',
      partialProgress: '4. Đã bàn giao đủ tài sản nhưng chưa ký nhận (Chặn đóng)',
      archived: '5. Hồ sơ đã lưu trữ (Chỉ đọc)',
      liveNotice: 'Chế độ thật: Chờ tích hợp dịch vụ',
      resetBtn: 'Đặt lại kịch bản',
      initialLabel: 'Kịch bản gốc:',
      currentLabel: 'Trạng thái hiện tại:',
      statePristine: 'Chưa thao tác',
      stateModified: 'Đang xử lý',
      stateArchived: 'Đã lưu trữ (Chỉ đọc)',
    },

    // Khối hướng dẫn hành động tiếp theo
    nextAction: {
      heading: 'Hành động tiếp theo:',
      vaultLocked: 'Kho di sản chưa được mở khóa. Không thể mở phiên bàn giao khi kho chưa ở trạng thái ĐÃ MỞ KHÓA.',
      noSession: 'Chưa có phiên bàn giao nào đang mở. Bấm nút "Mở phiên bàn giao" bên dưới để bắt đầu quy trình tại quầy.',
      inProgress: 'Phiên bàn giao đang hoạt động. Tiếp tục thực hiện bàn giao tài sản và ghi nhận xác nhận ký nhận của người thụ hưởng.',
      readyToArchive: 'Cả hai tiến độ bàn giao và ký nhận đã đạt 100%. Đã đủ điều kiện để thực hiện "Hoàn tất & Đóng phiên".',
      archived: 'Hồ sơ đã được lưu trữ ở chế độ chỉ đọc. Phiên bàn giao đã kết thúc an toàn và lưu vết biên bản.',
    },

    // Thẻ 1: Thông tin phiên bàn giao
    sessionSection: {
      title: 'Thông tin phiên bàn giao tại quầy',
      sessionId: 'Mã phiên bàn giao',
      caseId: 'Mã hồ sơ tiếp nhận',
      vaultName: 'Kho di sản',
      vaultId: 'Mã kho di sản',
      ownerName: 'Chủ sở hữu di sản',
      staffExecutor: 'Nhân viên phụ trách',
      sessionStatus: 'Trạng thái phiên',
      vaultStatus: 'Trạng thái kho',
      openedAt: 'Thời điểm mở phiên',
      legalApprovalRef: 'Mã phê duyệt pháp lý',
      unlockConfirmationSource: 'Nguồn xác nhận mở khóa',
      approvalStatusFresh: 'Phê duyệt hợp lệ',
      statusActive: 'ĐANG MỞ',
      statusCompleted: 'ĐÃ HOÀN TẤT',
      statusCancelled: 'ĐÃ HỦY',
      statusLockedNotice:
        'CẢNH BÁO: Kho di sản chưa được xác nhận ĐÃ MỞ KHÓA. Theo quy tắc PS-59, chỉ Legal approval hợp lệ mới mở khóa; DMS timeout hoặc chứng từ tử vong riêng lẻ không đủ mở khóa.',
      openSessionBtn: 'Mở phiên bàn giao mới',
      activeNotice: 'Phiên đang hoạt động. Nhân viên có thể tiến hành liên kết tài khoản và bàn giao tài sản.',
    },

    // Thẻ 2: Người thụ hưởng & Tài khoản
    beneficiarySection: {
      title: 'Người thụ hưởng & Tài khoản',
      subtitle:
        'Hồ sơ người thụ hưởng độc lập với tài khoản đăng nhập. Nhân viên đối chiếu thông tin để liên kết hoặc kích hoạt tài khoản tại quầy.',
      colName: 'Người thụ hưởng',
      colRelationship: 'Quan hệ',
      colIdentity: 'Số giấy tờ tùy thân',
      colAccountStatus: 'Tài khoản',
      colActions: 'Thao tác tại quầy',
      accountLinked: 'ĐÃ LIÊN KẾT',
      accountUnlinked: 'CHƯA LIÊN KẾT',
      linkExistingBtn: 'Liên kết tài khoản',
      createAccountBtn: 'Tạo tài khoản tại quầy',
      linkedUserIdLabel: 'Mã tài khoản',
      linkedEmailLabel: 'Email tài khoản',
      modalLinkTitle: 'Liên kết tài khoản có sẵn tại quầy',
      modalCreateTitle: 'Tạo và kích hoạt tài khoản thụ hưởng tại quầy',
      searchEmailPrompt: 'Nhập email tài khoản đã đăng ký:',
      searchBtn: 'Tìm & Liên kết',
      createEmailPrompt: 'Email người thụ hưởng:',
      createPhonePrompt: 'Số điện thoại liên hệ:',
      createFullNamePrompt: 'Họ và tên:',
      confirmCreateBtn: 'Tạo & Liên kết tài khoản',
      cancelBtn: 'Hủy bỏ',
      boundaryNote:
        'Quy định vận hành: Không gửi liên kết qua email hoặc yêu cầu mã OTP từ xa. Mọi thao tác thực hiện trực tiếp tại quầy.',
    },

    // Thẻ 3: Danh mục tài sản đủ điều kiện
    assetSection: {
      title: 'Danh mục tài sản đủ điều kiện',
      subtitle:
        'Chỉ bàn giao các tài sản nằm trong phạm vi phân bổ đã được phê duyệt cho từng người thụ hưởng.',
      filterAll: 'Tất cả người nhận',
      colAsset: 'Tài sản di sản',
      colCategory: 'Phân loại',
      colRecipient: 'Người thụ hưởng chỉ định',
      colPortion: 'Phần phân bổ',
      colStatus: 'Trạng thái bàn giao',
      colAction: 'Thao tác',
      statusPending: 'CHỜ BÀN GIAO',
      statusDelivered: 'ĐÃ BÀN GIAO',
      statusOutOfScope: 'NGOÀI PHẠM VI (ĐÃ CHẶN)',
      deliverBtn: 'Bàn giao tài sản',
      deliveredBadge: 'Đã bàn giao',
      deliveredAt: 'Thời điểm bàn giao',
      outOfScopeAlert:
        'CẢNH BÁO: Tài sản này nằm ngoài phạm vi phê duyệt cho người thụ hưởng đã chọn. Thao tác bàn giao bị khóa.',
      prerequisitesMissing:
        'Chưa đủ điều kiện: Kho chưa mở khóa, phiên chưa mở hoặc phê duyệt không hợp lệ.',
      confirmDeliverTitle: 'Xác nhận bàn giao tài sản',
      confirmDeliverPrompt:
        'Xác nhận bàn giao tài sản sau cho người thụ hưởng có mặt tại quầy:',
      confirmDeliverBtn: 'Xác nhận bàn giao',
    },

    // Thẻ 4: Xác nhận ký nhận của người thụ hưởng
    confirmationSection: {
      title: 'Xác nhận ký nhận tại quầy',
      subtitle:
        'Người thụ hưởng ký nhận biên bản bàn giao tại quầy. Nhân viên ghi nhận mã tham chiếu biên bản vào hồ sơ.',
      colBeneficiary: 'Người thụ hưởng',
      colConfirmedStatus: 'Trạng thái ký nhận',
      colReceiptRef: 'Mã biên bản ký nhận',
      colConfirmedAt: 'Thời điểm ký nhận',
      colAction: 'Thao tác',
      statusConfirmed: 'ĐÃ XÁC NHẬN',
      statusPendingConfirm: 'CHỜ KÝ NHẬN',
      recordConfirmBtn: 'Ghi nhận xác nhận',
      modalConfirmTitle: 'Ghi nhận xác nhận ký nhận của người thụ hưởng',
      receiptRefPrompt: 'Mã số tham chiếu biên bản bàn giao (Bắt buộc):',
      idVerifiedCheck: 'Đã đối chiếu thông tin giấy tờ tùy thân của người nhận',
      notesPrompt: 'Ghi chú tiếp nhận:',
      confirmSaveBtn: 'Lưu xác nhận',
      invariantCallout:
        'Lưu ý: Bàn giao tài sản không tự động đánh dấu người thụ hưởng đã xác nhận. Nhân viên cần ghi nhận mã biên bản ký nhận độc lập.',
    },

    // Thẻ 5: Theo dõi tiến độ hoàn tất kép
    progressSection: {
      title: 'Tiến độ bàn giao kép',
      subtitle:
        'Hệ thống yêu cầu cả hai chỉ số tiến độ phải đạt 100% trước khi cho phép đóng phiên và chuyển hồ sơ sang trạng thái đã lưu trữ.',
      assetProgressLabel: 'Tiến độ bàn giao tài sản (Tài sản đã giao)',
      beneficiaryProgressLabel: 'Tiến độ xác nhận ký nhận (Người thụ hưởng đã ký)',
      dualStatusLabel: 'Điều kiện hoàn tất kép',
      statusInProgress: 'ĐANG XỬ LÝ (CHƯA ĐỦ ĐIỀU KIỆN HOÀN TẤT)',
      statusReadyToClose: 'SẴN SÀNG ĐÓNG PHIÊN (ĐÃ ĐỦ CẢ HAI TIẾN ĐỘ)',
      missingConditionAssets: 'Còn {count} tài sản chưa bàn giao.',
      missingConditionBeneficiaries: 'Còn {count} người thụ hưởng chưa ký nhận biên bản.',
      zeroDenominatorAlert: 'Không có dữ liệu tài sản hoặc người thụ hưởng hợp lệ trong hồ sơ.',
      dualMetNotice:
        'Cả hai tiến độ đã đạt 100%. Nhân viên có thể thực hiện đóng phiên và lưu trữ hồ sơ.',
    },

    // Thẻ 6: Đóng phiên & Đã lưu trữ
    archiveSection: {
      title: 'Đóng phiên & Lưu trữ',
      subtitle:
        'Tổng hợp biên bản bàn giao, chuyển kho di sản và hồ sơ sang trạng thái đã lưu trữ (chỉ đọc).',
      closeArchiveBtn: 'Hoàn tất & Đóng phiên',
      disabledReason: 'Chỉ kích hoạt khi CẢ HAI tiến độ đạt 100%.',
      modalTitle: 'Xác nhận đóng phiên bàn giao & Lưu trữ hồ sơ',
      modalPrompt:
        'Sau khi đóng phiên, kho di sản và hồ sơ tiếp nhận sẽ chuyển sang trạng thái ĐÃ LƯU TRỮ. Toàn bộ thông tin sẽ chuyển sang chế độ CHỈ ĐỌC.',
      summaryHeading: 'Tổng hợp kết quả bàn giao:',
      totalDelivered: 'Tổng tài sản đã bàn giao',
      totalConfirmed: 'Tổng người thụ hưởng đã ký nhận',
      archiveConfirmBtn: 'Xác nhận đóng phiên & Lưu trữ',
      archivedBannerTitle: 'HỒ SƠ ĐÃ ĐƯỢC LƯU TRỮ',
      archivedBannerDesc:
        'Phiên bàn giao đã kết thúc thành công. Hồ sơ hiện ở trạng thái chỉ đọc để bảo toàn tính toàn vẹn của lịch sử kiểm toán.',
      receiptSummaryTitle: 'Biên bản tổng hợp bàn giao di sản',
      receiptSummaryId: 'Mã biên bản lưu trữ',
      archivedAt: 'Thời điểm lưu trữ',
      responsibleStaff: 'Nhân viên thực hiện',
      printReceiptBtn: 'In / Xuất biên bản',
    },

    errors: {
      loadFailed: 'Không thể tải dữ liệu phiên bàn giao.',
      actionFailed: 'Thao tác không thành công.',
      backendNotReady:
        'Dịch vụ bàn giao tại quầy chưa sẵn sàng trên máy chủ.',
      forbidden: 'Không có quyền truy cập (yêu cầu vai trò Nhân viên tiếp nhận & bàn giao).',
      vaultNotUnlocked: 'Kho di sản đang khóa. Không thể mở phiên bàn giao.',
      outOfScope: 'Tài sản nằm ngoài phạm vi phê duyệt cho người thụ hưởng này.',
      duplicateSession: 'Đã có một phiên bàn giao đang mở cho hồ sơ này.',
      dualProgressNotMet: 'Chưa đủ điều kiện: Cả hai tiến độ phải đạt 100%.',
      validationRequired: 'Vui lòng điền đầy đủ các thông tin bắt buộc.',
    },
  },

  en: {
    validation: {fullNameRequired: 'Enter the beneficiary full name.', fullNameTooLong: 'Full name must not exceed 150 characters.', emailRequired: 'Enter the beneficiary email.', emailInvalid: 'Enter a valid email address.', phoneRequired: 'Enter the beneficiary phone number.', phoneInvalid: 'Enter a valid phone number.'},
    portalTitle: 'Counter Handover Portal',
    roleBadge: 'Handover Officer',
    previewTag: 'DEV Preview (Synthetic)',
    logoutBtn: 'Sign Out',
    refreshBtn: 'Refresh Data',
    refreshingBtn: 'Refreshing...',
    pageTitle: 'Counter Handover',
    pageSubtitle:
      'Estate asset distribution per approved allocation scope, counter account linking, and record archiving.',

    // Collapsible Rules & Guidance
    boundary: {
      title: 'Operational Rules & Handover Conditions',
      rule1:
        'Controlled Unlock: Counter handover sessions can only be opened when the heritage vault is confirmed UNLOCKED by the backend.',
      rule2:
        'Beneficiary Accounts: Beneficiary records are independent from user login accounts. Staff assists with linking existing accounts or activating accounts at counter; no email links or remote OTPs.',
      rule3:
        'Audit Independence: Delivering an asset does not automatically confirm the beneficiary. Asset delivery and signed receipt confirmation are separate audit events.',
      rule4:
        'Dual Completion Condition: Session closure and archiving are enabled only when both progress metrics reach 100% (100% assets delivered and 100% beneficiaries confirmed). After archiving, the record transitions to read-only.',
    },

    // DEV Scenario Picker
    scenarioBar: {
      label: 'DEV Preview Scenario:',
      standard: '1. Standard Flow (Vault Unlocked — Ready for Handover)',
      lockedVault: '2. Vault Locked (Session Blocked)',
      outOfScope: '3. Out-of-Scope Asset Present',
      partialProgress: '4. Assets Delivered but Unconfirmed (Closure Blocked)',
      archived: '5. Archived Record (Read-Only)',
      liveNotice: 'Live mode: Awaiting service integration',
      resetBtn: 'Reset Scenario',
      initialLabel: 'Initial Scenario:',
      currentLabel: 'Current State:',
      statePristine: 'Pristine (No changes)',
      stateModified: 'In Progress',
      stateArchived: 'Archived (Read-Only)',
    },

    // Next Action Guidance Callout
    nextAction: {
      heading: 'Next Action:',
      vaultLocked: 'Heritage vault is locked. Handover session cannot be opened until the vault is confirmed UNLOCKED.',
      noSession: 'No active session. Click "Open Handover Session" below to begin counter intake.',
      inProgress: 'Handover session active. Continue delivering assets and recording signed beneficiary receipts.',
      readyToArchive: 'Both asset delivery and beneficiary confirmation have reached 100%. Ready to "Complete & Close Session".',
      archived: 'Estate record has been archived in read-only mode. Handover session is safely concluded.',
    },

    // Card 1: Session Information
    sessionSection: {
      title: 'Handover Session Information',
      sessionId: 'Session ID',
      caseId: 'Intake Case ID',
      vaultName: 'Heritage Vault',
      vaultId: 'Vault ID',
      ownerName: 'Estate Owner',
      staffExecutor: 'Assigned Staff',
      sessionStatus: 'Session Status',
      vaultStatus: 'Vault Security Status',
      openedAt: 'Session Opened At',
      legalApprovalRef: 'Legal Approval Reference',
      unlockConfirmationSource: 'Unlock Confirmation Source',
      approvalStatusFresh: 'Valid Approval',
      statusActive: 'ACTIVE',
      statusCompleted: 'COMPLETED',
      statusCancelled: 'CANCELLED',
      statusLockedNotice:
        'WARNING: Heritage vault is not confirmed UNLOCKED. Per PS-59 business rules, only valid Legal approval unlocks the vault; DMS timeout or death documents alone are not sufficient to unlock.',
      openSessionBtn: 'Open Handover Session',
      activeNotice: 'Session is active. Staff may proceed with account linking and asset distribution.',
    },

    // Card 2: Beneficiaries & Accounts
    beneficiarySection: {
      title: 'Beneficiaries & Accounts',
      subtitle:
        'Beneficiary records are separate from login accounts. Staff verifies identity at counter to link or activate accounts.',
      colName: 'Beneficiary Name',
      colRelationship: 'Relationship',
      colIdentity: 'Identity Document No.',
      colAccountStatus: 'Account Status',
      colActions: 'Counter Actions',
      accountLinked: 'LINKED',
      accountUnlinked: 'UNLINKED',
      linkExistingBtn: 'Link Existing Account',
      createAccountBtn: 'Activate at Counter',
      linkedUserIdLabel: 'User ID',
      linkedEmailLabel: 'Account Email',
      modalLinkTitle: 'Link Existing Account at Counter',
      modalCreateTitle: 'Create & Activate Beneficiary Account at Counter',
      searchEmailPrompt: 'Enter registered account email:',
      searchBtn: 'Search & Link',
      createEmailPrompt: 'Beneficiary Email:',
      createPhonePrompt: 'Contact Phone Number:',
      createFullNamePrompt: 'Full Name:',
      confirmCreateBtn: 'Create & Link Account',
      cancelBtn: 'Cancel',
      boundaryNote:
        'Security Policy: No email Claim Links, no Guest Portal, and no Beneficiary OTP. All actions conducted directly at counter.',
    },

    // Card 3: Eligible Assets
    assetSection: {
      title: 'Eligible Asset Inventory',
      subtitle:
        'Deliver only assets designated in the approved allocation scope for each beneficiary.',
      filterAll: 'All Recipients',
      colAsset: 'Heritage Asset',
      colCategory: 'Category',
      colRecipient: 'Designated Beneficiary',
      colPortion: 'Allocated Portion',
      colStatus: 'Handover Status',
      colAction: 'Action',
      statusPending: 'PENDING',
      statusDelivered: 'DELIVERED',
      statusOutOfScope: 'OUT OF SCOPE (BLOCKED)',
      deliverBtn: 'Deliver Asset',
      deliveredBadge: 'Delivered',
      deliveredAt: 'Delivered At',
      outOfScopeAlert:
        'SCOPE VIOLATION WARNING: This asset is outside the approved allocation scope. Handover is locked.',
      prerequisitesMissing:
        'Missing prerequisites: Vault not UNLOCKED, session not ACTIVE, or invalid legal approval.',
      confirmDeliverTitle: 'Confirm Asset Handover',
      confirmDeliverPrompt:
        'Confirm handover of the following asset to the beneficiary present at counter:',
      confirmDeliverBtn: 'Confirm Handover',
    },

    // Card 4: Beneficiary Receipt Confirmation
    confirmationSection: {
      title: 'Beneficiary Receipt Confirmation',
      subtitle:
        'Beneficiary signs handover protocol at counter. Staff logs official confirmation reference code.',
      colBeneficiary: 'Beneficiary',
      colConfirmedStatus: 'Confirmation Status',
      colReceiptRef: 'Receipt Reference ID',
      colConfirmedAt: 'Confirmed Timestamp',
      colAction: 'Action',
      statusConfirmed: 'CONFIRMED',
      statusPendingConfirm: 'PENDING CONFIRMATION',
      recordConfirmBtn: 'Record Confirmation',
      modalConfirmTitle: 'Record Beneficiary Receipt Confirmation',
      receiptRefPrompt: 'Handover Protocol / Receipt Reference Code (Required):',
      idVerifiedCheck: 'Verified identity document of beneficiary physically at counter',
      notesPrompt: 'Staff verification notes:',
      confirmSaveBtn: 'Save Confirmation',
      invariantCallout:
        'Audit Invariant: Delivering assets does not automatically confirm the beneficiary. Staff separately records the physical signed receipt.',
    },

    // Card 5: Dual Completion Progress
    progressSection: {
      title: 'Dual Handover Progress',
      subtitle:
        'Both progress components must reach 100% before session closure and archiving are permitted.',
      assetProgressLabel: 'Asset Handover Progress (Delivered Assets)',
      beneficiaryProgressLabel: 'Beneficiary Confirmation Progress (Confirmed Beneficiaries)',
      dualStatusLabel: 'Dual Completion Condition',
      statusInProgress: 'IN PROGRESS (COMPLETION REQUIREMENTS NOT MET)',
      statusReadyToClose: 'READY TO CLOSE (DUAL REQUIREMENTS SATISFIED)',
      missingConditionAssets: '{count} asset(s) pending delivery.',
      missingConditionBeneficiaries: '{count} beneficiary(ies) pending signed confirmation.',
      zeroDenominatorAlert: 'Dossier has no valid assets or beneficiaries.',
      dualMetNotice:
        'Both progress trackers have reached 100%. Staff may now proceed to Close Handover Session and Archive the record.',
    },

    // Card 6: Close Session & Archive
    archiveSection: {
      title: 'Close Session & Archive',
      subtitle:
        'Consolidate handover summary, transition vault and case to archived status (read-only).',
      closeArchiveBtn: 'Complete & Close Session',
      disabledReason: 'Enabled only when BOTH progress indicators reach 100%.',
      modalTitle: 'Confirm Session Completion & Archive Record',
      modalPrompt:
        'Upon session closure, the Heritage Vault and Case transition to ARCHIVED. All records become strictly READ-ONLY.',
      summaryHeading: 'Handover & Audit Summary:',
      totalDelivered: 'Total Delivered Assets',
      totalConfirmed: 'Total Confirmed Beneficiaries',
      archiveConfirmBtn: 'Confirm Close & Archive',
      archivedBannerTitle: 'ESTATE RECORD HAS BEEN ARCHIVED',
      archivedBannerDesc:
        'Handover session successfully closed. Record is in READ-ONLY mode to preserve complete audit integrity.',
      receiptSummaryTitle: 'Estate Handover Receipt Summary',
      receiptSummaryId: 'Archive Protocol ID',
      archivedAt: 'Archived Timestamp',
      responsibleStaff: 'Executing Staff',
      printReceiptBtn: 'Print / Export Protocol',
    },

    errors: {
      loadFailed: 'Failed to load counter handover session data.',
      actionFailed: 'Operation failed.',
      backendNotReady:
        'Counter handover server endpoints not ready. Synthetic fallback prohibited in live mode.',
      forbidden: 'Access denied (requires Handover Officer role).',
      vaultNotUnlocked: 'Heritage vault is LOCKED. Cannot open counter handover session.',
      outOfScope: 'Asset is out of approved allocation scope for this beneficiary.',
      duplicateSession: 'An active handover session already exists for this case.',
      dualProgressNotMet: 'Cannot close session: Both progress metrics must reach 100%.',
      validationRequired: 'Please provide all required fields.',
    },
  },
};

export function getCounterHandoverTranslations(lang = 'vi') {
  return COUNTER_HANDOVER_TRANSLATIONS[lang] || COUNTER_HANDOVER_TRANSLATIONS.vi;
}
