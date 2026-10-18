import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessAccountProfile,
  formatRoleName,
  isValidUserProfile,
  resolveActiveProfileUser,
  canApplyProfileRefresh,
  resolveAppShellAuthState,
  resolveUserRoleLabel,
  resolveAccountDisplayName,
  resolveAccountInitials,
  APP_ROLES,
} from './accountProfileValidation.js';
import { accountProfileI18n } from '../pages/account/accountProfileI18n.js';

test('EX-01 Session Guard (canAccessAccountProfile)', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessAccountProfile(null), false);
    assert.equal(canAccessAccountProfile(undefined), false);
    assert.equal(
      canAccessAccountProfile({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
  });

  await t.test('rejects access when accessToken is empty or missing', () => {
    assert.equal(
      canAccessAccountProfile({
        accessToken: '',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
  });

  await t.test('rejects access when user has no roles or roles array is empty', () => {
    assert.equal(
      canAccessAccountProfile({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: [] },
      }),
      false
    );
    assert.equal(
      canAccessAccountProfile({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: {},
      }),
      false
    );
  });

  await t.test('grants access for any authenticated role in system', () => {
    for (const role of APP_ROLES) {
      assert.equal(
        canAccessAccountProfile({
          accessToken: 'token-123',
          expiresAt: Date.now() + 60000,
          user: { roles: [role] },
        }),
        true,
        `Expected access granted for role ${role}`
      );
    }
  });

  await t.test('grants access for multi-role users', () => {
    assert.equal(
      canAccessAccountProfile({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR', 'LEGAL_VERIFIER'] },
      }),
      true
    );
  });
});

test('EX-01 Localized Role Formatter (formatRoleName)', async (t) => {
  await t.test('formats Vietnamese role labels correctly', () => {
    assert.equal(formatRoleName('VAULT_OWNER', 'vi'), 'Chủ sở hữu kho');
    assert.equal(formatRoleName('STAFF_EXECUTOR', 'vi'), 'Nhân viên thực thi');
    assert.equal(formatRoleName('LEGAL_VERIFIER', 'vi'), 'Chuyên viên pháp lý');
    assert.equal(formatRoleName('ADMIN', 'vi'), 'Quản trị viên');
    assert.equal(formatRoleName('BENEFICIARY', 'vi'), 'Người thụ hưởng');
  });

  await t.test('formats English role labels correctly', () => {
    assert.equal(formatRoleName('VAULT_OWNER', 'en'), 'Vault Owner');
    assert.equal(formatRoleName('STAFF_EXECUTOR', 'en'), 'Staff Executor');
    assert.equal(formatRoleName('LEGAL_VERIFIER', 'en'), 'Legal Verifier');
    assert.equal(formatRoleName('ADMIN', 'en'), 'Administrator');
    assert.equal(formatRoleName('BENEFICIARY', 'en'), 'Beneficiary');
  });

  await t.test('normalizes ROLE_ prefix if present', () => {
    assert.equal(formatRoleName('ROLE_VAULT_OWNER', 'vi'), 'Chủ sở hữu kho');
    assert.equal(formatRoleName('ROLE_STAFF_EXECUTOR', 'en'), 'Staff Executor');
  });

  await t.test('handles null, undefined or unknown role gracefully', () => {
    assert.equal(formatRoleName(null, 'vi'), 'Chưa xác định');
    assert.equal(formatRoleName(undefined, 'en'), 'Unspecified');
    assert.equal(formatRoleName('UNKNOWN_ROLE', 'vi'), 'UNKNOWN_ROLE');
  });
});

test('EX-01 User Profile Validation (isValidUserProfile)', async (t) => {
  await t.test('accepts valid user conforming to contract', () => {
    assert.equal(
      isValidUserProfile({
        fullName: 'Le Gia Huy',
        email: 'huy.legia@legacyvault.test',
        roles: ['STAFF_EXECUTOR'],
      }),
      true
    );
  });

  await t.test('rejects missing or empty fullName', () => {
    assert.equal(
      isValidUserProfile({
        fullName: '',
        email: 'test@example.com',
        roles: ['VAULT_OWNER'],
      }),
      false
    );
    assert.equal(
      isValidUserProfile({
        fullName: '   ',
        email: 'test@example.com',
        roles: ['VAULT_OWNER'],
      }),
      false
    );
  });

  await t.test('rejects missing or invalid email', () => {
    assert.equal(
      isValidUserProfile({
        fullName: 'Test User',
        email: 'invalid-email',
        roles: ['VAULT_OWNER'],
      }),
      false
    );
  });

  await t.test('rejects empty or non-array roles', () => {
    assert.equal(
      isValidUserProfile({
        fullName: 'Test User',
        email: 'test@example.com',
        roles: [],
      }),
      false
    );
    assert.equal(
      isValidUserProfile({
        fullName: 'Test User',
        email: 'test@example.com',
        roles: null,
      }),
      false
    );
  });
});

test('EX-01 Bilingual Dictionary Completeness (VI & EN)', () => {
  const vi = accountProfileI18n.vi;
  const en = accountProfileI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  // Validate that all VI keys exist in EN
  for (const key of Object.keys(vi)) {
    assert.ok(en[key], `Missing EN translation for key: ${key}`);
  }

  assert.equal(vi.noInformation, 'Chưa có thông tin');
  assert.equal(en.noInformation, 'No information provided');
  assert.equal(vi.unavailableNotice, 'Chức năng hiện chưa khả dụng');
  assert.equal(en.unavailableNotice, 'This function is currently unavailable.');
});

test('EX-01 CSS Scoping Verification - No Leakage', () => {
  const cssPath = resolve('src/pages/account/AccountProfilePage.css');
  const css = readFileSync(cssPath, 'utf8');

  // Strip comments
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const lines = stripped.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line || line.startsWith('@media') || line.startsWith('}')) continue;

    if (line.includes('{')) {
      const selectorsPart = line.split('{')[0].trim();
      const selectors = selectorsPart.split(',');
      for (const sel of selectors) {
        const s = sel.trim();
        if (!s || s.startsWith('@') || s.startsWith('from') || s.startsWith('to')) continue;
        assert.ok(
          s.startsWith('.lv-account-profile-view'),
          `Selector "${s}" in AccountProfilePage.css must start with .lv-account-profile-view`
        );
      }
    }
  }
});

test('EX-01 Session Isolation & Anti-Leakage (resolveActiveProfileUser)', async (t) => {
  const userA = {
    id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    fullName: 'Nguyen Van A',
    email: 'a@legacyvault.test',
    roles: ['VAULT_OWNER'],
  };
  const userB = {
    id: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
    fullName: 'Tran Thi B',
    email: 'b@legacyvault.test',
    roles: ['STAFF_EXECUTOR'],
  };
  const refreshedUserA = {
    ...userA,
    fullName: 'Nguyen Van A (Updated)',
  };

  await t.test('returns null when session is null (even if refreshed data exists from earlier)', () => {
    const refreshedData = {
      userId: userA.id,
      token: 'token-A',
      user: refreshedUserA,
    };
    assert.equal(resolveActiveProfileUser(refreshedData, null), null);
  });

  await t.test('returns session user directly when no refreshed data exists', () => {
    const sessionA = {
      accessToken: 'token-A',
      user: userA,
    };
    assert.deepEqual(resolveActiveProfileUser(null, sessionA), userA);
  });

  await t.test('returns refreshed user when token and userId match active session', () => {
    const sessionA = {
      accessToken: 'token-A',
      user: userA,
    };
    const refreshedData = {
      userId: userA.id,
      token: 'token-A',
      user: refreshedUserA,
    };
    assert.deepEqual(resolveActiveProfileUser(refreshedData, sessionA), refreshedUserA);
  });

  await t.test('NEVER leaks user A refreshed data to user B when session switches', () => {
    const sessionB = {
      accessToken: 'token-B',
      user: userB,
    };
    // Refreshed data from previous session of User A
    const staleDataA = {
      userId: userA.id,
      token: 'token-A',
      user: refreshedUserA,
    };
    // Must return User B, NOT User A's stale refreshed data!
    assert.deepEqual(resolveActiveProfileUser(staleDataA, sessionB), userB);
  });

  await t.test('ignores refreshed data if token changed even with same user ID (e.g. re-login)', () => {
    const sessionANewToken = {
      accessToken: 'token-A-new',
      user: userA,
    };
    const oldRefreshedData = {
      userId: userA.id,
      token: 'token-A-old',
      user: refreshedUserA,
    };
    assert.deepEqual(resolveActiveProfileUser(oldRefreshedData, sessionANewToken), userA);
  });
});

test('EX-01 Race Condition & Identity Verification (canApplyProfileRefresh)', async (t) => {
  const userA = {
    id: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d',
    fullName: 'Nguyen Van A',
    email: 'a@legacyvault.test',
    roles: ['VAULT_OWNER'],
  };
  const activeSessionA = {
    accessToken: 'token-A',
    user: userA,
  };

  await t.test('allows refresh when session, token and user ID all match', () => {
    assert.equal(
      canApplyProfileRefresh(userA, activeSessionA, 'token-A', userA.id),
      true
    );
  });

  await t.test('rejects refresh when user logged out while request was in-flight (activeSession null)', () => {
    assert.equal(
      canApplyProfileRefresh(userA, null, 'token-A', userA.id),
      false
    );
  });

  await t.test('rejects refresh when user token changed during request', () => {
    const switchedSession = {
      accessToken: 'token-different',
      user: userA,
    };
    assert.equal(
      canApplyProfileRefresh(userA, switchedSession, 'token-A', userA.id),
      false
    );
  });

  await t.test('rejects refresh when user account switched during request', () => {
    const switchedSession = {
      accessToken: 'token-B',
      user: {
        id: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e',
        fullName: 'User B',
      },
    };
    assert.equal(
      canApplyProfileRefresh(userA, switchedSession, 'token-A', userA.id),
      false
    );
  });

  await t.test('rejects refresh when received user ID does not match requested user ID', () => {
    const mismatchedUser = {
      ...userA,
      id: '99999999-9999-9999-9999-999999999999',
    };
    assert.equal(
      canApplyProfileRefresh(mismatchedUser, activeSessionA, 'token-A', userA.id),
      false
    );
  });
});

test('EX-01 AppShell Auth State Resolution (resolveAppShellAuthState)', async (t) => {
  const activeSession = {
    accessToken: 'test-token-valid',
    expiresAt: Date.now() + 60000,
    user: { id: 'u1', fullName: 'Nguyen Van A', roles: ['VAULT_OWNER'] },
  };

  await t.test('explicit boolean isAuthenticated takes precedence', () => {
    assert.equal(resolveAppShellAuthState({ isAuthenticated: true }), true);
    assert.equal(
      resolveAppShellAuthState({ isAuthenticated: false, session: activeSession }),
      false
    );
  });

  await t.test('resolves true from active session with valid accessToken and expiresAt', () => {
    assert.equal(resolveAppShellAuthState({ session: activeSession }), true);
  });

  await t.test('resolves false if session is expired', () => {
    const expiredSession = {
      accessToken: 'test-token-expired',
      expiresAt: Date.now() - 5000,
      user: { id: 'u1', fullName: 'Nguyen Van A' },
    };
    assert.equal(resolveAppShellAuthState({ session: expiredSession }), false);
  });

  await t.test('does NOT infer unauthenticated when user prop is omitted if session or onLogout is present', () => {
    // User prop omitted but valid session present
    assert.equal(
      resolveAppShellAuthState({
        session: activeSession,
        user: undefined,
        onLogout: () => {},
      }),
      true
    );
    // User prop null but onLogout function present
    assert.equal(
      resolveAppShellAuthState({
        user: null,
        onLogout: () => {},
      }),
      true
    );
  });

  await t.test('resolves false for DEV preview without active session and without onLogout', () => {
    assert.equal(
      resolveAppShellAuthState({
        isAuthenticated: false,
        session: null,
        user: null,
        onLogout: null,
      }),
      false
    );
    assert.equal(
      resolveAppShellAuthState({
        session: null,
        user: null,
        onLogout: null,
      }),
      false
    );
  });

  await t.test('resolves false when candidate user is preview dummy', () => {
    assert.equal(
      resolveAppShellAuthState({
        user: { id: 'preview' },
      }),
      false
    );
    assert.equal(
      resolveAppShellAuthState({
        user: { id: 'preview' },
        onLogout: () => {},
      }),
      false
    );
  });
});

test('EX-01 AppShell Dashboard & Navigation Auth State Regression Verification', () => {
  const appJsx = readFileSync(resolve('src/App.jsx'), 'utf8');
  const appShellJsx = readFileSync(resolve('src/components/layout/AppShell.jsx'), 'utf8');
  const appShellCss = readFileSync(resolve('src/components/layout/AppShell.css'), 'utf8');

  // Verify AppShell imports and uses resolveAppShellAuthState
  assert.ok(
    appShellJsx.includes('resolveAppShellAuthState') &&
      appShellJsx.includes('../../utils/accountProfileValidation.js'),
    'AppShell must import resolveAppShellAuthState'
  );
  assert.ok(
    appShellJsx.includes('isAuthenticated = undefined'),
    'AppShell must accept isAuthenticated prop'
  );
  assert.ok(
    appShellJsx.includes('const hasSession = resolveAppShellAuthState({'),
    'AppShell must use resolveAppShellAuthState'
  );
  assert.ok(
    appShellJsx.includes('const resolvedUser = hasSession ? (session?.user || user || null) : null;'),
    'AppShell must resolve user from session?.user when user prop is omitted and clear when no session'
  );

  // Verify that all 11 AppShell render sites in App.jsx pass isAuthenticated and onLogout correctly
  const appShellMatches = appJsx.match(/<AppShell\b[^>]*>/gs) || [];
  assert.equal(
    appShellMatches.length,
    11,
    'Expected exactly 11 AppShell render sites across all routes in App.jsx'
  );

  for (let i = 0; i < appShellMatches.length; i++) {
    const site = appShellMatches[i];
    assert.ok(
      site.includes('isAuthenticated={isSessionActive(session)}'),
      `AppShell render site ${i + 1} must pass isAuthenticated={isSessionActive(session)}`
    );
    assert.ok(
      site.includes('onLogout={isSessionActive(session) ? logout : null}'),
      `AppShell render site ${i + 1} must pass onLogout={isSessionActive(session) ? logout : null}`
    );
    assert.ok(
      site.includes('session={session}'),
      `AppShell render site ${i + 1} must pass session={session}`
    );
  }

  // Verify Owner dashboard specifically passes role="OWNER"
  const ownerSite = appShellMatches.find((site) => site.includes('isVaultRoute') || site.includes('isBeneficiariesRoute') || site.includes('role="OWNER"'));
  assert.ok(ownerSite, 'Owner dashboard AppShell render site must exist');
  assert.ok(ownerSite.includes('role="OWNER"'), 'Owner dashboard AppShell must pass role="OWNER"');

  // Verify AppShell.css layout guarantees: no clipping of the last menu item
  assert.ok(
    appShellCss.includes('z-index: 110;'),
    '.lv-sidebar-footer must have z-index: 110 to layer over navigation'
  );
  assert.ok(
    appShellCss.includes('overflow-y: auto;'),
    '.lv-account-popover-menu must have overflow-y: auto to prevent clipping'
  );

  // Verify no duplicate logout button outside menu
  const logoutButtons = appShellJsx.match(/onLogout\(\)/g) || [];
  assert.equal(
    logoutButtons.length,
    1,
    'There must be exactly 1 onLogout() call in AppShell, strictly inside the popover menu'
  );
});

test('EX-01 Product UI Account Widget Data Resolution Verification', async (t) => {
  await t.test('resolves real fullName when session is active', () => {
    const session = {
      accessToken: 'token-active',
      user: {
        id: 'u1',
        fullName: 'Le Gia Huy',
        email: 'huy@legacyvault.test',
        roles: ['STAFF_EXECUTOR'],
      },
    };
    assert.equal(
      resolveAccountDisplayName(session.user, session, true, 'Nhân viên thực thi', 'vi'),
      'Le Gia Huy'
    );
  });

  await t.test('STRICT: never displays email, token, or technical IDs as a fallback for name', () => {
    const userWithOnlyEmail = {
      id: 'usr_secret_id_12345',
      accessToken: 'jwt.token.secret',
      email: 'sensitive.email@test.corp',
    };
    const displayNameVi = resolveAccountDisplayName(
      userWithOnlyEmail,
      null,
      true,
      'Chủ sở hữu kho',
      'vi'
    );
    assert.equal(displayNameVi, 'Chủ sở hữu kho');
    assert.doesNotMatch(displayNameVi, /sensitive\.email|jwt|secret|12345/);

    const displayNameEn = resolveAccountDisplayName(
      userWithOnlyEmail,
      null,
      true,
      'Vault Owner',
      'en'
    );
    assert.equal(displayNameEn, 'Vault Owner');
    assert.doesNotMatch(displayNameEn, /sensitive\.email|jwt|secret|12345/);

    // Completely empty user
    const fallbackNoRole = resolveAccountDisplayName({}, null, true, '', 'vi');
    assert.equal(fallbackNoRole, 'Tài khoản');
  });

  await t.test('resolves neutral "Tài khoản" / "Account" when no session is present', () => {
    assert.equal(resolveAccountDisplayName(null, null, false, '', 'vi'), 'Tài khoản');
    assert.equal(resolveAccountDisplayName(null, null, false, '', 'en'), 'Account');
  });

  await t.test('resolves translated role labels from session.user in VI and EN', () => {
    const staffSession = {
      user: {
        roles: ['STAFF_EXECUTOR'],
      },
    };
    assert.equal(resolveUserRoleLabel(null, staffSession, 'OWNER', 'vi'), 'Nhân viên thực thi');
    assert.equal(resolveUserRoleLabel(null, staffSession, 'OWNER', 'en'), 'Staff Executor');

    const legalSession = {
      user: {
        roles: ['ROLE_LEGAL_VERIFIER'],
      },
    };
    assert.equal(resolveUserRoleLabel(null, legalSession, 'OWNER', 'vi'), 'Chuyên viên pháp lý');
    assert.equal(resolveUserRoleLabel(null, legalSession, 'OWNER', 'en'), 'Legal Verifier');

    const ownerSession = {
      user: {
        roles: ['VAULT_OWNER'],
      },
    };
    assert.equal(resolveUserRoleLabel(null, ownerSession, 'OWNER', 'vi'), 'Chủ sở hữu kho');
    assert.equal(resolveUserRoleLabel(null, ownerSession, 'OWNER', 'en'), 'Vault Owner');
  });

  await t.test('extracts uppercase initials from fullName correctly', () => {
    assert.equal(resolveAccountInitials('Le Gia Huy'), 'LH');
    assert.equal(resolveAccountInitials('Nguyen Van A'), 'NA');
    assert.equal(resolveAccountInitials('Vance'), 'VA');
    assert.equal(resolveAccountInitials(''), '');
    assert.equal(resolveAccountInitials(null), '');
  });
});

test('EX-01 Product UI AppShell Template & Guard Regression Verification', () => {
  const appShellJsx = readFileSync(resolve('src/components/layout/AppShell.jsx'), 'utf8');

  // Verify previewBadge is completely removed
  assert.equal(
    appShellJsx.includes('previewBadge'),
    false,
    'previewBadge property must be completely removed from AppShell.jsx'
  );

  // Verify neither "Xem thử" nor "Preview" is rendered as a role badge
  assert.equal(
    appShellJsx.includes("'Xem thử'"),
    false,
    'The string "Xem thử" must not be present in AppShell.jsx'
  );

  // Verify that when !hasSession, neutral SVG icon is used in avatar
  assert.ok(
    appShellJsx.includes("!hasSession ? 'is-neutral' : ''"),
    'Avatar element must include is-neutral modifier when !hasSession'
  );

  // Verify that when !hasSession, no subtitle / secondary line is rendered
  assert.ok(
    appShellJsx.includes('{hasSession && displayRole && ('),
    'Badge card and popover must conditionally render displayRole only when hasSession is true'
  );

  // Verify that Đăng xuất is rendered in the popover menu with disabled guard when !hasSession
  assert.ok(
    appShellJsx.includes("className=\"lv-account-menu-item lv-account-menu-item--logout\""),
    'Đăng xuất menu item must be rendered in the popover menu'
  );
  assert.ok(
    appShellJsx.includes("disabled={!hasSession || typeof onLogout !== 'function'}"),
    'Đăng xuất menu item must be disabled when !hasSession or onLogout is not a function'
  );
  assert.ok(
    appShellJsx.includes("if (!hasSession || typeof onLogout !== 'function') {"),
    'Đăng xuất onClick handler must exit early without fake session or action when !hasSession'
  );
});
