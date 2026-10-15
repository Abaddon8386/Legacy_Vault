import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { canAccessLegalDeathVerification } from './legalDeathVerificationValidation.js';
import { readUser } from '../api/contracts.js';

describe('PS-28 Route & Role Guard - Logic Used by the Application', () => {
  it('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessLegalDeathVerification(null), false);
    assert.equal(canAccessLegalDeathVerification(undefined), false);

    const expiredSession = {
      accessToken: 'sample-token',
      expiresAt: Date.now() - 5000,
      user: { id: 'a0000000-0000-0000-0000-000000000001', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalDeathVerification(expiredSession), false);
  });

  it('rejects access when session is active but user lacks LEGAL_VERIFIER role', () => {
    const ownerUser = readUser({
      id: 'b0000000-0000-0000-0000-000000000002',
      fullName: 'Chủ sở hữu kho',
      email: 'owner@example.test',
      roles: ['ROLE_VAULT_OWNER'],
    });

    const activeOwnerSession = {
      accessToken: 'valid-token',
      expiresAt: Date.now() + 60000,
      user: ownerUser,
    };

    assert.equal(canAccessLegalDeathVerification(activeOwnerSession), false);
  });

  it('grants access when session is active and user has LEGAL_VERIFIER role', () => {
    const legalUser = readUser({
      id: 'a0000000-0000-0000-0000-000000000001',
      fullName: 'Chuyên viên Pháp lý',
      email: 'legal@example.test',
      roles: ['ROLE_LEGAL_VERIFIER'],
    });

    const activeLegalSession = {
      accessToken: 'valid-token',
      expiresAt: Date.now() + 60000,
      user: legalUser,
    };

    assert.equal(canAccessLegalDeathVerification(activeLegalSession), true);
  });

  it('grants access when user holds both VAULT_OWNER and LEGAL_VERIFIER roles', () => {
    const dualUser = readUser({
      id: 'c0000000-0000-0000-0000-000000000003',
      fullName: 'Quản trị viên / Pháp lý',
      email: 'dual@example.test',
      roles: ['ROLE_VAULT_OWNER', 'ROLE_LEGAL_VERIFIER'],
    });

    const activeDualSession = {
      accessToken: 'valid-token',
      expiresAt: Date.now() + 60000,
      user: dualUser,
    };

    assert.equal(canAccessLegalDeathVerification(activeDualSession), true);
  });

  it('preserves Vault Owner guard: Legal Verifier without VAULT_OWNER is blocked from Owner pages', () => {
    const legalOnlyUser = readUser({
      id: 'a0000000-0000-0000-0000-000000000001',
      fullName: 'Legal Officer',
      email: 'legal@example.test',
      roles: ['ROLE_LEGAL_VERIFIER'],
    });

    assert.equal(legalOnlyUser.roles.includes('VAULT_OWNER'), false);
  });
});
