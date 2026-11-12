/**
 * Account Profile Validation & Role Mapping — EX-01
 * Based on active session and GET /auth/me contract.
 */

/**
 * Logic kiểm tra và ánh xạ vai trò cho trang hồ sơ tài khoản (EX-01), dựa trên session đang hoạt động và hợp đồng GET /api/v1/auth/me.
 * Được dùng bởi App.jsx, components/layout/AppShell.jsx và pages/account/AccountProfilePage.jsx.
 *
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
 * Checks whether current user session is authorized to access account profile.
 *
 * @param {Object|null|undefined} session
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 *
 * Dùng bởi App.jsx: chỉ cho vào trang hồ sơ khi session có accessToken, chưa hết hạn và có vai trò hợp lệ.
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
 *
 * Dùng bởi AppShell/AccountProfilePage để hiển thị vai trò dễ đọc theo ngôn ngữ.
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
 *
 * Kiểm tra dữ liệu người dùng từ GET /api/v1/auth/me: có fullName, email chứa @ và ít nhất một vai trò.
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

/**
 * Resolves the active profile user, ensuring refreshed data is strictly bounded
 * to the currently authenticated session and user ID.
 *
 * @param {{ userId: string, token: string, user: Object }|null} refreshedData
 * @param {Object|null|undefined} session
 * @returns {Object|null}
 *
 * Chọn người dùng để hiển thị: dùng dữ liệu vừa làm mới nếu khớp đúng token và userId của session hiện tại, ngược lại dùng session.user.
 */
export function resolveActiveProfileUser(refreshedData, session) {
  const activeToken = session?.accessToken || null;
  const activeUserId = session?.user?.id || null;

  if (
    refreshedData &&
    activeToken &&
    refreshedData.token === activeToken &&
    refreshedData.userId === activeUserId &&
    refreshedData.user
  ) {
    return refreshedData.user;
  }

  return session?.user || null;
}

/**
 * Validates if an async GET /auth/me response can be applied safely to the current session.
 * Guards against:
 * 1. User logout while request was in-flight.
 * 2. Session change/switch while request was in-flight.
 * 3. Identity mismatch (received user id != authenticated user id).
 *
 * @param {Object|null|undefined} validatedUser
 * @param {Object|null|undefined} activeSession
 * @param {string} requestedToken
 * @param {string} requestedUserId
 * @returns {boolean}
 *
 * Chặn áp dụng kết quả GET /api/v1/auth/me trễ (đăng xuất, đổi phiên hoặc sai danh tính) vào phiên hiện tại.
 */
export function canApplyProfileRefresh(validatedUser, activeSession, requestedToken, requestedUserId) {
  if (!validatedUser || typeof validatedUser !== 'object') {
    return false;
  }

  if (!activeSession || typeof activeSession !== 'object') {
    return false;
  }

  if (activeSession.accessToken !== requestedToken) {
    return false;
  }

  if (activeSession.user?.id !== requestedUserId) {
    return false;
  }

  if (validatedUser.id !== requestedUserId) {
    return false;
  }

  return true;
}

/**
 * Resolves whether AppShell should treat the current viewer as authenticated with an active session.
 * Does NOT infer "unauthenticated" simply because the `user` prop was omitted.
 *
 * Priority:
 * 1. Explicit `isAuthenticated` boolean prop if provided.
 * 2. Active session object (`session?.accessToken` and not expired if `session.expiresAt` is present).
 * 3. Resolved user object (`user` or `session?.user`) having an ID other than 'preview'.
 * 4. Presence of an active `onLogout` function while not in an explicit non-authenticated state or preview.
 *
 * @param {Object} [params]
 * @param {boolean} [params.isAuthenticated]
 * @param {Object|null|undefined} [params.session]
 * @param {Object|null|undefined} [params.user]
 * @param {Function|null|undefined} [params.onLogout]
 * @param {number} [now=Date.now()]
 * @returns {boolean}
 *
 * Dùng bởi AppShell để biết người xem đã đăng nhập chưa theo thứ tự ưu tiên: prop isAuthenticated, session còn hạn, người dùng thật (không phải preview/anonymous), rồi có onLogout.
 */
export function resolveAppShellAuthState({
  isAuthenticated,
  session,
  user,
  onLogout,
} = {}, now = Date.now()) {
  if (typeof isAuthenticated === 'boolean') {
    return isAuthenticated;
  }

  if (session && typeof session === 'object') {
    if (typeof session.accessToken === 'string' && session.accessToken.trim()) {
      if (typeof session.expiresAt === 'number') {
        return now < session.expiresAt;
      }
      return true;
    }
  }

  const resolvedUser = user || session?.user || null;
  if (resolvedUser && typeof resolvedUser === 'object') {
    if (resolvedUser.id === 'preview' || resolvedUser.isAnonymous) {
      return false;
    }
    if (
      resolvedUser.id ||
      resolvedUser.email ||
      (typeof resolvedUser.fullName === 'string' && resolvedUser.fullName.trim())
    ) {
      return true;
    }
  }

  // If user prop was omitted, but onLogout is provided as a function
  // and candidate user is not preview, do not infer unauthenticated.
  if (typeof onLogout === 'function') {
    if (resolvedUser?.id === 'preview') {
      return false;
    }
    return true;
  }

  return false;
}

/**
 * Resolves the primary role label from user and session, localized to VI/EN.
 *
 * @param {Object|null|undefined} user
 * @param {Object|null|undefined} session
 * @param {string} [fallbackRole='OWNER']
 * @param {string} [lang='vi']
 * @returns {string}
 *
 * Dùng bởi AppShell: lấy nhãn vai trò chính (ưu tiên vai trò hợp lệ đầu tiên của session.user, nếu không có thì theo fallbackRole) theo ngôn ngữ vi/en.
 */
export function resolveUserRoleLabel(user, session, fallbackRole = 'OWNER', lang = 'vi') {
  const candidateUser = session?.user || user || null;
  const roles = candidateUser?.roles;
  let targetRole;

  if (Array.isArray(roles) && roles.length > 0) {
    targetRole = roles.find((r) => APP_ROLES.includes(String(r).replace(/^ROLE_/, ''))) || roles[0];
  } else if (typeof candidateUser?.role === 'string' && candidateUser.role.trim()) {
    targetRole = candidateUser.role.trim();
  } else {
    const normalizedProp = String(fallbackRole || '').toUpperCase();
    if (normalizedProp === 'STAFF' || normalizedProp === 'STAFF_EXECUTOR') {
      targetRole = 'STAFF_EXECUTOR';
    } else if (normalizedProp === 'LEGAL' || normalizedProp === 'LEGAL_VERIFIER') {
      targetRole = 'LEGAL_VERIFIER';
    } else {
      targetRole = 'VAULT_OWNER';
    }
  }

  return formatRoleName(targetRole, lang);
}

/**
 * Resolves the display name for the account widget.
 * Strictly forbids using email, tokens, or technical IDs as a fallback.
 *
 * @param {Object|null|undefined} user
 * @param {Object|null|undefined} session
 * @param {boolean} hasSession
 * @param {string} [fallbackRoleLabel='']
 * @param {string} [lang='vi']
 * @returns {string}
 *
 * Dùng bởi widget tài khoản của AppShell: trả họ tên; nếu thiếu thì nhãn vai trò, không bao giờ dùng email/token/id.
 */
export function resolveAccountDisplayName(user, session, hasSession, fallbackRoleLabel = '', lang = 'vi') {
  if (!hasSession) {
    return lang === 'en' ? 'Account' : 'Tài khoản';
  }

  const candidateUser = session?.user || user || null;
  const fullName = candidateUser?.fullName;

  if (typeof fullName === 'string' && fullName.trim().length > 0) {
    return fullName.trim();
  }

  // Fallback strictly to role display label, NEVER to email, token, or id!
  if (fallbackRoleLabel && typeof fallbackRoleLabel === 'string' && fallbackRoleLabel.trim()) {
    return fallbackRoleLabel.trim();
  }

  return lang === 'en' ? 'Account' : 'Tài khoản';
}

/**
 * Extracts uppercase initials from user's full name.
 * E.g. "Nguyen Van A" -> "NA", "Le Gia Huy" -> "LH", "Vance" -> "VA".
 *
 * @param {string} name
 * @returns {string}
 *
 * Dùng cho avatar: lấy chữ cái đầu của họ tên (một từ thì lấy 2 ký tự đầu; nhiều từ thì chữ đầu của từ đầu và từ cuối).
 */
export function resolveAccountInitials(name) {
  if (!name || typeof name !== 'string') {
    return '';
  }
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '';
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}
