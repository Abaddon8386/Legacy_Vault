/**
 * Beneficiary Confirmation Validation & Logic — PS-54 / ST-26
 * Architecture notes:
 * - Beneficiary confirmation is recorded separately by Staff Executor (STAFF_EXECUTOR).
 * - Delivery of assets does NOT automatically confirm a beneficiary.
 * - Missing or absent confirmation data evaluates to null / unknown, NEVER fabricated as PENDING.
 * - Confirmation requires a valid receipt / docket reference string.
 * - This is an operational Staff intake action, not an end-user beneficiary login screen.
 * - Note: beneficiaryId, receiptReference, notes and confirmationStatus represent FE state model
 *   pending official backend confirmation contract.
 */

export const BENEFICIARY_CONFIRMATION_ERROR_KEYS = {
  BENEFICIARY_REQUIRED: 'beneficiaryRequired',
  RECEIPT_REFERENCE_REQUIRED: 'receiptReferenceRequired',
  ALREADY_CONFIRMED: 'alreadyConfirmed',
  INVALID_CONFIRMATION_STATUS: 'invalidConfirmationStatus',
  CASE_REQUIRED: 'caseRequired',
};

export const BENEFICIARY_CONFIRM_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
};

/**
 * Checks whether current session is authorized to access Beneficiary Confirmation.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessBeneficiaryConfirmation(session) {
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
 * Validates the form data for recording a beneficiary confirmation.
 * Form requires:
 * - beneficiaryId: non-empty string
 * - receiptReference: non-empty string after trim
 *
 * @param {Object} formValues
 * @param {string} [formValues.beneficiaryId]
 * @param {string} [formValues.receiptReference]
 * @param {string} [formValues.currentStatus]
 * @returns {{ isValid: boolean, errors: Object.<string, string> }}
 */
export function validateBeneficiaryConfirmationForm(formValues = {}) {
  const errors = {};
  const { beneficiaryId, receiptReference, currentStatus } = formValues;

  if (!beneficiaryId || typeof beneficiaryId !== 'string' || !beneficiaryId.trim()) {
    errors.beneficiaryId = BENEFICIARY_CONFIRMATION_ERROR_KEYS.BENEFICIARY_REQUIRED;
  }

  if (!receiptReference || typeof receiptReference !== 'string' || !receiptReference.trim()) {
    errors.receiptReference = BENEFICIARY_CONFIRMATION_ERROR_KEYS.RECEIPT_REFERENCE_REQUIRED;
  }

  if (currentStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED) {
    errors.currentStatus = BENEFICIARY_CONFIRMATION_ERROR_KEYS.ALREADY_CONFIRMED;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Evaluates whether asset delivery affects beneficiary confirmation and resolves confirmation status.
 * Business Rule:
 * 1. Asset delivery does NOT automatically confirm a beneficiary.
 * 2. Missing/absent confirmation data returns null (NOT PENDING), preventing false assumptions.
 *
 * @param {string} deliveryStatus
 * @param {string|null|undefined} currentConfirmationStatus
 * @returns {string|null} - Returns CONFIRMED, PENDING, or null if unknown/missing.
 */
export function computeBeneficiaryConfirmationStatus(deliveryStatus, currentConfirmationStatus) {
  if (currentConfirmationStatus === BENEFICIARY_CONFIRM_STATUS.CONFIRMED) {
    return BENEFICIARY_CONFIRM_STATUS.CONFIRMED;
  }
  if (currentConfirmationStatus === BENEFICIARY_CONFIRM_STATUS.PENDING) {
    return BENEFICIARY_CONFIRM_STATUS.PENDING;
  }
  // Missing or undefined confirmation data does NOT default to PENDING
  return null;
}
