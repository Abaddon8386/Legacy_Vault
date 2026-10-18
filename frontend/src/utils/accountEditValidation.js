/**
 * Account Profile Editing Validation & State Logic — EX-02
 * Handles validation, role formatting, dirty-state tracking, and session isolation.
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
 * Checks whether current user session is authorized to access account edit.
 *
 * @param {Object|null|undefined} session
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 */
export function canAccessAccountEdit(session, now = Date.now()) {
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
 * Validates the profile edit form.
 *
 * @param {{ fullName?: string }} values
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateProfileEditForm(values) {
  const errors = {};

  const fullName = typeof values?.fullName === 'string' ? values.fullName.trim() : '';
  if (!fullName) {
    errors.fullName = 'REQUIRED';
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Determines if the current form state has unsaved changes compared to initial state.
 *
 * @param {string|null|undefined} currentFullName
 * @param {string|null|undefined} initialFullName
 * @returns {boolean}
 */
export function isFormDirty(currentFullName, initialFullName) {
  const current = typeof currentFullName === 'string' ? currentFullName.trim() : '';
  const initial = typeof initialFullName === 'string' ? initialFullName.trim() : '';
  return current !== initial;
}

/**
 * Resolves initial profile data from an active session, ensuring strict contract boundaries.
 *
 * @param {Object|null|undefined} session
 * @returns {{ id: string, fullName: string, email: string, roles: string[] }|null}
 */
export function resolveInitialProfileData(session) {
  const user = session?.user;
  if (!user || typeof user !== 'object') {
    return null;
  }

  if (typeof user.fullName !== 'string' || typeof user.email !== 'string' || !Array.isArray(user.roles)) {
    return null;
  }

  return {
    id: typeof user.id === 'string' ? user.id : '',
    fullName: user.fullName,
    email: user.email,
    roles: [...user.roles],
  };
}

/**
 * Determines whether incoming session data should overwrite current form values.
 * - Always overwrites if the user account switched (prevUserId !== newUserId).
 * - Never overwrites if the form has unsaved modifications (isDirty === true) for the same user.
 * - Safely updates if the form is clean (isDirty === false) for the same user.
 *
 * @param {boolean} isDirty
 * @param {string|null|undefined} prevUserId
 * @param {string|null|undefined} newUserId
 * @returns {boolean}
 */
export function shouldUpdateFormFromSession(isDirty, prevUserId, newUserId) {
  if (!newUserId) {
    return true;
  }

  if (prevUserId !== newUserId) {
    return true;
  }

  return !isDirty;
}
