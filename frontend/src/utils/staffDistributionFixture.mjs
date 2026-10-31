import { distributionActions } from '../workflows/distributionWorkflowService.js';

// Synthetic server state for tests only; no fallback is imported by production code.
export function distributionFixture(caseId, { allowed = [], document = null, phase = 'AWAITING_DOCUMENTS' } = {}) {
  return {
    caseId, revision: 1, phase,
    prerequisites: { deathApproved: true, willMatched: true },
    request: { id: caseId, reason: 'Provide distribution documents' },
    document, allocation: null,
    capabilities: Object.fromEntries(Object.keys(distributionActions).map(action => [action, {
      allowed: allowed.includes(action), blockedReason: allowed.includes(action) ? null : 'WAIT',
    }])),
  };
}
