/**
 * LegacyVault — Asset Management Bilingual Translations & Fallback (PS-5 / PS-6)
 *
 * Provides self-contained translations for Vietnamese and English to ensure
 * AssetManagementPage and its child components never crash when rendered standalone
 * or within AppShell without an external translation dictionary.
 */

export const LEGAL_DISMISSED_KEY = 'legacyvault_legal_notice_dismissed';

export const ASSET_I18N = {
  vi: {
    assets: {
      title: 'Danh sách Tài sản',
      subtitle: 'Khai báo các tài sản thuộc kho di sản cá nhân để chuẩn bị phân định thừa kế.',
      addNewBtn: 'Thêm tài sản mới',
      notice:
        'Lưu ý pháp lý: Tài sản lưu trong hệ thống mang tính chất ghi nhận và lập kế hoạch, chưa phải là hành vi bàn giao hoặc chuyển dịch quyền sở hữu tài sản.',
      noticeDismiss: 'Đã hiểu',
      noticeInfoTooltip: 'Xem lưu ý pháp lý',
      pageScope: 'Tìm kiếm, bộ lọc và thống kê áp dụng cho trang hiện tại.',
      searchPlaceholder: 'Tìm tên hoặc mô tả trên trang này...',
      filterAll: 'Tất cả phân loại',
      clearFilter: 'Xóa bộ lọc',
      filterAria: 'Lọc theo loại tài sản',
      loadingText: 'Đang tải danh sách tài sản...',
      errorTitle: 'Không thể tải danh sách tài sản',
      signIn: 'Đăng nhập lại',
      emptyTitle: 'Chưa có tài sản nào trong kho',
      emptyDesc: 'Thêm ghi chú riêng tư hoặc thông tin xác thực vào kho di sản của bạn.',
      emptyAction: 'Thêm tài sản mới',
      noMatchTitle: 'Không tìm thấy tài sản phù hợp',
      noMatchDesc: 'Không có tài sản nào khớp với bộ lọc hoặc từ khóa tìm kiếm hiện tại.',
      colName: 'Tên & Mô tả tài sản',
      colType: 'Loại tài sản',
      colPayloadStatus: 'Nội dung bảo mật',
      colDate: 'Ngày ghi nhận',
      colActions: 'Thao tác',
      colDescription: 'Mô tả / Ghi chú',
      noDescription: 'Không có mô tả chi tiết.',
      actionMenuAria: 'Tùy chọn thao tác',
      payloadSecured: 'Có nội dung bảo mật',
      payloadEmpty: 'Chưa có nội dung bảo mật',
      cancelBtn: 'Hủy',
      closeBtn: 'Đóng',
      detailModalTitle: 'Chi tiết thông số tài sản',
      legalNoticeModalTitle: 'Lưu ý pháp lý về Danh mục tài sản',
      types: {
        TEXT: 'Ghi chú riêng tư',
        CREDENTIAL: 'Thông tin xác thực',
      },
      stats: {
        totalCount: 'Tổng số tài sản',
        securityStatus: 'Bảo mật nội dung',
        distribution: 'Phân loại tài sản',
        encryptedCount: 'Tài sản có nội dung bảo mật',
        items: 'tài sản',
      },
      pagination: {
        showing: 'Đang hiển thị',
        to: '–',
        of: 'trên',
        assets: 'tài sản',
        rowsPerPage: 'Số dòng mỗi trang:',
        prev: 'Trước',
        next: 'Sau',
      },
      addModal: {
        title: 'Thêm tài sản vào kho',
        desc: 'Khai báo thông tin tài sản và nội dung bảo mật.',
        nameLabel: 'Tên tài sản',
        namePlaceholder: 'Ví dụ: Di chúc gia đình, Mật khẩu ví lạnh Ledger...',
        typeLabel: 'Loại tài sản',
        typePlaceholder: '-- Chọn loại tài sản --',
        descriptionLabel: 'Mô tả / Ghi chú',
        descriptionPlaceholder: 'Thông tin bổ sung về tài sản...',
        payloadLabel: 'Nội dung bí mật',
        payloadPlaceholder: 'Nhập nội dung cần bảo mật (mật khẩu, khóa riêng tư, ghi chú tuyệt mật...)',
        payloadHint: 'Nội dung chỉ gửi khi lưu và không bao giờ hiển thị lại trong danh sách.',
        submitBtn: 'Lưu vào kho',
        submittingBtn: 'Đang lưu...',
      },
      validation: {
        nameRequired: 'Vui lòng nhập tên tài sản.',
        nameMax: 'Tên tài sản không được vượt quá 150 ký tự.',
        typeRequired: 'Vui lòng chọn loại tài sản.',
        descMax: 'Mô tả không được vượt quá 1000 ký tự.',
        payloadRequired: 'Vui lòng nhập nội dung bí mật.',
      },
      alerts: {
        BACKEND_NOT_READY: 'Dịch vụ tài sản chưa sẵn sàng. Vui lòng thử lại sau.',
        UNAUTHENTICATED: 'Phiên làm việc đã hết hạn hoặc chưa đăng nhập.',
        ACCESS_DENIED: 'Bạn không có quyền truy cập tài sản trong kho này.',
        VAULT_ACCESS_DENIED: 'Bạn không có quyền truy cập tài sản trong kho này.',
        RESOURCE_NOT_FOUND: 'Không tìm thấy kho hoặc tài sản thuộc quyền truy cập của bạn.',
        VAULT_NOT_FOUND: 'Không tìm thấy kho hoặc tài sản thuộc quyền truy cập của bạn.',
        VAULT_NOT_EDITABLE: 'Kho hiện không cho phép thêm tài sản.',
        VALIDATION_FAILED: 'Thông tin tài sản chưa hợp lệ. Vui lòng kiểm tra lại.',
        CONFLICT: 'Tài sản có xung đột trạng thái hoặc kho đã bị khóa.',
        NETWORK_ERROR: 'Không thể kết nối máy chủ. Vui lòng kiểm tra mạng và thử lại.',
        SERVER_ERROR: 'Máy chủ gặp sự cố. Vui lòng thử lại sau.',
        addSuccess: 'Đã thêm tài sản vào danh sách.',
        loadError: 'Không thể tải danh sách tài sản. Vui lòng thử lại sau.',
        saveError: 'Đã xảy ra lỗi khi lưu tài sản. Vui lòng kiểm tra lại.',
        retryBtn: 'Thử lại',
      },
    },
  },
  en: {
    assets: {
      title: 'Asset Inventory',
      subtitle: 'Record and organize assets within your vault to prepare for succession planning.',
      addNewBtn: 'Add New Asset',
      notice:
        'Legal Notice: Assets recorded in this system are for inventory and planning purposes only and do not constitute actual legal transfer or delivery of ownership.',
      noticeDismiss: 'Understood',
      noticeInfoTooltip: 'View legal notice',
      pageScope: 'Search, filters and summaries apply to the current page.',
      searchPlaceholder: 'Search name or description on this page...',
      filterAll: 'All Categories',
      clearFilter: 'Clear Filter',
      filterAria: 'Filter by asset type',
      loadingText: 'Retrieving asset inventory from vault...',
      errorTitle: 'An error occurred while loading assets',
      signIn: 'Sign in again',
      emptyTitle: 'No assets found in your vault',
      emptyDesc: 'Add a private note or credentials to your heritage vault.',
      emptyAction: 'Add New Asset',
      noMatchTitle: 'No matching assets found',
      noMatchDesc: 'No assets match your search keyword or selected category filter.',
      colName: 'Asset Name & Details',
      colType: 'Asset Type',
      colPayloadStatus: 'Secret Content',
      colDate: 'Recorded On',
      colActions: 'Actions',
      colDescription: 'Description / Notes',
      noDescription: 'No detailed description provided.',
      actionMenuAria: 'Asset actions',
      payloadSecured: 'Secret content set',
      payloadEmpty: 'No secret content',
      cancelBtn: 'Cancel',
      closeBtn: 'Close',
      detailModalTitle: 'Asset Details Specification',
      legalNoticeModalTitle: 'Legal Advisory on Asset Inventory',
      types: {
        TEXT: 'Private Note',
        CREDENTIAL: 'Credentials',
      },
      stats: {
        totalCount: 'Total Assets Recorded',
        securityStatus: 'Secret Content',
        distribution: 'Asset Type Allocation',
        encryptedCount: 'Assets with secret content',
        items: 'assets',
      },
      pagination: {
        showing: 'Showing',
        to: '–',
        of: 'of',
        assets: 'assets',
        rowsPerPage: 'Rows per page:',
        prev: 'Prev',
        next: 'Next',
      },
      addModal: {
        title: 'Add Asset to Vault',
        desc: 'Declare asset details and secret content.',
        nameLabel: 'Asset Title / Name',
        namePlaceholder: 'e.g. Family Wishes Note, Hardware Wallet Backup Seed...',
        typeLabel: 'Asset Type',
        typePlaceholder: '-- Select asset type --',
        descriptionLabel: 'Description / Notes',
        descriptionPlaceholder: 'Additional context regarding custody or identification...',
        payloadLabel: 'Secret Content',
        payloadPlaceholder: 'Enter secret data to be protected (passwords, private keys, secrets...)',
        payloadHint: 'Content is sent when saving and never returned in the asset list.',
        submitBtn: 'Save to Vault',
        submittingBtn: 'Saving...',
      },
      validation: {
        nameRequired: 'Asset name is required.',
        nameMax: 'Asset name must not exceed 150 characters.',
        typeRequired: 'Please select an asset type.',
        descMax: 'Description must not exceed 1000 characters.',
        payloadRequired: 'Confidential payload is required.',
      },
      alerts: {
        BACKEND_NOT_READY: 'The asset service is not ready. Please try again later.',
        UNAUTHENTICATED: 'Your session has expired or you are not signed in.',
        ACCESS_DENIED: 'You do not have access to assets in this vault.',
        VAULT_ACCESS_DENIED: 'You do not have access to assets in this vault.',
        RESOURCE_NOT_FOUND: 'No accessible vault or asset was found.',
        VAULT_NOT_FOUND: 'No accessible vault or asset was found.',
        VAULT_NOT_EDITABLE: 'This vault currently does not allow new assets.',
        VALIDATION_FAILED: 'Asset information is invalid. Please check the form.',
        CONFLICT: 'Asset conflict or vault locked.',
        NETWORK_ERROR: 'Unable to reach the server. Check your connection and retry.',
        SERVER_ERROR: 'The server encountered a problem. Please try again later.',
        addSuccess: 'Asset added to the list.',
        loadError: 'Failed to retrieve asset inventory. Please try again.',
        saveError: 'An error occurred while saving the asset. Please try again.',
        retryBtn: 'Retry',
      },
    },
  },
};

/**
 * Resolves a safe translations dictionary for Asset Management.
 * If an external `t` object with `t.assets` is provided, it is used.
 * Otherwise, falls back to the self-contained bilingual dictionary.
 *
 * @param {Object} [t] - Optional external translation object
 * @param {string} [lang='vi'] - Language code ('vi' | 'en')
 * @returns {Object} Valid translation dictionary containing `assets`
 */
export function getAssetTranslations(t, lang = 'vi') {
  if (t && t.assets && typeof t.assets === 'object') {
    return t;
  }
  return ASSET_I18N[lang] || ASSET_I18N.vi;
}
