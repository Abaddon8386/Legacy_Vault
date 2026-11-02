export const BASIS_LEGAL_RESULTS = ['LEGAL_APPROVED', 'LEGAL_REJECTED', 'APPROVE_DOCUMENTS',
  'REQUEST_DOCUMENT_SUPPLEMENTATION', 'APPROVE_ALLOCATIONS', 'REQUEST_ALLOCATION_CHANGES',
  'FRESH', 'REVIEW_REQUIRED', 'COURT_VALID', 'COURT_INVALID', 'COURT_INCONCLUSIVE'];

export function validBasisLegalHistory(history) {
  return Array.isArray(history) && history.every(entry => entry && BASIS_LEGAL_RESULTS.includes(entry.result)
    && typeof entry.id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(entry.id)
    && (entry.reason === null || typeof entry.reason === 'string')
    && Number.isFinite(Date.parse(entry.decidedAt)) && typeof entry.currentScope === 'boolean');
}
