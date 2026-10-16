/**
 * Legal Basis Route Selection Validation & Guard Utility — PS-30 / ST-16 / LV-BASIS-001
 * Architecture notes:
 * - Client guard strictly verifies active session and LEGAL_VERIFIER role.
 * - Client guard does NOT substitute for backend authorization.
 * - Form validation requires a route (NOTARIAL, COURT, ON_HOLD) and a non-empty rationale after trim.
 * - State preserves language-neutral error keys for instant dynamic VI <-> EN rendering.
 */

import { legalBasisRouteI18n } from '../pages/legal/legalBasisRouteI18n.js';

export const LEGAL_BASIS_ROUTES = ['NOTARIAL', 'COURT', 'ON_HOLD'];

export const BASIS_ROUTE_ERROR_KEYS = {
  ROUTE_REQUIRED: 'routeRequired',
  ROUTE_INVALID: 'routeInvalid',
  REASON_REQUIRED: 'reasonRequired',
};

/**
 * Checks whether the current user session is authorized to access
 * the Legal Basis Route Selection screen.
 *
 * @param {Object|null|undefined} session
 * @returns {boolean}
 */
export function canAccessLegalBasisRoute(session) {
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

  return roles.includes('LEGAL_VERIFIER');
}

/**
 * Validates the Basis Route Selection form inputs according to AC:
 * - Route must be selected from LEGAL_BASIS_ROUTES (NOTARIAL, COURT, ON_HOLD)
 * - Reason / rationale must be non-empty after trimming whitespace
 *
 * @param {Object} formValues
 * @param {string} formValues.route - Selected route code
 * @param {string} formValues.reason - Verifier adjudication rationale
 * @param {string} [formValues.docketReference] - Optional docket reference
 * @returns {{ isValid: boolean, errors: Object.<string, string> }}
 */
export function validateBasisRouteForm(formValues = {}) {
  const errors = {};
  const { route, reason } = formValues;

  // 1. Validate route choice
  if (!route || typeof route !== 'string' || !route.trim()) {
    errors.route = BASIS_ROUTE_ERROR_KEYS.ROUTE_REQUIRED;
  } else if (!LEGAL_BASIS_ROUTES.includes(route)) {
    errors.route = BASIS_ROUTE_ERROR_KEYS.ROUTE_INVALID;
  }

  // 2. Validate rationale (must be non-empty after trim)
  if (!reason || typeof reason !== 'string' || !reason.trim()) {
    errors.reason = BASIS_ROUTE_ERROR_KEYS.REASON_REQUIRED;
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
export function getBasisRouteErrorMessage(errorKey, lang = 'vi') {
  const dictionary = legalBasisRouteI18n[lang] || legalBasisRouteI18n.vi;
  return dictionary[errorKey] || errorKey;
}

/**
 * Transforms an object of error keys into translated messages.
 *
 * @param {Object.<string, string>} errors
 * @param {string} [lang='vi']
 * @returns {Object.<string, string>}
 */
export function formatBasisRouteErrors(errors = {}, lang = 'vi') {
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = getBasisRouteErrorMessage(key, lang);
  }
  return formatted;
}
