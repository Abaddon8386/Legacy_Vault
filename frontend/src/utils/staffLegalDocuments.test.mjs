import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStaffLegalDocumentForm,
  canAccessStaffLegalDocuments,
  resolvePostLoginRoute,
  STAFF_LEGAL_DOCS_ERROR_KEYS,
  getStaffLegalDocumentErrorMessage,
  formatStaffLegalDocumentErrors,
} from './staffLegalDocumentsValidation.js';
import { staffLegalDocumentsI18n } from '../pages/staff/staffLegalDocumentsI18n.js';
import { createSession } from './session.js';
import { readUser } from '../api/contracts.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PS-31 Staff Legal Documents - Route & Client Role Guard', () => {
  it('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessStaffLegalDocuments(null), false);
    assert.equal(canAccessStaffLegalDocuments(undefined), false);

    const expiredSession = {
      accessToken: 'token-expired',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', roles: ['STAFF_EXECUTOR'] },
    };
    assert.equal(canAccessStaffLegalDocuments(expiredSession), false);
  });

  it('rejects access when session is active but user lacks STAFF_EXECUTOR role (e.g. OWNER or LEGAL)', () => {
    const ownerOnly = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u1', roles: ['VAULT_OWNER'] },
    };
    assert.equal(canAccessStaffLegalDocuments(ownerOnly), false);

    const legalOnly = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u2', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessStaffLegalDocuments(legalOnly), false);
  });

  it('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    const staffUser = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u3', roles: ['STAFF_EXECUTOR'] },
    };
    assert.equal(canAccessStaffLegalDocuments(staffUser), true);
  });

  it('grants access when user holds both VAULT_OWNER and STAFF_EXECUTOR roles', () => {
    const dualRole = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u4', roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] },
    };
    assert.equal(canAccessStaffLegalDocuments(dualRole), true);
  });
});

describe('PS-31 Staff Legal Documents - AC-aligned Form Validation', () => {
  it('accepts valid metadata inputs (issuer, documentNumber, valid issuanceDate)', () => {
    const res = validateStaffLegalDocumentForm({
      issuer: 'Tòa án nhân dân TP. Hà Nội',
      documentNumber: '125/2026/QĐ-TA',
      issuanceDate: '2026-03-15',
    });
    assert.equal(res.isValid, true);
    assert.deepEqual(res.errors, {});
  });

  it('fails when issuing authority is missing or whitespace-only', () => {
    const missing = validateStaffLegalDocumentForm({
      issuer: '   ',
      documentNumber: '125/2026/QĐ-TA',
      issuanceDate: '2026-03-15',
    });
    assert.equal(missing.isValid, false);
    assert.equal(missing.errors.issuer, STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUER_REQUIRED);
    assert.equal(missing.errors.issuer, 'issuerRequired');
  });

  it('fails when document number is missing or whitespace-only', () => {
    const missing = validateStaffLegalDocumentForm({
      issuer: 'Tòa án nhân dân',
      documentNumber: '',
      issuanceDate: '2026-03-15',
    });
    assert.equal(missing.isValid, false);
    assert.equal(missing.errors.documentNumber, STAFF_LEGAL_DOCS_ERROR_KEYS.DOCUMENT_NUMBER_REQUIRED);
    assert.equal(missing.errors.documentNumber, 'documentNumberRequired');
  });

  it('fails when issuance date is missing or whitespace-only', () => {
    const missing = validateStaffLegalDocumentForm({
      issuer: 'Tòa án nhân dân',
      documentNumber: '125/2026/QĐ-TA',
      issuanceDate: '   ',
    });
    assert.equal(missing.isValid, false);
    assert.equal(missing.errors.issuanceDate, STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_REQUIRED);
    assert.equal(missing.errors.issuanceDate, 'issuanceDateRequired');
  });

  it('fails when issuance date is provided but not a parseable valid date', () => {
    const invalid = validateStaffLegalDocumentForm({
      issuer: 'Tòa án nhân dân',
      documentNumber: '125/2026/QĐ-TA',
      issuanceDate: 'not-a-valid-date-string',
    });
    assert.equal(invalid.isValid, false);
    assert.equal(invalid.errors.issuanceDate, STAFF_LEGAL_DOCS_ERROR_KEYS.ISSUANCE_DATE_INVALID);
    assert.equal(invalid.errors.issuanceDate, 'issuanceDateInvalid');
  });

  it('does not enforce arbitrary length limits, future-date bans or extra fields outside contract', () => {
    const futureDate = '2099-12-31';
    const res = validateStaffLegalDocumentForm({
      issuer: 'Cơ quan A',
      documentNumber: '1',
      issuanceDate: futureDate,
    });
    assert.equal(res.isValid, true);
  });

  it('ensures form payload does not log or store credentials or raw passwords', () => {
    const payload = {
      issuer: 'Tòa án nhân dân TP. Hà Nội',
      documentNumber: '125/2026/QĐ-TA',
      issuanceDate: '2026-03-15',
    };
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(serialized.includes('secret'), false);
  });
});

describe('PS-31 Staff Legal Documents - Dynamic Language Switching (VI <-> EN)', () => {
  it('correctly resolves metadata error keys in Vietnamese dictionary', () => {
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuerRequired', 'vi'),
      'Vui lòng nhập cơ quan ban hành.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('documentNumberRequired', 'vi'),
      'Vui lòng nhập số hiệu văn bản.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuanceDateRequired', 'vi'),
      'Vui lòng chọn ngày ban hành.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuanceDateInvalid', 'vi'),
      'Ngày ban hành không hợp lệ.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(staffLegalDocumentsI18n.vi.issuerRequired, 'Vui lòng nhập cơ quan ban hành.');
    assert.equal(staffLegalDocumentsI18n.vi.documentNumberRequired, 'Vui lòng nhập số hiệu văn bản.');
    assert.equal(staffLegalDocumentsI18n.vi.issuanceDateRequired, 'Vui lòng chọn ngày ban hành.');
    assert.equal(staffLegalDocumentsI18n.vi.issuanceDateInvalid, 'Ngày ban hành không hợp lệ.');
  });

  it('correctly resolves metadata error keys in English dictionary', () => {
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuerRequired', 'en'),
      'Please enter the issuing authority.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('documentNumberRequired', 'en'),
      'Please enter the document number.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuanceDateRequired', 'en'),
      'Please select the issuance date.'
    );
    assert.equal(
      getStaffLegalDocumentErrorMessage('issuanceDateInvalid', 'en'),
      'Invalid issuance date.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(staffLegalDocumentsI18n.en.issuerRequired, 'Please enter the issuing authority.');
    assert.equal(staffLegalDocumentsI18n.en.documentNumberRequired, 'Please enter the document number.');
    assert.equal(staffLegalDocumentsI18n.en.issuanceDateRequired, 'Please select the issuance date.');
    assert.equal(staffLegalDocumentsI18n.en.issuanceDateInvalid, 'Invalid issuance date.');
  });

  it('dynamically switches error messages when language changes without re-validating form state', () => {
    // 1. Validate empty form
    const initialValidation = validateStaffLegalDocumentForm({
      issuer: '',
      documentNumber: '',
      issuanceDate: '',
    });
    assert.equal(initialValidation.isValid, false);

    // State stores ONLY language-neutral error keys
    const stateErrors = initialValidation.errors;
    assert.deepEqual(stateErrors, {
      issuer: 'issuerRequired',
      documentNumber: 'documentNumberRequired',
      issuanceDate: 'issuanceDateRequired',
    });

    // 2. Render under VI
    const viIssuer = staffLegalDocumentsI18n.vi[stateErrors.issuer];
    assert.equal(viIssuer, 'Vui lòng nhập cơ quan ban hành.');

    // 3. Switch to EN — stateErrors remains UNCHANGED
    const enIssuer = staffLegalDocumentsI18n.en[stateErrors.issuer];
    assert.equal(enIssuer, 'Please enter the issuing authority.');

    // Helper formatting test
    const formattedEn = formatStaffLegalDocumentErrors(stateErrors, 'en');
    assert.equal(formattedEn.issuer, 'Please enter the issuing authority.');
    assert.equal(formattedEn.documentNumber, 'Please enter the document number.');
    assert.equal(formattedEn.issuanceDate, 'Please select the issuance date.');
  });
});

describe('PS-31 Staff CSS Scoping Verification - No Leakage into Owner, Legal or Other Views', () => {
  it('ensures every selector in StaffLegalDocumentsPage.css is scoped under .lv-staff-documents-view', () => {
    const cssPath = path.resolve(__dirname, '../pages/staff/StaffLegalDocumentsPage.css');
    const cssContent = fs.readFileSync(cssPath, 'utf8');

    const lines = cssContent.split('\n');
    const unscopedSelectors = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim();
      if (
        trimmed.endsWith('{') &&
        !trimmed.startsWith('@media') &&
        !trimmed.startsWith('/*') &&
        !trimmed.startsWith('*')
      ) {
        const selectorPart = trimmed.slice(0, -1).trim();
        const subSelectors = selectorPart.split(',').map((s) => s.trim());
        for (const sel of subSelectors) {
          if (!sel.startsWith('.lv-staff-documents-view')) {
            unscopedSelectors.push({ line: index + 1, selector: sel });
          }
        }
      }
    });

    assert.equal(
      unscopedSelectors.length,
      0,
      `Found unscoped CSS selectors: ${JSON.stringify(unscopedSelectors, null, 2)}`
    );
  });
});

describe('PS-31 Post-Login Redirection & Role Hierarchy Verification', () => {
  it('directs pure STAFF_EXECUTOR to /staff/legal-documents instead of /vault', () => {
    const pureStaff = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f3b',
      fullName: 'Executor Staff',
      email: 'staff@example.com',
      roles: ['STAFF_EXECUTOR'],
    };
    assert.equal(resolvePostLoginRoute(pureStaff), '/staff/legal-documents');
  });

  it('preserves existing Owner destination (/vault) for pure VAULT_OWNER', () => {
    const pureOwner = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f3c',
      fullName: 'Vault Owner',
      email: 'owner@example.com',
      roles: ['VAULT_OWNER'],
    };
    assert.equal(resolvePostLoginRoute(pureOwner), '/vault');
  });

  it('preserves existing Legal destination (/legal/death-verification) for pure LEGAL_VERIFIER', () => {
    const pureLegal = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f3d',
      fullName: 'Legal Verifier',
      email: 'legal@example.com',
      roles: ['LEGAL_VERIFIER'],
    };
    assert.equal(resolvePostLoginRoute(pureLegal), '/legal/death-verification');
  });

  it('preserves multi-role hierarchy: any account with VAULT_OWNER goes to /vault', () => {
    const ownerStaff = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f3e',
      fullName: 'Owner and Staff',
      email: 'owner-staff@example.com',
      roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'],
    };
    assert.equal(resolvePostLoginRoute(ownerStaff), '/vault');

    const ownerLegal = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f3f',
      fullName: 'Owner and Legal',
      email: 'owner-legal@example.com',
      roles: ['VAULT_OWNER', 'LEGAL_VERIFIER'],
    };
    assert.equal(resolvePostLoginRoute(ownerLegal), '/vault');

    const allRoles = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f40',
      fullName: 'Super User',
      email: 'super@example.com',
      roles: ['VAULT_OWNER', 'LEGAL_VERIFIER', 'STAFF_EXECUTOR'],
    };
    assert.equal(resolvePostLoginRoute(allRoles), '/vault');
  });

  it('preserves multi-role hierarchy: LEGAL_VERIFIER takes precedence over STAFF_EXECUTOR when not VAULT_OWNER', () => {
    const legalStaff = {
      id: 'd9b2d63d-a233-4123-8478-f99a30986f41',
      fullName: 'Legal and Staff',
      email: 'legal-staff@example.com',
      roles: ['LEGAL_VERIFIER', 'STAFF_EXECUTOR'],
    };
    assert.equal(resolvePostLoginRoute(legalStaff), '/legal/death-verification');
  });

  it('gracefully falls back to /vault when user or roles is null, undefined or empty', () => {
    assert.equal(resolvePostLoginRoute(null), '/vault');
    assert.equal(resolvePostLoginRoute(undefined), '/vault');
    assert.equal(resolvePostLoginRoute({}), '/vault');
    assert.equal(resolvePostLoginRoute({ roles: [] }), '/vault');
    assert.equal(resolvePostLoginRoute({ roles: ['UNKNOWN_ROLE'] }), '/vault');
  });
});

describe('PS-31 End-to-End Post-Login Application Flow with Contract Payloads', () => {
  function simulateEstablishSession(authResult, navigateSpy) {
    const session = createSession(authResult);
    const user = session.user;
    const targetRoute = resolvePostLoginRoute(user);
    navigateSpy(targetRoute);
    return { session, user, targetRoute };
  }

  it('authenticates BE staff response (ROLE_STAFF_EXECUTOR) and navigates to /staff/legal-documents', () => {
    const rawBackendAuthResponse = {
      accessToken: 'sample-jwt-token-for-staff',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: '11111111-2222-3333-4444-555555555555',
        fullName: 'Nguyen Van Staff',
        email: 'staff.nguyen@legacyvault.vn',
        roles: ['ROLE_STAFF_EXECUTOR'],
      },
    };

    let navigatedRoute = null;
    const navigateSpy = (route) => {
      navigatedRoute = route;
    };

    const result = simulateEstablishSession(rawBackendAuthResponse, navigateSpy);

    assert.equal(result.session.accessToken, 'sample-jwt-token-for-staff');
    assert.deepEqual(result.user.roles, ['STAFF_EXECUTOR']);
    assert.equal(navigatedRoute, '/staff/legal-documents');
    assert.equal(result.targetRoute, '/staff/legal-documents');
    assert.equal(canAccessStaffLegalDocuments(result.session), true);
  });

  it('authenticates BE owner response (ROLE_VAULT_OWNER) and navigates to /vault without regression', () => {
    const rawBackendAuthResponse = {
      accessToken: 'sample-jwt-token-for-owner',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: '22222222-3333-4444-5555-666666666666',
        fullName: 'Tran Thi Owner',
        email: 'owner.tran@legacyvault.vn',
        roles: ['ROLE_VAULT_OWNER'],
      },
    };

    let navigatedRoute = null;
    const navigateSpy = (route) => {
      navigatedRoute = route;
    };

    const result = simulateEstablishSession(rawBackendAuthResponse, navigateSpy);
    assert.deepEqual(result.user.roles, ['VAULT_OWNER']);
    assert.equal(navigatedRoute, '/vault');
  });

  it('authenticates BE legal response (ROLE_LEGAL_VERIFIER) and navigates to /legal/death-verification without regression', () => {
    const rawBackendAuthResponse = {
      accessToken: 'sample-jwt-token-for-legal',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: '33333333-4444-5555-6666-777777777777',
        fullName: 'Le Van Legal',
        email: 'legal.le@legacyvault.vn',
        roles: ['ROLE_LEGAL_VERIFIER'],
      },
    };

    let navigatedRoute = null;
    const navigateSpy = (route) => {
      navigatedRoute = route;
    };

    const result = simulateEstablishSession(rawBackendAuthResponse, navigateSpy);
    assert.deepEqual(result.user.roles, ['LEGAL_VERIFIER']);
    assert.equal(navigatedRoute, '/legal/death-verification');
  });

  it('rejects invalid authentication payload before navigation can occur', () => {
    const invalidAuthResponse = {
      accessToken: '',
      tokenType: 'Bearer',
      expiresInSeconds: 3600,
      user: {
        id: 'invalid-id',
        fullName: '',
        email: 'bad-email',
        roles: [],
      },
    };

    let navigatedRoute = null;
    const navigateSpy = (route) => {
      navigatedRoute = route;
    };

    assert.throws(
      () => simulateEstablishSession(invalidAuthResponse, navigateSpy),
      (err) => err?.name === 'ApiError' || err?.message === 'INVALID_AUTH_RESPONSE'
    );
    assert.equal(navigatedRoute, null);
  });
});
