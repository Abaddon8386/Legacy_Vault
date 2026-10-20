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

export const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Checks whether an email string satisfies standard email formatting.
 *
 * @param {string} email
 * @returns {boolean}
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

/**
 * Determines whether the user session allows editing email.
 * - Vault Owner (without Staff/Legal roles) is permitted to edit email.
 * - Staff Executor and Legal Verifier must keep email read-only for audit compliance.
 * - Multi-role conflict: If an account holds both VAULT_OWNER and STAFF_EXECUTOR/LEGAL_VERIFIER,
 *   audit trail integrity takes precedence, locking the email.
 *
 * @param {Object|null|undefined} session
 * @returns {{ canEdit: boolean, reason: string, hasConflict: boolean }}
 */
export function canEditProfileEmail(session) {
  const roles = session?.user?.roles;
  if (!Array.isArray(roles) || roles.length === 0) {
    return { canEdit: false, reason: 'NO_ROLES', hasConflict: false };
  }

  const normalizedRoles = roles.map((r) => (typeof r === 'string' ? r.replace(/^ROLE_/, '') : ''));
  const isOwner = normalizedRoles.includes('VAULT_OWNER');
  const isStaffOrLegal = normalizedRoles.includes('STAFF_EXECUTOR') || normalizedRoles.includes('LEGAL_VERIFIER');

  if (isOwner && isStaffOrLegal) {
    return {
      canEdit: false,
      reason: 'MULTI_ROLE_CONFLICT',
      hasConflict: true,
    };
  }

  if (isStaffOrLegal) {
    return {
      canEdit: false,
      reason: 'STAFF_LEGAL_READONLY',
      hasConflict: false,
    };
  }

  if (isOwner) {
    return {
      canEdit: true,
      reason: 'OWNER_PERMITTED',
      hasConflict: false,
    };
  }

  return {
    canEdit: false,
    reason: 'DEFAULT_READONLY',
    hasConflict: false,
  };
}

/**
 * Validates the profile edit form.
 *
 * @param {{ fullName?: string, email?: string }} values
 * @param {{ canEditEmail?: boolean }} [options={}]
 * @returns {{ isValid: boolean, errors: Record<string, string> }}
 */
export function validateProfileEditForm(values, options = {}) {
  const errors = {};
  const canEditEmail = Boolean(options.canEditEmail);

  const fullName = typeof values?.fullName === 'string' ? values.fullName.trim() : '';
  if (!fullName) {
    errors.fullName = 'REQUIRED';
  }

  if (canEditEmail) {
    const email = typeof values?.email === 'string' ? values.email.trim() : '';
    if (!email) {
      errors.email = 'REQUIRED';
    } else if (!isValidEmail(email)) {
      errors.email = 'INVALID_FORMAT';
    }
  }

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
  };
}

/**
 * Determines if the current form state has unsaved changes compared to initial state.
 *
 * @param {string|{ fullName?: string, email?: string }|null|undefined} current
 * @param {string|{ fullName?: string, email?: string }|null|undefined} initial
 * @param {{ canEditEmail?: boolean }} [options={}]
 * @returns {boolean}
 */
export function isFormDirty(current, initial, options = {}) {
  const currentName = typeof current === 'object' && current !== null ? current.fullName : current;
  const initialName = typeof initial === 'object' && initial !== null ? initial.fullName : initial;
  const nameDirty = (typeof currentName === 'string' ? currentName.trim() : '') !==
                    (typeof initialName === 'string' ? initialName.trim() : '');

  if (options.canEditEmail) {
    const currentEmail = typeof current === 'object' && current !== null ? current.email : '';
    const initialEmail = typeof initial === 'object' && initial !== null ? initial.email : '';
    const emailDirty = (typeof currentEmail === 'string' ? currentEmail.trim() : '') !==
                       (typeof initialEmail === 'string' ? initialEmail.trim() : '');
    return nameDirty || emailDirty;
  }

  return nameDirty;
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
