// Shared by the Legal sidebar, route lookup and page headings.
/**
 * Danh bạ các mục điều hướng của vai trò chuyên viên pháp lý (id, đường dẫn giao diện, nhãn và tiêu đề vi/en). Dùng bởi App.jsx, AppShell (thanh bên) và các trang pages/legal.
 */
export const LEGAL_NAVIGATION_REGISTRY = [
  { id: 'death-verification', path: '/legal/death-verification', labelVi: 'Xác minh tử vong', labelEn: 'Death Verification', titleVi: 'Xác minh giấy tờ khai tử', titleEn: 'Death document verification', status: 'ACTIVE' },
  { id: 'will-document-verification', path: '/legal/will-document-verification', labelVi: 'Đối chiếu di chúc', labelEn: 'Will Verification', titleVi: 'Đối chiếu di chúc', titleEn: 'Will comparison', status: 'ACTIVE' },
  { id: 'basis-route-selection', path: '/legal/basis-route-selection', labelVi: 'Thẩm định căn cứ', labelEn: 'Basis Adjudication', titleVi: 'Thẩm định giấy tờ phân chia tài sản', titleEn: 'Distribution document assessment', status: 'ACTIVE' },
  { id: 'approval-review', path: '/legal/approval-review', labelVi: 'Phê duyệt hồ sơ', labelEn: 'Final approval', status: 'ACTIVE' },
  { id: 'controlled-unlock', path: '/legal/controlled-unlock', labelVi: 'Mở khóa có kiểm soát', labelEn: 'Controlled unlock', status: 'ACTIVE' },
];
/**
 * Ánh xạ đường dẫn giao diện (/legal, các đường dẫn trong registry, /legal/dossier-review) sang id bước tương ứng.
 */
export const LEGAL_ROUTE_STEPS = Object.fromEntries([
  ['/legal', 'death-verification'], ...LEGAL_NAVIGATION_REGISTRY.map(item => [item.path, item.id]), ['/legal/dossier-review', 'basis-route-selection'],
]);
/**
 * Trả nhãn của bước theo ngôn ngữ (bước dossier-review dùng chung nhãn với basis-route-selection).
 */
export const legalStepTitle = (step, lang) => {
  const item = LEGAL_NAVIGATION_REGISTRY.find(item => item.id === (step === 'dossier-review' ? 'basis-route-selection' : step));
  return lang === 'en' ? item?.labelEn : item?.labelVi;
};
