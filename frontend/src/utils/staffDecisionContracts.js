/**
 * Các kết quả quyết định hợp lệ trong lịch sử thẩm định căn cứ pháp lý mà frontend chấp nhận từ backend. Dùng bởi pages/staff/staffLegalDocumentsService.js.
 */
export const BASIS_LEGAL_RESULTS = ['LEGAL_APPROVED', 'LEGAL_REJECTED', 'APPROVE_DOCUMENTS',
  'REQUEST_DOCUMENT_SUPPLEMENTATION', 'APPROVE_ALLOCATIONS', 'REQUEST_ALLOCATION_CHANGES',
  'FRESH', 'REVIEW_REQUIRED', 'COURT_VALID', 'COURT_INVALID', 'COURT_INCONCLUSIVE'];

/**
 * Kiểm tra lịch sử quyết định là mảng mà mỗi mục có id UUID, result thuộc BASIS_LEGAL_RESULTS, reason là null hoặc chuỗi, decidedAt hợp lệ và currentScope kiểu boolean.
 */
export function validBasisLegalHistory(history) {
  return Array.isArray(history) && history.every(entry => entry && BASIS_LEGAL_RESULTS.includes(entry.result)
    && typeof entry.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)
    && (entry.reason === null || typeof entry.reason === 'string')
    && Number.isFinite(Date.parse(entry.decidedAt)) && typeof entry.currentScope === 'boolean');
}
