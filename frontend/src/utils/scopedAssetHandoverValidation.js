/**
 * Scoped Asset Handover Validation & Logic — PS-53 / ST-25 / LV-HANDOVER-001
 * Architecture notes:
 * - LV-HANDOVER-001: Only assets and recipient beneficiaries within the approved allocation scope
 *   are eligible for handover; anything outside scope must be blocked.
 * - Client guard strictly verifies active session and STAFF_EXECUTOR role.
 * - Client guard does NOT substitute for backend authorization.
 * - If approved allocation scope data is missing or unapproved, handover actions are blocked.
 * - Scope fields below are a local FE model, not a confirmed handover API payload.
 * - State preserves language-neutral error keys for dynamic VI <-> EN rendering.
 */

export const SCOPED_ASSET_HANDOVER_ERROR_KEYS = {
  SCOPE_REQUIRED: 'scopeRequired',
  SCOPE_NOT_APPROVED: 'scopeNotApproved',
  ASSET_OUT_OF_SCOPE: 'assetOutOfScope',
  BENEFICIARY_OUT_OF_SCOPE: 'beneficiaryOutOfScope',
  ALREADY_DELIVERED: 'alreadyDelivered',
  INVALID_DELIVERY_STATUS: 'invalidDeliveryStatus',
  CASE_REQUIRED: 'caseRequired',
};

export const HANDOVER_STATUS = {
  PENDING: 'PENDING',
  DELIVERED: 'DELIVERED',
};

/**
 * Checks whether the current user session is authorized to access
 * the Staff Scoped Asset Handover screen.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessScopedAssetHandover(session) {
  if (!session || !session.accessToken || typeof session.expiresAt !== 'number') {
    return false;
  }

  if (Date.now() >= session.expiresAt) {
    return false;
  }

  const roles = session.user?.roles;
  if (!Array.isArray(roles)) {
    return false;
  }

  return roles.includes('STAFF_EXECUTOR');
}

/**
 * Validates whether an approved allocation scope is present and eligible.
 * Returns isValid: false if scope is missing, unapproved, or empty.
 *
 * @param {Object|null|undefined} scopeData
 * @returns {{ isValid: boolean, isApproved: boolean, errorKey: string|null }}
 */
export function validateApprovedAllocationScope(scopeData) {
  if (!scopeData || typeof scopeData !== 'object') {
    return {
      isValid: false,
      isApproved: false,
      errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED,
    };
  }

  // Must have approved flag or status
  const isApproved =
    scopeData.isApproved === true ||
    scopeData.status === 'APPROVED' ||
    scopeData.allocationStatus === 'APPROVED';

  if (!isApproved) {
    return {
      isValid: false,
      isApproved: false,
      errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_NOT_APPROVED,
    };
  }

  const items = Array.isArray(scopeData.allocations) ? scopeData.allocations : [];
  if (items.length === 0) {
    return {
      isValid: false,
      isApproved: true,
      errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED,
    };
  }

  return {
    isValid: true,
    isApproved: true,
    errorKey: null,
  };
}

/**
 * Filters items against an approved allocation scope.
 * An item is eligible ONLY if both assetId and beneficiaryId exist in approved scope.
 *
 * @param {Array<Object>} candidates
 * @param {Object} approvedScope
 * @returns {{ eligible: Array<Object>, blocked: Array<Object> }}
 */
export function filterScopedHandoverItems(candidates = [], approvedScope = null) {
  const scopeValidation = validateApprovedAllocationScope(approvedScope);
  if (!scopeValidation.isValid) {
    // If scope is missing or unapproved, all candidates are blocked from handover
    return {
      eligible: [],
      blocked: Array.isArray(candidates) ? candidates.map((item) => ({ ...item, reason: scopeValidation.errorKey })) : [],
    };
  }

  const approvedAllocations = approvedScope.allocations || [];
  const eligible = [];
  const blocked = [];

  for (const candidate of (Array.isArray(candidates) ? candidates : [])) {
    if (!candidate || !candidate.assetId) {
      blocked.push({ ...candidate, reason: SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE });
      continue;
    }

    // Match in approved allocations
    const matchedAllocation = approvedAllocations.find(
      (alloc) =>
        alloc.assetId === candidate.assetId &&
        (Boolean(alloc.beneficiaryId) && Boolean(candidate.beneficiaryId) && alloc.beneficiaryId === candidate.beneficiaryId)
    );

    if (matchedAllocation) {
      eligible.push({
        ...candidate,
        allocationId: matchedAllocation.allocationId || matchedAllocation.id || null,
        beneficiaryName: candidate.beneficiaryName || matchedAllocation.beneficiaryName || '',
        handoverStatus: Object.values(HANDOVER_STATUS).includes(candidate.handoverStatus) ? candidate.handoverStatus : null,
        isInApprovedScope: true,
      });
    } else {
      blocked.push({
        ...candidate,
        isInApprovedScope: false,
        reason: SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE,
      });
    }
  }

  return { eligible, blocked };
}

/**
 * Validates a handover recording request.
 * Strictly checks LV-HANDOVER-001 (must be in approved scope and not yet delivered).
 *
 * @param {Object} item
 * @param {Object} approvedScope
 * @returns {{ isAllowed: boolean, errorKey: string|null }}
 */
export function validateHandoverAttempt(item, approvedScope) {
  if (!item || !item.assetId) {
    return { isAllowed: false, errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE };
  }

  const scopeValidation = validateApprovedAllocationScope(approvedScope);
  if (!scopeValidation.isValid) {
    return { isAllowed: false, errorKey: scopeValidation.errorKey };
  }

  const approvedAllocations = approvedScope.allocations || [];
  const isScoped = approvedAllocations.some(
    (alloc) =>
      alloc.assetId === item.assetId &&
      (Boolean(alloc.beneficiaryId) && Boolean(item.beneficiaryId) && alloc.beneficiaryId === item.beneficiaryId)
  );

  if (!isScoped) {
    return { isAllowed: false, errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE };
  }

  if (item.handoverStatus === HANDOVER_STATUS.DELIVERED) {
    return { isAllowed: false, errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.ALREADY_DELIVERED };
  }

  if (item.handoverStatus !== HANDOVER_STATUS.PENDING) {
    return { isAllowed: false, errorKey: SCOPED_ASSET_HANDOVER_ERROR_KEYS.INVALID_DELIVERY_STATUS };
  }

  return { isAllowed: true, errorKey: null };
}
