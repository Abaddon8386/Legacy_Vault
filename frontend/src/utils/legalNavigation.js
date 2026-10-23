// Shared by the Legal sidebar, route lookup and page headings.
export const LEGAL_NAVIGATION_REGISTRY = [
  { id: 'death-verification', path: '/legal/death-verification', labelVi: 'Xác minh tử vong', labelEn: 'Death Verification', titleVi: 'Xác minh giấy tờ khai tử', titleEn: 'Death document verification', status: 'ACTIVE' },
  { id: 'will-document-verification', path: '/legal/will-document-verification', labelVi: 'Đối chiếu di chúc', labelEn: 'Will Verification', titleVi: 'Đối chiếu di chúc', titleEn: 'Will comparison', status: 'ACTIVE' },
  { id: 'basis-route-selection', path: '/legal/basis-route-selection', labelVi: 'Thẩm định căn cứ', labelEn: 'Basis Adjudication', titleVi: 'Phân loại căn cứ pháp lý', titleEn: 'Legal basis classification', status: 'ACTIVE' },
  { id: 'dossier-review', path: '/legal/dossier-review', labelVi: 'Thẩm định hồ sơ', labelEn: 'Dossier Review', titleVi: 'Thẩm định hồ sơ căn cứ', titleEn: 'Legal dossier review', status: 'ACTIVE' },
  { id: 'approval-review', path: '/legal/approval-review', labelVi: 'Phê duyệt hồ sơ', labelEn: 'Final approval', status: 'ACTIVE' },
  { id: 'controlled-unlock', path: '/legal/controlled-unlock', labelVi: 'Mở khóa có kiểm soát', labelEn: 'Controlled unlock', status: 'ACTIVE' },
];
export const LEGAL_ROUTE_STEPS = Object.fromEntries([
  ['/legal', 'death-verification'], ...LEGAL_NAVIGATION_REGISTRY.map(item => [item.path, item.id]),
]);
export const legalStepTitle = (step, lang) => {
  const item = LEGAL_NAVIGATION_REGISTRY.find(item => item.id === step);
  return lang === 'en' ? item?.labelEn : item?.labelVi;
};
