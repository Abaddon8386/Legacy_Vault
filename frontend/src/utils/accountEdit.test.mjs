import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessAccountEdit,
  formatRoleName,
  validateProfileEditForm,
  isFormDirty,
  resolveInitialProfileData,
  shouldUpdateFormFromSession,
  APP_ROLES,
  canEditProfileEmail,
  isValidEmail,
} from './accountEditValidation.js';
import { resolvePostLoginRoute } from './staffLegalDocumentsValidation.js';
import { accountEditI18n } from '../pages/account/accountEditI18n.js';

test('EX-02 Session Guard (canAccessAccountEdit)', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessAccountEdit(null), false);
    assert.equal(canAccessAccountEdit(undefined), false);
    assert.equal(
      canAccessAccountEdit({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
  });

  await t.test('rejects access when accessToken is empty or missing', () => {
    assert.equal(
      canAccessAccountEdit({
        accessToken: '',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
  });

  await t.test('rejects access when user has no roles or roles array is empty', () => {
    assert.equal(
      canAccessAccountEdit({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: [] },
      }),
      false
    );
  });

  await t.test('grants access for any authenticated role in system', () => {
    for (const role of APP_ROLES) {
      assert.equal(
        canAccessAccountEdit({
          accessToken: 'token-123',
          expiresAt: Date.now() + 60000,
          user: { roles: [role] },
        }),
        true,
        `Role ${role} should have access to edit profile`
      );
    }
  });
});

test('EX-02 Localized Role Formatter (formatRoleName)', async (t) => {
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

test('EX-02 Form Validation (validateProfileEditForm)', async (t) => {
  await t.test('accepts valid full name', () => {
    const res = validateProfileEditForm({ fullName: 'Nguyen Van A' });
    assert.equal(res.isValid, true);
    assert.deepEqual(res.errors, {});
  });

  await t.test('rejects empty or whitespace-only full name', () => {
    const resEmpty = validateProfileEditForm({ fullName: '' });
    assert.equal(resEmpty.isValid, false);
    assert.equal(resEmpty.errors.fullName, 'REQUIRED');

    const resWhitespace = validateProfileEditForm({ fullName: '   ' });
    assert.equal(resWhitespace.isValid, false);
    assert.equal(resWhitespace.errors.fullName, 'REQUIRED');
  });

  await t.test('rejects null or non-string full name', () => {
    const resNull = validateProfileEditForm({ fullName: null });
    assert.equal(resNull.isValid, false);
    assert.equal(resNull.errors.fullName, 'REQUIRED');
  });
});

test('EX-02 Dirty State Tracking (isFormDirty)', async (t) => {
  await t.test('returns false when values match', () => {
    assert.equal(isFormDirty('Nguyen Van A', 'Nguyen Van A'), false);
    assert.equal(isFormDirty('  Nguyen Van A  ', 'Nguyen Van A'), false);
  });

  await t.test('returns true when values differ', () => {
    assert.equal(isFormDirty('Nguyen Van B', 'Nguyen Van A'), true);
  });
});

test('EX-02 Initial Profile Data Resolution (resolveInitialProfileData)', async (t) => {
  await t.test('resolves profile data from valid session', () => {
    const session = {
      user: {
        id: '123e4567-e89b-12d3-a456-426614174000',
        fullName: 'Le Gia Huy',
        email: 'huy.legia@legacyvault.test',
        roles: ['STAFF_EXECUTOR'],
      },
    };
    const data = resolveInitialProfileData(session);
    assert.deepEqual(data, {
      id: '123e4567-e89b-12d3-a456-426614174000',
      fullName: 'Le Gia Huy',
      email: 'huy.legia@legacyvault.test',
      roles: ['STAFF_EXECUTOR'],
    });
  });

  await t.test('returns null if session or user is invalid', () => {
    assert.equal(resolveInitialProfileData(null), null);
    assert.equal(resolveInitialProfileData({}), null);
    assert.equal(resolveInitialProfileData({ user: null }), null);
  });
});

test('EX-02 Session Refresh vs Work-in-Progress Protection (shouldUpdateFormFromSession)', async (t) => {
  await t.test('always allows update if user ID changed (session switch)', () => {
    assert.equal(shouldUpdateFormFromSession(true, 'user-A', 'user-B'), true);
    assert.equal(shouldUpdateFormFromSession(false, 'user-A', 'user-B'), true);
  });

  await t.test('prevents background session refresh from overwriting ongoing user edits (same user, isDirty true)', () => {
    assert.equal(shouldUpdateFormFromSession(true, 'user-A', 'user-A'), false);
  });

  await t.test('allows background update when user has not modified form (same user, isDirty false)', () => {
    assert.equal(shouldUpdateFormFromSession(false, 'user-A', 'user-A'), true);
  });
});

test('EX-02 Bilingual Dictionary Completeness (VI & EN)', () => {
  const vi = accountEditI18n.vi;
  const en = accountEditI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  for (const key of Object.keys(vi)) {
    assert.ok(en[key], `Missing EN translation for key: ${key}`);
  }

  // TASK #23: Verify Cancel button is retained and form reset button is removed
  assert.equal(vi.btnCancel, 'Hủy bỏ');
  assert.equal(vi.btnReset, undefined);

  assert.equal(en.btnCancel, 'Cancel');
  assert.equal(en.btnReset, undefined);

  // Ensure no proposal/technical justification jargon in user copy
  const allTextVi = Object.values(vi).join(' ');
  const allTextEn = Object.values(en).join(' ');
  assert.equal(allTextVi.includes('đề xuất'), false, 'VI dictionary must not contain "đề xuất"');
  assert.equal(allTextEn.toLowerCase().includes('proposal'), false, 'EN dictionary must not contain "proposal"');
});

test('EX-02 CSS Scoping Verification - No Leakage', () => {
  const cssPath = resolve('src/pages/account/AccountEditPage.css');
  const css = readFileSync(cssPath, 'utf8');

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
          s.startsWith('.lv-account-edit-view'),
          `Selector "${s}" in AccountEditPage.css must start with .lv-account-edit-view`
        );
      }
    }
  }
});

test('EX-02 Portal Home Destination on Cancel (Pre-EX-01 merge)', () => {
  // Vault Owner returns to /vault
  assert.equal(resolvePostLoginRoute({ roles: ['VAULT_OWNER'] }), '/vault');
  // Staff Executor returns to /staff/legal-documents
  assert.equal(resolvePostLoginRoute({ roles: ['STAFF_EXECUTOR'] }), '/staff/legal-documents');
  // Legal Verifier returns to /legal/death-verification
  assert.equal(resolvePostLoginRoute({ roles: ['LEGAL_VERIFIER'] }), '/legal/death-verification');
});

test('EX-02 AppShell & App.jsx Integrated Navigation Destination Verification', () => {
  const appShellPath = resolve('src/components/layout/AppShell.jsx');
  const appShellCode = readFileSync(appShellPath, 'utf8');
  assert.ok(
    appShellCode.includes("onNavigateTab('account-profile')"),
    'AppShell badge card must navigate to account-profile in merged profile flow'
  );

  const appPath = resolve('src/App.jsx');
  const appCode = readFileSync(appPath, 'utf8');
  assert.ok(
    appCode.includes("path === '/account/profile'"),
    'App.jsx must route to /account/profile'
  );
  assert.ok(
    appCode.includes("path === '/account/edit'"),
    'App.jsx must route to /account/edit'
  );
  assert.ok(
    appCode.includes("navigateTo(preview ? '/account/profile?preview=true' : '/account/profile')"),
    'App.jsx Cancel action must navigate to /account/profile'
  );
});

test('TASK #23 Form Reset Button Removal Verification', () => {
  const pagePath = resolve('src/pages/account/AccountEditPage.jsx');
  const code = readFileSync(pagePath, 'utf8');
  assert.equal(code.includes('handleReset'), false, 'AccountEditPage must not contain handleReset');
  assert.equal(code.includes('btnReset'), false, 'AccountEditPage must not reference btnReset');
  assert.equal(code.includes('RotateCcw'), false, 'AccountEditPage must not import RotateCcw');
});

test('TASK #24: Role-Based Email Editability (canEditProfileEmail)', async (t) => {
  await t.test('allows pure VAULT_OWNER to edit email', () => {
    const session = { user: { id: 'u-1', roles: ['VAULT_OWNER'] } };
    const res = canEditProfileEmail(session);
    assert.equal(res.canEdit, true);
    assert.equal(res.reason, 'OWNER_PERMITTED');
    assert.equal(res.hasConflict, false);
  });

  await t.test('normalizes ROLE_ prefix and permits ROLE_VAULT_OWNER', () => {
    const session = { user: { id: 'u-1', roles: ['ROLE_VAULT_OWNER'] } };
    const res = canEditProfileEmail(session);
    assert.equal(res.canEdit, true);
    assert.equal(res.reason, 'OWNER_PERMITTED');
  });

  await t.test('keeps email read-only for STAFF_EXECUTOR', () => {
    const session = { user: { id: 'u-2', roles: ['STAFF_EXECUTOR'] } };
    const res = canEditProfileEmail(session);
    assert.equal(res.canEdit, false);
    assert.equal(res.reason, 'STAFF_LEGAL_READONLY');
    assert.equal(res.hasConflict, false);
  });

  await t.test('keeps email read-only for LEGAL_VERIFIER', () => {
    const session = { user: { id: 'u-3', roles: ['LEGAL_VERIFIER'] } };
    const res = canEditProfileEmail(session);
    assert.equal(res.canEdit, false);
    assert.equal(res.reason, 'STAFF_LEGAL_READONLY');
    assert.equal(res.hasConflict, false);
  });

  await t.test('detects multi-role conflict between Owner and Staff/Legal, defaulting to audit safety (read-only)', () => {
    const sessionWithStaff = { user: { id: 'u-4', roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] } };
    const resStaff = canEditProfileEmail(sessionWithStaff);
    assert.equal(resStaff.canEdit, false);
    assert.equal(resStaff.reason, 'MULTI_ROLE_CONFLICT');
    assert.equal(resStaff.hasConflict, true);

    const sessionWithLegal = { user: { id: 'u-5', roles: ['VAULT_OWNER', 'LEGAL_VERIFIER'] } };
    const resLegal = canEditProfileEmail(sessionWithLegal);
    assert.equal(resLegal.canEdit, false);
    assert.equal(resLegal.reason, 'MULTI_ROLE_CONFLICT');
    assert.equal(resLegal.hasConflict, true);
  });

  await t.test('rejects unauthenticated or role-less sessions', () => {
    assert.equal(canEditProfileEmail(null).canEdit, false);
    assert.equal(canEditProfileEmail({ user: {} }).canEdit, false);
    assert.equal(canEditProfileEmail({ user: { roles: [] } }).canEdit, false);
  });
});

test('TASK #24: Email Format Validation (isValidEmail)', () => {
  assert.equal(isValidEmail('owner@example.com'), true);
  assert.equal(isValidEmail('user.name+tag@domain.co.uk'), true);
  assert.equal(isValidEmail(''), false);
  assert.equal(isValidEmail('plainaddress'), false);
  assert.equal(isValidEmail('@missingusername.com'), false);
  assert.equal(isValidEmail('missingdomain@.com'), false);
  assert.equal(isValidEmail('spaces in@domain.com'), false);
  assert.equal(isValidEmail(null), false);
});

test('TASK #24: Form Validation with Email Option (validateProfileEditForm)', () => {
  // When canEditEmail is false, email is not validated
  const resNoEmail = validateProfileEditForm({ fullName: 'John Doe', email: 'invalid' }, { canEditEmail: false });
  assert.equal(resNoEmail.isValid, true);
  assert.equal(resNoEmail.errors.email, undefined);

  // When canEditEmail is true, validates required and format
  const resEmptyEmail = validateProfileEditForm({ fullName: 'John Doe', email: '' }, { canEditEmail: true });
  assert.equal(resEmptyEmail.isValid, false);
  assert.equal(resEmptyEmail.errors.email, 'REQUIRED');

  const resInvalidEmail = validateProfileEditForm({ fullName: 'John Doe', email: 'bad-email' }, { canEditEmail: true });
  assert.equal(resInvalidEmail.isValid, false);
  assert.equal(resInvalidEmail.errors.email, 'INVALID_FORMAT');

  const resValid = validateProfileEditForm({ fullName: 'John Doe', email: 'valid@example.com' }, { canEditEmail: true });
  assert.equal(resValid.isValid, true);
  assert.deepEqual(resValid.errors, {});
});

test('TASK #24: Dirty Tracking with Email Option (isFormDirty)', () => {
  const initial = { fullName: 'Nguyen Van A', email: 'a@example.com' };

  // When canEditEmail is false, changes to email do not mark dirty
  assert.equal(isFormDirty({ fullName: 'Nguyen Van A', email: 'different@example.com' }, initial, { canEditEmail: false }), false);

  // When canEditEmail is true, changes to email mark dirty
  assert.equal(isFormDirty({ fullName: 'Nguyen Van A', email: 'different@example.com' }, initial, { canEditEmail: true }), true);
  assert.equal(isFormDirty({ fullName: 'Nguyen Van B', email: 'a@example.com' }, initial, { canEditEmail: true }), true);
  assert.equal(isFormDirty({ fullName: 'Nguyen Van A', email: 'a@example.com' }, initial, { canEditEmail: true }), false);
});