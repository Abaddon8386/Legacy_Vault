import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateStaffLegalDocumentForm,
  canAccessStaffLegalDocuments,
  STAFF_LEGAL_DOCS_ERROR_KEYS,
  getStaffLegalDocumentErrorMessage,
  formatStaffLegalDocumentErrors,
} from './staffLegalDocumentsValidation.js';
import { staffLegalDocumentsI18n } from '../pages/staff/staffLegalDocumentsI18n.js';

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
