/**
 * Completion Progress Validation & Business Logic — PS-55 / ST-27 / LV-CLOSE-001
 * Architecture notes:
 * - LV-CLOSE-001: Case is Complete ONLY when:
 *   (assets delivered === 100%) AND (beneficiaries confirmed === 100%).
 * - Counts must be strictly non-negative safe integers; total must be strictly > 0.
 * - Completed count cannot exceed total count (delivered <= total, confirmed <= total).
 * - Coercible values ("", " ", false, true, NaN, Infinity) are strictly rejected, never coerced.
 * - Completion is decided strictly by count equality (delivered === total && confirmed === total),
 *   never by rounded percentage.
 * - Missing/invalid data is INDETERMINATE (Chưa đủ thông tin), never displayed as 0% or completed.
 * - Client guard strictly verifies active session and STAFF_EXECUTOR role.
 */

export const COMPLETION_PROGRESS_STATUS = {
  COMPLETED: 'COMPLETED',
  INCOMPLETE: 'INCOMPLETE',
  INDETERMINATE: 'INDETERMINATE', // Internal FE presentation state for missing/invalid data
  PENDING_VERIFICATION: 'INDETERMINATE', // Alias if referenced as internal FE presentation state
};

export const COMPLETION_MISSING_CONDITIONS = {
  ASSET_DELIVERY_INCOMPLETE: 'assetDeliveryIncomplete',
  BENEFICIARY_CONFIRMATION_INCOMPLETE: 'beneficiaryConfirmationIncomplete',
  ASSET_DATA_UNAVAILABLE: 'assetDataUnavailable',
  BENEFICIARY_DATA_UNAVAILABLE: 'beneficiaryDataUnavailable',
};

/**
 * Checks whether current user session is authorized to access Completion Progress.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessCompletionProgress(session) {
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
 * Validates a safe integer count.
 * Rejects non-number types (boolean, string, object, null, undefined)
 * and invalid numbers (NaN, Infinity, negative, floating point, > MAX_SAFE_INTEGER).
 *
 * @param {any} val
 * @returns {number|null}
 */
export function normalizeSafeIntegerCount(val) {
  if (typeof val !== 'number') {
    return null;
  }
  if (!Number.isSafeInteger(val) || val < 0) {
    return null;
  }
  return val;
}

/**
 * Evaluates dual completion progress conforming strictly to LV-CLOSE-001.
 *
 * @param {Object} [assetData={}] - { delivered, total }
 * @param {Object} [beneficiaryData={}] - { confirmed, total }
 * @returns {{
 *   isComplete: boolean,
 *   overallStatus: string,
 *   assetMetric: { delivered: number|null, total: number|null, percentage: number|null, is100: boolean, isVerified: boolean },
 *   beneficiaryMetric: { confirmed: number|null, total: number|null, percentage: number|null, is100: boolean, isVerified: boolean },
 *   missingConditions: Array<string>
 * }}
 */
export function evaluateCompletionProgress(assetData = {}, beneficiaryData = {}) {
  const missingConditions = [];

  // 1. Process Asset Delivery Metric
  const assetDelivered = normalizeSafeIntegerCount(assetData?.delivered);
  const assetTotal = normalizeSafeIntegerCount(assetData?.total);

  let assetPercentage = null;
  let isAsset100 = false;
  let isAssetValid = false;

  // Strict validation: must have valid integers, total > 0, delivered <= total
  if (
    assetDelivered !== null &&
    assetTotal !== null &&
    assetTotal > 0 &&
    assetDelivered <= assetTotal
  ) {
    isAssetValid = true;
    isAsset100 = assetDelivered === assetTotal;
    assetPercentage = Math.floor((assetDelivered / assetTotal) * 100);
    if (!isAsset100) {
      missingConditions.push(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE);
    }
  } else {
    missingConditions.push(COMPLETION_MISSING_CONDITIONS.ASSET_DATA_UNAVAILABLE);
  }

  // 2. Process Beneficiary Confirmation Metric
  const benConfirmed = normalizeSafeIntegerCount(beneficiaryData?.confirmed);
  const benTotal = normalizeSafeIntegerCount(beneficiaryData?.total);

  let benPercentage = null;
  let isBen100 = false;
  let isBenValid = false;

  // Strict validation: must have valid integers, total > 0, confirmed <= total
  if (
    benConfirmed !== null &&
    benTotal !== null &&
    benTotal > 0 &&
    benConfirmed <= benTotal
  ) {
    isBenValid = true;
    isBen100 = benConfirmed === benTotal;
    benPercentage = Math.floor((benConfirmed / benTotal) * 100);
    if (!isBen100) {
      missingConditions.push(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE);
    }
  } else {
    missingConditions.push(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE);
  }

  // 3. Strict AND condition based on actual count equality (never rounded percentage)
  const isComplete = Boolean(isAssetValid && isBenValid && isAsset100 && isBen100);

  let overallStatus = COMPLETION_PROGRESS_STATUS.INCOMPLETE;
  if (isComplete) {
    overallStatus = COMPLETION_PROGRESS_STATUS.COMPLETED;
  } else if (!isAssetValid || !isBenValid) {
    overallStatus = COMPLETION_PROGRESS_STATUS.INDETERMINATE;
  }

  return {
    isComplete,
    overallStatus,
    assetMetric: {
      delivered: isAssetValid ? assetDelivered : null,
      total: isAssetValid ? assetTotal : null,
      percentage: assetPercentage,
      is100: isAsset100,
      isVerified: isAssetValid,
    },
    beneficiaryMetric: {
      confirmed: isBenValid ? benConfirmed : null,
      total: isBenValid ? benTotal : null,
      percentage: benPercentage,
      is100: isBen100,
      isVerified: isBenValid,
    },
    missingConditions,
  };
}
