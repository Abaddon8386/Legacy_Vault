/**
 * Close & Archive Case Validation & Guard Logic — PS-56 / ST-28-29
 *
 * Rules:
 * - Precondition for Close & Archive (LV-CLOSE-001):
 *   Only allowed when 100% of assets delivered AND 100% of beneficiaries confirmed.
 * - Counts must be strictly non-negative safe integers; total must be strictly > 0.
 * - Completed count cannot exceed total count (delivered <= total, confirmed <= total).
 * - Values such as "", " ", false, true, NaN, Infinity are strictly rejected without coercion.
 * - Missing or invalid data evaluates to INDETERMINATE, never eligible or 0%.
 * - 0/0 is never eligible.
 * - Read-only enforcement: When vaultStatus === 'ARCHIVED' or caseStatus === 'CLOSED',
 *   the entire dossier is locked as read-only.
 * - Client guard strictly verifies active session and STAFF_EXECUTOR role.
 */

export const CLOSE_ARCHIVE_ELIGIBILITY_STATUS = {
  ELIGIBLE: 'ELIGIBLE',
  INELIGIBLE: 'INELIGIBLE',
  INDETERMINATE: 'INDETERMINATE',
};

export const CLOSE_ARCHIVE_CONDITIONS = {
  ASSET_DELIVERY_INCOMPLETE: 'assetDeliveryIncomplete',
  BENEFICIARY_CONFIRMATION_INCOMPLETE: 'beneficiaryConfirmationIncomplete',
  ASSET_DATA_UNAVAILABLE: 'assetDataUnavailable',
  BENEFICIARY_DATA_UNAVAILABLE: 'beneficiaryDataUnavailable',
};

/**
 * Checks whether current user session is authorized to access Close & Archive.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessCloseArchive(session) {
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
 * Determines if a dossier / vault is in an archived/closed read-only state.
 *
 * @param {string|null|undefined} vaultStatus
 * @param {string|null|undefined} caseStatus
 * @returns {boolean}
 */
export function isCaseArchived(vaultStatus, caseStatus) {
  const normalizedVault = typeof vaultStatus === 'string' ? vaultStatus.trim().toUpperCase() : '';
  const normalizedCase = typeof caseStatus === 'string' ? caseStatus.trim().toUpperCase() : '';
  return normalizedVault === 'ARCHIVED' || normalizedCase === 'CLOSED';
}

/**
 * Evaluates whether close & archive preconditions are satisfied.
 *
 * @param {Object} [assetData={}] - { delivered, total }
 * @param {Object} [beneficiaryData={}] - { confirmed, total }
 * @returns {{
 *   isEligible: boolean,
 *   eligibilityStatus: string,
 *   isAssetComplete: boolean,
 *   isBeneficiaryComplete: boolean,
 *   isAssetValid: boolean,
 *   isBeneficiaryValid: boolean,
 *   unmetConditions: Array<string>
 * }}
 */
export function evaluateCloseArchivePreconditions(assetData = {}, beneficiaryData = {}) {
  const unmetConditions = [];

  // 1. Process Asset Delivery
  const assetDelivered = normalizeSafeIntegerCount(assetData?.delivered);
  const assetTotal = normalizeSafeIntegerCount(assetData?.total);

  let isAssetValid = false;
  let isAssetComplete = false;

  if (
    assetDelivered !== null &&
    assetTotal !== null &&
    assetTotal > 0 &&
    assetDelivered <= assetTotal
  ) {
    isAssetValid = true;
    isAssetComplete = assetDelivered === assetTotal;
    if (!isAssetComplete) {
      unmetConditions.push(CLOSE_ARCHIVE_CONDITIONS.ASSET_DELIVERY_INCOMPLETE);
    }
  } else {
    unmetConditions.push(CLOSE_ARCHIVE_CONDITIONS.ASSET_DATA_UNAVAILABLE);
  }

  // 2. Process Beneficiary Confirmation
  const benConfirmed = normalizeSafeIntegerCount(beneficiaryData?.confirmed);
  const benTotal = normalizeSafeIntegerCount(beneficiaryData?.total);

  let isBenValid = false;
  let isBenComplete = false;

  if (
    benConfirmed !== null &&
    benTotal !== null &&
    benTotal > 0 &&
    benConfirmed <= benTotal
  ) {
    isBenValid = true;
    isBenComplete = benConfirmed === benTotal;
    if (!isBenComplete) {
      unmetConditions.push(CLOSE_ARCHIVE_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE);
    }
  } else {
    unmetConditions.push(CLOSE_ARCHIVE_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE);
  }

  // 3. Strict AND condition based on count equality
  const isEligible = Boolean(isAssetValid && isBenValid && isAssetComplete && isBenComplete);

  let eligibilityStatus = CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INELIGIBLE;
  if (isEligible) {
    eligibilityStatus = CLOSE_ARCHIVE_ELIGIBILITY_STATUS.ELIGIBLE;
  } else if (!isAssetValid || !isBenValid) {
    eligibilityStatus = CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE;
  }

  return {
    isEligible,
    eligibilityStatus,
    isAssetComplete,
    isBeneficiaryComplete: isBenComplete,
    isAssetValid,
    isBeneficiaryValid: isBenValid,
    unmetConditions,
  };
}
