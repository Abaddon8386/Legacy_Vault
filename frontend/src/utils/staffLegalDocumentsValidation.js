/**
 * Staff Legal Documents Validation & Client Role Guard — PS-31 / ST-17–19 / LV-BASIS-001
 * Architecture notes:
 * - Client guard strictly verifies active session and STAFF_EXECUTOR role.
 * - Client guard does NOT substitute for backend authorization.
 * - Form validation checks core metadata completeness (issuer, documentNumber, valid issuanceDate).
 * - State preserves language-neutral error keys for instant dynamic VI <-> EN rendering.
 */

import { staffLegalDocumentsI18n } from '../pages/staff/staffLegalDocumentsI18n.js';

export const STAFF_LEGAL_DOCS_ERROR_KEYS = {
  ISSUER_REQUIRED: 'issuerRequired',
  DOCUMENT_NUMBER_REQUIRED: 'documentNumberRequired',
  ISSUANCE_DATE_REQUIRED: 'issuanceDateRequired',
  ISSUANCE_DATE_INVALID: 'issuanceDateInvalid',
};

/**
 * Checks whether the current user session is authorized to access
 * the Staff Legal Basis Documents screen.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessStaffLegalDocuments(session) {
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
 * Validates the core legal document metadata form:
 * - issuer must be non-empty after trim
 * - documentNumber must be non-empty after trim
 * - issuanceDate must be non-empty after trim and represent a valid date
 *
 * @param {Object} formValues
 * @param {string} [formValues.issuer] - Name of issuing authority
 * @param {string} [formValues.documentNumber] - Document reference number
 * @param {string} [formValues.issuanceDate] - Issuance date (YYYY-MM-DD or standard parseable format)
 * @returns {{ isValid: boolean, errors: Object.<string, string> }}
 */
export function validateStaffLegalDocumentForm(formValues = {}) {
  const errors = {};
  const { issuer, documentNumber, issuanceDate } = formValues;

  // 1. Validate issuing authority
  if (!issuer || typeof issuer !== 'string' || !issuer.trim()) {
    errors.issuer = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUER_REQUIRED;
  }

  // 2. Validate document number
  if (!documentNumber || typeof documentNumber !== 'string' || !documentNumber.trim()) {
    errors.documentNumber = STAFF_LEGAL_DOCS_ERROR_KEYS.DOCUMENT_NUMBER_REQUIRED;
  }

  // 3. Validate issuance date
  if (!issuanceDate || typeof issuanceDate !== 'string' || !issuanceDate.trim()) {
    errors.issuanceDate = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_REQUIRED;
  } else {
    const timestamp = Date.parse(issuanceDate);
    if (isNaN(timestamp)) {
      errors.issuanceDate = STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_INVALID;
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Resolves an error key to a translated string for the specified language.
 *
 * @param {string} errorKey
 * @param {string} [lang='vi']
 * @returns {string}
 */
export function getStaffLegalDocumentErrorMessage(errorKey, lang = 'vi') {
  const dictionary = staffLegalDocumentsI18n[lang] || staffLegalDocumentsI18n.vi;
  return dictionary[errorKey] || errorKey;
}

/**
 * Transforms an object of error keys into translated messages.
 *
 * @param {Object.<string, string>} errors
 * @param {string} [lang='vi']
 * @returns {Object.<string, string>}
 */
export function formatStaffLegalDocumentErrors(errors = {}, lang = 'vi') {
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = getStaffLegalDocumentErrorMessage(key, lang);
  }
  return formatted;
}
