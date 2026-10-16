/**
 * Legal Dossier Review Validation & Client Role Guard — PS-32 / ST-20 / LV-BASIS-001, LV-HOLD-001
 * Architecture notes:
 * - Client guard strictly verifies active session and LEGAL_VERIFIER role.
 * - Client guard does NOT substitute for backend authorization.
 * - Form validation ensures a valid decision ('APPROVE', 'REJECT', 'HOLD', 'RE_REVIEW') is chosen.
 * - Stale review detection strictly matches dossier identifiers before comparing versions and hashes.
 * - State preserves language-neutral error keys for instant dynamic VI <-> EN rendering.
 */

import { legalDossierReviewI18n } from '../pages/legal/legalDossierReviewI18n.js';

export const LEGAL_REVIEW_DECISIONS = Object.freeze([
  'APPROVE',
  'REJECT',
  'HOLD',
  'RE_REVIEW',
]);

export const LEGAL_DOSSIER_REVIEW_ERROR_KEYS = Object.freeze({
  DECISION_REQUIRED: 'decisionRequired',
  DECISION_INVALID: 'decisionInvalid',
});

/**
 * Checks whether the current user session is authorized to access
 * the Legal Dossier Review screen.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessLegalDossierReview(session) {
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

  // Strictly require LEGAL_VERIFIER role. Never grant implicitly to ADMIN or others.
  return roles.includes('LEGAL_VERIFIER');
}

/**
 * Validates the dossier review decision form:
 * - decision must be one of 'APPROVE', 'REJECT', 'HOLD', 'RE_REVIEW'
 * - note is optional unless explicitly constrained by future contracts
 *
 * @param {Object} formValues
 * @param {string} [formValues.decision]
 * @param {string} [formValues.note]
 * @returns {{ isValid: boolean, errors: Object.<string, string> }}
 */
export function validateLegalDossierReviewForm(formValues = {}) {
  const errors = {};
  const { decision } = formValues;

  if (!decision || typeof decision !== 'string' || !decision.trim()) {
    errors.decision = LEGAL_DOSSIER_REVIEW_ERROR_KEYS.DECISION_REQUIRED;
  } else if (!LEGAL_REVIEW_DECISIONS.includes(decision.trim())) {
    errors.decision = LEGAL_DOSSIER_REVIEW_ERROR_KEYS.DECISION_INVALID;
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Validates whether a value is a legitimate dossier version.
 * Legitimate versions must be positive safe integers (>= 1).
 * Strings representing positive integers (e.g. "1", "2") are acceptable.
 * Empty strings, whitespace, booleans (false/true), Infinity, negative numbers,
 * non-integers, null, and undefined are strictly invalid.
 *
 * @param {*} value
 * @returns {boolean}
 */
export function isValidDossierVersion(value) {
  if (typeof value === 'number') {
    return Number.isSafeInteger(value) && value >= 1;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!/^[1-9]\d*$/.test(trimmed)) {
      return false;
    }
    const num = Number(trimmed);
    return Number.isSafeInteger(num) && num >= 1;
  }
  return false;
}

/**
 * Formats a dossier version for display in UI or review history:
 * - If valid, returns `v${version}` (e.g. `v1`, `v2`).
 * - If missing or invalid, returns "Chưa có thông tin" (vi) or "Not available" (en).
 * Never infers or defaults missing versions to 'v1'.
 *
 * @param {*} rawVersion
 * @param {string} [lang='vi']
 * @returns {string}
 */
export function formatDossierVersion(rawVersion, lang = 'vi') {
  if (isValidDossierVersion(rawVersion)) {
    const v = typeof rawVersion === 'number' ? rawVersion : Number(String(rawVersion).trim());
    return `v${v}`;
  }
  return lang === 'en' ? 'Not available' : 'Chưa có thông tin';
}

/**
 * Rigorously evaluates the freshness and applicability of a previous review record:
 * - 'MISMATCH': Record belongs to a different dossier; cannot be used for current dossier.
 * - 'INDETERMINATE': Missing required information or invalid version/hash on either side;
 *   cannot be assumed fresh or valid.
 * - 'STALE': Same dossier verified, but version or content hash differs (including when current version is lower).
 * - 'FRESH': Same dossier, both version and hash are present, strictly valid, and match on both sides.
 *
 * @param {Object|null|undefined} currentDossier
 * @param {Object|null|undefined} lastReviewedRecord
 * @returns {'STALE'|'FRESH'|'MISMATCH'|'INDETERMINATE'}
 */
export function checkDossierReviewStatus(currentDossier, lastReviewedRecord) {
  if (!currentDossier || !lastReviewedRecord) {
    return 'INDETERMINATE';
  }

  const curId = currentDossier.id;
  const revDossierId = lastReviewedRecord.dossierId;

  // 1. Missing required identifier on either side leaves relationship indeterminate
  if (!curId || !revDossierId) {
    return 'INDETERMINATE';
  }

  // 2. Cross-reference identifier to ensure same dossier; different dossier is MISMATCH
  if (String(curId).trim() !== String(revDossierId).trim()) {
    return 'MISMATCH';
  }

  // 3. Required metrics: both version and sha256 must be present and strictly valid on both sides.
  // Number(...) coercion is forbidden because "", " ", false, Infinity must NOT evaluate as valid.
  const hasCurVer = isValidDossierVersion(currentDossier.version);
  const hasRevVer = isValidDossierVersion(lastReviewedRecord.version);

  const hasCurHash =
    typeof currentDossier.sha256 === 'string' && currentDossier.sha256.trim() !== '';
  const hasRevHash =
    typeof lastReviewedRecord.sha256 === 'string' && lastReviewedRecord.sha256.trim() !== '';

  // Missing or invalid required metrics on either side => INDETERMINATE (never FRESH)
  if (!hasCurVer || !hasRevVer || !hasCurHash || !hasRevHash) {
    return 'INDETERMINATE';
  }

  const curVer = typeof currentDossier.version === 'number'
    ? currentDossier.version
    : Number(String(currentDossier.version).trim());
  const revVer = typeof lastReviewedRecord.version === 'number'
    ? lastReviewedRecord.version
    : Number(String(lastReviewedRecord.version).trim());
  const curHash = currentDossier.sha256.trim();
  const revHash = lastReviewedRecord.sha256.trim();

  // 4. Fresh ONLY when both version and hash strictly match
  if (curVer === revVer && curHash === revHash) {
    return 'FRESH';
  }

  // 5. Same dossier, but version or hash differs (including when current version is lower):
  // review is no longer effective => STALE
  return 'STALE';
}

/**
 * Checks whether a previous review record is definitively stale compared to the current dossier.
 * NOTE: Returning false does NOT imply that the review is FRESH or valid.
 * False simply indicates that the review is not explicitly STALE (e.g. INDETERMINATE, MISMATCH, or FRESH).
 * Always use checkDossierReviewStatus when status discernment is required.
 *
 * @param {Object|null|undefined} currentDossier
 * @param {Object|null|undefined} lastReviewedRecord
 * @returns {boolean}
 */
export function isDossierReviewStale(currentDossier, lastReviewedRecord) {
  return checkDossierReviewStatus(currentDossier, lastReviewedRecord) === 'STALE';
}

/**
 * Resolves an error key to a translated string for the specified language.
 *
 * @param {string} errorKey
 * @param {string} [lang='vi']
 * @returns {string}
 */
export function getLegalDossierReviewErrorMessage(errorKey, lang = 'vi') {
  const dictionary = legalDossierReviewI18n[lang] || legalDossierReviewI18n.vi;
  return dictionary[errorKey] || errorKey;
}

/**
 * Transforms an object of error keys into translated messages.
 *
 * @param {Object.<string, string>} errors
 * @param {string} [lang='vi']
 * @returns {Object.<string, string>}
 */
export function formatLegalDossierReviewErrors(errors = {}, lang = 'vi') {
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = getLegalDossierReviewErrorMessage(key, lang);
  }
  return formatted;
}
