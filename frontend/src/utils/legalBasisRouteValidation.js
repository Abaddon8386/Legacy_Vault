/**
 * Legal Basis Route Selection Validation & Guard Utility — PS-30 / ST-16 / LV-BASIS-001
 * Architecture notes:
 * - Client guard strictly verifies active session and LEGAL_VERIFIER role.
 * - Client guard does NOT substitute for backend authorization.
 * - Form validation requires a route (NOTARIAL, COURT, ON_HOLD) and a non-empty rationale after trim.
 * - State preserves language-neutral error keys for instant dynamic VI <-> EN rendering.
 */

/**
 * Dùng bởi App.jsx và pages/legal/LegalBasisRouteSelectionPage.jsx.
 */
import { legalBasisRouteI18n } from '../pages/legal/legalBasisRouteI18n.js';

/**
 * Các tuyến căn cứ pháp lý có thể chọn: NOTARIAL (công chứng), COURT (tòa án), ON_HOLD (tạm giữ).
 */
export const LEGAL_BASIS_ROUTES = ['NOTARIAL', 'COURT', 'ON_HOLD'];

/**
 * Các khóa lỗi (i18n) của form chọn tuyến căn cứ pháp lý.
 */
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
 *
 * Chỉ session còn hạn có vai trò LEGAL_VERIFIER mới được vào màn hình chọn tuyến (chỉ là chốt giao diện; backend vẫn kiểm tra quyền).
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
 *
 * Kiểm tra form: route phải thuộc LEGAL_BASIS_ROUTES và lý do (reason) không rỗng sau trim. Trả {isValid, errors} với errors là khóa lỗi trung lập ngôn ngữ.
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
 *
 * Đổi khóa lỗi thành thông điệp theo ngôn ngữ (legalBasisRouteI18n).
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
 *
 * Đổi cả map khóa lỗi {trường: khóa} thành map thông điệp đã dịch.
 */
export function formatBasisRouteErrors(errors = {}, lang = 'vi') {
  const formatted = {};
  for (const [field, key] of Object.entries(errors)) {
    formatted[field] = getBasisRouteErrorMessage(key, lang);
  }
  return formatted;
}
