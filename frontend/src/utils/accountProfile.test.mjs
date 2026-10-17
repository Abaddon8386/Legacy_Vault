import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessAccountProfile,
  formatRoleName,
  isValidUserProfile,
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
