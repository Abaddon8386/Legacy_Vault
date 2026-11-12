/**
 * Account Profile Editing Validation & State Logic — EX-02
 * Handles validation, role formatting, dirty-state tracking, and session isolation.
 */

/**
 * Logic kiểm tra hợp lệ và trạng thái cho trang chỉnh sửa hồ sơ tài khoản (thuần phía client, không gọi API).
 * Được dùng bởi App.jsx, pages/account/AccountEditPage.jsx và services/profileService.js
 * (việc lưu thật sự do profileService gọi PATCH/PUT hồ sơ của backend; backend vẫn là nơi quyết định quyền).
 */
import { EMAIL_REGEX } from './registrationValidation.js';
export { EMAIL_REGEX };
/**
 * Danh sách vai trò hợp lệ của ứng dụng (dạng không có tiền tố ROLE_).
 */
export const APP_ROLES = ['VAULT_OWNER', 'STAFF_EXECUTOR', 'LEGAL_VERIFIER', 'ADMIN', 'BENEFICIARY'];

/**
 * Nhãn hiển thị song ngữ (vi/en) của từng vai trò.
 */
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
 *
 * Dùng bởi App.jsx để quyết định có cho vào màn hình chỉnh sửa hồ sơ hay không: cần accessToken, chưa hết hạn (expiresAt) và có ít nhất một vai trò hợp lệ.
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
 *
 * Dùng khi hiển thị vai trò trong trang hồ sơ: bỏ tiền tố ROLE_ rồi tra ROLE_LABELS; không có thì trả nguyên tên hoặc "Chưa xác định".
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
 * Checks whether an email string satisfies standard email formatting.
 *
 * @param {string} email
 * @returns {boolean}
 *
 * Kiểm tra email sau khi trim: không rỗng, tối đa 254 ký tự và khớp EMAIL_REGEX (định nghĩa trong registrationValidation.js).
 */
export function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  const trimmed = email.trim();
  return trimmed.length > 0 && trimmed.length <= 254 && EMAIL_REGEX.test(trimmed);
}

/**
 * Determines whether the user session allows editing email.
 * - Vault Owner (without Staff/Legal roles) is permitted to edit email.
 * - Staff/Legal email stays read-only under the agreed frontend requirement.
 * - A mixed Owner + Staff/Legal account retains the existing read-only policy.
 * This is presentation policy; backend authorization remains server-owned.
 *
 * @param {Object|null|undefined} session
 * @returns {{ canEdit: boolean, reason: string, hasConflict: boolean }}
 *
 * Dùng bởi AccountEditPage để bật/tắt ô email. Trả về lý do (NO_ROLES, MULTI_ROLE_CONFLICT, STAFF_LEGAL_READONLY, OWNER_PERMITTED, DEFAULT_READONLY).
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
 *
 * Dùng bởi AccountEditPage trước khi lưu: fullName bắt buộc (tối đa 150, không xuống dòng), phoneNumber tùy chọn (+ và 8-15 chữ số), email chỉ kiểm tra khi canEditEmail. Trả về mã lỗi REQUIRED hoặc INVALID_FORMAT theo từng trường.
 */
export function validateProfileEditForm(values, options = {}) {
  const errors = {};
  const canEditEmail = Boolean(options.canEditEmail);

  const fullName = typeof values?.fullName === 'string' ? values.fullName.trim() : '';
  if (!fullName) {
    errors.fullName = 'REQUIRED';
  } else if (fullName.length > 150 || /[\r\n]/.test(fullName)) {
    errors.fullName = 'INVALID_FORMAT';
  }
  if (values?.phoneNumber !== undefined && (typeof values.phoneNumber !== 'string' ||
      (values.phoneNumber.trim() && !/^\+?[0-9]{8,15}$/.test(values.phoneNumber.trim())))) errors.phoneNumber = 'INVALID_FORMAT';

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
 *
 * Dùng bởi AccountEditPage để biết người dùng đã sửa dữ liệu chưa lưu (cảnh báo khi thoát, bật nút Lưu). Tên so sánh sau trim; email so sánh không phân biệt hoa thường khi được phép sửa.
 */
export function isFormDirty(current, initial, options = {}) {
  const currentName = typeof current === 'object' && current !== null ? current.fullName : current;
  const initialName = typeof initial === 'object' && initial !== null ? initial.fullName : initial;
  const nameDirty = (typeof currentName === 'string' ? currentName.trim() : '') !==
                    (typeof initialName === 'string' ? initialName.trim() : '');

  if (options.canEditEmail) {
    const currentEmail = typeof current === 'object' && current !== null ? current.email : '';
    const initialEmail = typeof initial === 'object' && initial !== null ? initial.email : '';
    const emailDirty = (typeof currentEmail === 'string' ? currentEmail.trim().toLowerCase() : '') !==
                       (typeof initialEmail === 'string' ? initialEmail.trim().toLowerCase() : '');
    return nameDirty || emailDirty;
  }

  return nameDirty;
}

/**
 * Resolves initial profile data from an active session, ensuring strict contract boundaries.
 *
 * @param {Object|null|undefined} session
 * @returns {{ id: string, fullName: string, email: string, roles: string[] }|null}
 *
 * Dùng bởi AccountEditPage/profileService để lấy dữ liệu khởi tạo form từ session.user (id, fullName, email, roles và phoneNumber nếu có); trả null nếu session không đủ trường.
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
    ...(Object.hasOwn(user, 'phoneNumber') ? { phoneNumber: user.phoneNumber } : {}),
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
 *
 * Dùng bởi AccountEditPage khi session được làm mới để quyết định có ghi đè form hay không.
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
