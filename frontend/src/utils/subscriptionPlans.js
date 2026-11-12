/**
 * Các tính năng chung của mọi gói (tiếng Việt).
 */
export const COMMON_FEATURES_VI = [
  'Tệp tối đa 10 MB',
  'Người thụ hưởng và người thi hành bên ngoài',
  'Giám sát định kỳ',
  'Lịch sử phiên bản',
];

/**
 * Các tính năng chung của mọi gói (tiếng Anh).
 */
export const COMMON_FEATURES_EN = [
  'Max 10 MB per file',
  'Beneficiaries and external executors',
  'Periodic monitoring',
  'Document version history',
];

/**
 * Danh mục 3 gói dùng để hiển thị phía giao diện: BASIC (miễn phí, 5 tài sản, 100 MB), STANDARD (499.000 đ, 50 tài sản, 1 GB), EXTENDED (999.000 đ, 200 tài sản, 5 GB); mỗi gói 1 kho trọn đời và tệp tối đa 10 MB. Giá và giới hạn chính thức do backend quyết định. Dùng bởi pages/landing/LandingPage.jsx và subscriptionService.js.
 */
export const SUBSCRIPTION_PLANS = [
  {
    code: 'BASIC',
    nameVi: 'Cơ bản',
    nameEn: 'Basic',
    priceVi: 'Miễn phí',
    priceEn: 'Free',
    purchasePriceVND: 0,
    maxVaultsLifetime: 1,
    maxAssets: 5,
    maxStorageBytes: 100 * 1024 * 1024, // 100 MB
    maxStorageFormatted: '100 MB',
    maxFileSizeMB: 10,
    badgeVi: 'Mặc định',
    badgeEn: 'Default',
    isPopular: false,
    featuresVi: [
      '5 tài sản',
      '100 MB lưu trữ',
      ...COMMON_FEATURES_VI,
    ],
    featuresEn: [
      '5 assets',
      '100 MB storage',
      ...COMMON_FEATURES_EN,
    ],
  },
  {
    code: 'STANDARD',
    nameVi: 'Tiêu chuẩn',
    nameEn: 'Standard',
    priceVi: '499.000 đ',
    priceEn: '499,000 VND',
    purchasePriceVND: 499000,
    maxVaultsLifetime: 1,
    maxAssets: 50,
    maxStorageBytes: 1024 * 1024 * 1024, // 1 GB
    maxStorageFormatted: '1 GB',
    maxFileSizeMB: 10,
    badgeVi: '',
    badgeEn: '',
    isPopular: false,
    featuresVi: [
      '50 tài sản',
      '1 GB lưu trữ',
      ...COMMON_FEATURES_VI,
    ],
    featuresEn: [
      '50 assets',
      '1 GB storage',
      ...COMMON_FEATURES_EN,
    ],
  },
  {
    code: 'EXTENDED',
    nameVi: 'Mở rộng',
    nameEn: 'Extended',
    priceVi: '999.000 đ',
    priceEn: '999,000 VND',
    purchasePriceVND: 999000,
    maxVaultsLifetime: 1,
    maxAssets: 200,
    maxStorageBytes: 5 * 1024 * 1024 * 1024, // 5 GB
    maxStorageFormatted: '5 GB',
    maxFileSizeMB: 10,
    badgeVi: 'Nâng cao',
    badgeEn: 'Advanced',
    isPopular: false,
    featuresVi: [
      '200 tài sản',
      '5 GB lưu trữ',
      ...COMMON_FEATURES_VI,
    ],
    featuresEn: [
      '200 assets',
      '5 GB storage',
      ...COMMON_FEATURES_EN,
    ],
  },
];
