/**
 * Completion Progress Validation & Business Logic — PS-55 / ST-27 / LV-CLOSE-001
 * Architecture notes:
 * - LV-CLOSE-001: Case is Complete ONLY when:
 *   (assets delivered === 100%) AND (beneficiaries confirmed === 100%).
 * - Dual independent progress metrics: never blended or averaged together.
 * - Missing total counts or total = 0 are NEVER treated as complete (0/0 != Complete).
 *   When total is 0 or data is missing, flag as pending confirmation.
 * - Client guard strictly verifies active session and STAFF_EXECUTOR role.
 */

export const COMPLETION_PROGRESS_STATUS = {
  COMPLETED: 'COMPLETED',
  INCOMPLETE: 'INCOMPLETE',
  PENDING_VERIFICATION: 'PENDING_VERIFICATION',
};

export const COMPLETION_MISSING_CONDITIONS = {
  ASSET_DELIVERY_INCOMPLETE: 'assetDeliveryIncomplete',
  BENEFICIARY_CONFIRMATION_INCOMPLETE: 'beneficiaryConfirmationIncomplete',
  ASSET_TOTAL_UNVERIFIED: 'assetTotalUnverified',
  BENEFICIARY_TOTAL_UNVERIFIED: 'beneficiaryTotalUnverified',
  ZERO_TOTAL_AWAITING_CONFIRMATION: 'zeroTotalAwaitingConfirmation',
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
 * Normalizes an integer count, returning null if invalid or undefined.
 *
 * @param {any} val
 * @returns {number|null}
 */
function normalizeCount(val) {
  if (val === null || val === undefined || val === '') return null;
  const num = Number(val);
  if (!Number.isFinite(num) || num < 0 || Math.floor(num) !== num) {
    return null;
  }
  return num;
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
  const assetDelivered = normalizeCount(assetData?.delivered);
  const assetTotal = normalizeCount(assetData?.total);

  let assetPercentage = null;
  let isAsset100 = false;
  let isAssetVerified = true;

  if (assetTotal === null) {
    isAssetVerified = false;
    missingConditions.push(COMPLETION_MISSING_CONDITIONS.ASSET_TOTAL_UNVERIFIED);
  } else if (assetTotal === 0) {
    // 0/0 is NOT complete; total = 0 requires contract verification
    isAssetVerified = false;
    missingConditions.push(COMPLETION_MISSING_CONDITIONS.ZERO_TOTAL_AWAITING_CONFIRMATION);
  } else {
    const validDelivered = assetDelivered ?? 0;
    assetPercentage = Math.min(100, Math.floor((validDelivered / assetTotal) * 100));
    isAsset100 = validDelivered === assetTotal;
    if (!isAsset100) {
      missingConditions.push(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE);
    }
  }

  // 2. Process Beneficiary Confirmation Metric
  const benConfirmed = normalizeCount(beneficiaryData?.confirmed);
  const benTotal = normalizeCount(beneficiaryData?.total);

  let benPercentage = null;
  let isBen100 = false;
  let isBenVerified = true;

  if (benTotal === null) {
    isBenVerified = false;
    missingConditions.push(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_TOTAL_UNVERIFIED);
  } else if (benTotal === 0) {
    // 0/0 is NOT complete
    isBenVerified = false;
    if (!missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ZERO_TOTAL_AWAITING_CONFIRMATION)) {
      missingConditions.push(COMPLETION_MISSING_CONDITIONS.ZERO_TOTAL_AWAITING_CONFIRMATION);
    }
  } else {
    const validConfirmed = benConfirmed ?? 0;
    benPercentage = Math.min(100, Math.floor((validConfirmed / benTotal) * 100));
    isBen100 = validConfirmed === benTotal;
    if (!isBen100) {
      missingConditions.push(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE);
    }
  }

  // 3. Strict AND condition under LV-CLOSE-001
  const isComplete = Boolean(isAsset100 && isBen100);

  let overallStatus = COMPLETION_PROGRESS_STATUS.INCOMPLETE;
  if (isComplete) {
    overallStatus = COMPLETION_PROGRESS_STATUS.COMPLETED;
  } else if (!isAssetVerified || !isBenVerified) {
    overallStatus = COMPLETION_PROGRESS_STATUS.PENDING_VERIFICATION;
  }

  return {
    isComplete,
    overallStatus,
    assetMetric: {
      delivered: assetDelivered,
      total: assetTotal,
      percentage: assetPercentage,
      is100: isAsset100,
      isVerified: isAssetVerified,
    },
    beneficiaryMetric: {
      confirmed: benConfirmed,
      total: benTotal,
      percentage: benPercentage,
      is100: isBen100,
      isVerified: isBenVerified,
    },
    missingConditions,
  };
}
