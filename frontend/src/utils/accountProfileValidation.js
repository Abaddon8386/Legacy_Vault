/**
 * Account Profile Validation & Role Mapping — EX-01
 * Based on active session and GET /auth/me contract.
 */

export const APP_ROLES = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];

export const ROLE_LABELS = {
  VAULT_OWNER: {
    vi: 'Chủ sở hữu kho',
    en: 'Vault Owner',
  },
  STAFF_EXECUTOR: {
    vi: 'Nhân viên thực thi',
    en: 'Staff Executor',
  },
  LEGAL_VERIFIER: {
    vi: 'Chuyên viên pháp lý',
    en: 'Legal Verifier',
  },
  ADMIN: {
    vi: 'Quản trị viên',
    en: 'Administrator',
  },
  BENEFICIARY: {
    vi: 'Người thụ hưởng',
    en: 'Beneficiary',
  },
};

/**
 * Checks whether current user session is authorized to access account profile.
 *
 * @param {Object|null|undefined} session
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function canAccessAccountProfile(session, now = Date.now()) {
  if (!session || typeof session.accessToken !== 'string' || !session.accessToken.trim()) {
    return false;
  }

  if (typeof session.expiresAt !== 'number' || now >= session.expiresAt) {
    return false;
  }

  const roles = session.user?.roles;
  if (!Array.isArray(roles) || roles.length === 0) {
    return false;
  }

  return roles.some((role) => APP_ROLES.includes(role));
}

/**
 * Formats a technical role string to localized display label.
 *
 * @param {string} role
 * @param {string} [lang='vi']
 * @returns {string}
 */
export function formatRoleName(role, lang = 'vi') {
  if (!role || typeof role !== 'string') {
    return lang === 'en' ? 'Unspecified' : 'Chưa xác định';
  }

  const normalized = role.replace(/^ROLE_/, '');
  const config = ROLE_LABELS[normalized];
  if (config) {
    return lang === 'en' ? config.en : config.vi;
  }

  return normalized;
}

/**
 * Validates profile data conformant to readUser contract.
 *
 * @param {any} user
 * @returns {boolean}
 */
export function isValidUserProfile(user) {
  if (!user || typeof user !== 'object') {
    return false;
  }

  const isFullNameValid = typeof user.fullName === 'string' && user.fullName.trim().length > 0;
  const isEmailValid = typeof user.email === 'string' && user.email.includes('@');
  const isRolesValid = Array.isArray(user.roles) && user.roles.length > 0;

  return Boolean(isFullNameValid && isEmailValid && isRolesValid);
}
