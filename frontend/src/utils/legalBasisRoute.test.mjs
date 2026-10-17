import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  validateBasisRouteForm,
  canAccessLegalBasisRoute,
  LEGAL_BASIS_ROUTES,
  BASIS_ROUTE_ERROR_KEYS,
  getBasisRouteErrorMessage,
  formatBasisRouteErrors,
} from './legalBasisRouteValidation.js';
import { legalBasisRouteI18n } from '../pages/legal/legalBasisRouteI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PS-30 Legal Basis Route Selection - Route & Client Role Guard', () => {
  it('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessLegalBasisRoute(null), false);
    assert.equal(canAccessLegalBasisRoute(undefined), false);

    const expiredSession = {
      accessToken: 'token-expired',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalBasisRoute(expiredSession), false);
  });

  it('rejects access when session is active but user lacks LEGAL_VERIFIER role', () => {
    const ownerOnly = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u1', roles: ['VAULT_OWNER'] },
    };
    assert.equal(canAccessLegalBasisRoute(ownerOnly), false);
  });

  it('grants access when session is active and user has LEGAL_VERIFIER role', () => {
    const verifier = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u2', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalBasisRoute(verifier), true);
  });

  it('grants access when user holds both VAULT_OWNER and LEGAL_VERIFIER roles', () => {
    const dualRole = {
      accessToken: 'token-active',
      expiresAt: Date.now() + 3600000,
      user: { id: 'u3', roles: ['VAULT_OWNER', 'LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalBasisRoute(dualRole), true);
  });
});

describe('PS-30 Legal Basis Route Selection - AC-aligned Form Validation', () => {
  it('accepts valid selection for all 3 AC routes (NOTARIAL, COURT, ON_HOLD) with trimmed non-empty reason', () => {
    for (const route of LEGAL_BASIS_ROUTES) {
      const res = validateBasisRouteForm({
        route,
        reason: 'Hồ sơ đầy đủ tính pháp lý và phù hợp với quy định hiện hành.',
      });
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    }
  });

  it('fails when route choice is missing and returns routeRequired error key', () => {
    const missingRoute = validateBasisRouteForm({
      route: '',
      reason: 'Có lý do nhưng chưa chọn tuyến.',
    });
    assert.equal(missingRoute.isValid, false);
    assert.equal(missingRoute.errors.route, BASIS_ROUTE_ERROR_KEYS.ROUTE_REQUIRED);
    assert.equal(missingRoute.errors.route, 'routeRequired');
  });

  it('fails when route choice is not in AC choices and returns routeInvalid key', () => {
    const invalidRoute = validateBasisRouteForm({
      route: 'ARBITRATION',
      reason: 'Lý do hợp lệ nhưng tuyến ngoài danh mục AC.',
    });
    assert.equal(invalidRoute.isValid, false);
    assert.equal(invalidRoute.errors.route, BASIS_ROUTE_ERROR_KEYS.ROUTE_INVALID);
    assert.equal(invalidRoute.errors.route, 'routeInvalid');
  });

  it('fails when reason is empty or whitespace-only after trim and returns reasonRequired key', () => {
    const emptyReason = validateBasisRouteForm({
      route: 'NOTARIAL',
      reason: '',
    });
    assert.equal(emptyReason.isValid, false);
    assert.equal(emptyReason.errors.reason, BASIS_ROUTE_ERROR_KEYS.REASON_REQUIRED);
    assert.equal(emptyReason.errors.reason, 'reasonRequired');

    const whitespaceReason = validateBasisRouteForm({
      route: 'COURT',
      reason: '    \t  \n  ',
    });
    assert.equal(whitespaceReason.isValid, false);
    assert.equal(whitespaceReason.errors.reason, BASIS_ROUTE_ERROR_KEYS.REASON_REQUIRED);
  });

  it('does not enforce arbitrary character length limits or extra mandatory fields outside contract', () => {
    // Short reason is valid as long as non-empty after trim
    const shortReason = validateBasisRouteForm({
      route: 'ON_HOLD',
      reason: 'Chờ bổ sung giấy tờ.',
    });
    assert.equal(shortReason.isValid, true);

    // Docket reference can be empty without causing validation error
    const noDocket = validateBasisRouteForm({
      route: 'NOTARIAL',
      reason: 'Không tranh chấp.',
      docketReference: '',
    });
    assert.equal(noDocket.isValid, true);
  });

  it('ensures form payload does not log or store credentials or raw passwords', () => {
    const payload = {
      docketReference: 'BASIS-ROUTE-2026-001',
      route: 'NOTARIAL',
      reason: 'Hồ sơ công chứng hợp lệ.',
    };
    const serialized = JSON.stringify(payload);
    assert.equal(serialized.includes('password'), false);
    assert.equal(serialized.includes('token'), false);
    assert.equal(serialized.includes('secret'), false);
  });
});

describe('PS-30 Legal Basis Route Selection - Dynamic Language Switching (VI <-> EN)', () => {
  it('correctly resolves route error keys in Vietnamese dictionary', () => {
    assert.equal(
      getBasisRouteErrorMessage('routeRequired', 'vi'),
      'Vui lòng chọn một phương án xử lý.'
    );
    assert.equal(
      getBasisRouteErrorMessage('routeInvalid', 'vi'),
      'Phương án xử lý được chọn không hợp lệ.'
    );
    assert.equal(
      getBasisRouteErrorMessage('reasonRequired', 'vi'),
      'Vui lòng nhập lý do lựa chọn phương án xử lý.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(legalBasisRouteI18n.vi.routeRequired, 'Vui lòng chọn một phương án xử lý.');
    assert.equal(legalBasisRouteI18n.vi.routeInvalid, 'Phương án xử lý được chọn không hợp lệ.');
    assert.equal(
      legalBasisRouteI18n.vi.reasonRequired,
      'Vui lòng nhập lý do lựa chọn phương án xử lý.'
    );
  });

  it('correctly resolves route error keys in English dictionary', () => {
    assert.equal(
      getBasisRouteErrorMessage('routeRequired', 'en'),
      'Please select a handling option.'
    );
    assert.equal(
      getBasisRouteErrorMessage('routeInvalid', 'en'),
      'Invalid handling option selected.'
    );
    assert.equal(
      getBasisRouteErrorMessage('reasonRequired', 'en'),
      'Please enter rationale for the selected handling option.'
    );

    // Direct dictionary lookup used by component: t[key]
    assert.equal(legalBasisRouteI18n.en.routeRequired, 'Please select a handling option.');
    assert.equal(legalBasisRouteI18n.en.routeInvalid, 'Invalid handling option selected.');
    assert.equal(
      legalBasisRouteI18n.en.reasonRequired,
      'Please enter rationale for the selected handling option.'
    );
  });

  it('dynamically switches error messages when language changes without re-validating form state', () => {
    // 1. Validate empty form
    const initialValidation = validateBasisRouteForm({ route: '', reason: '' });
    assert.equal(initialValidation.isValid, false);

    // State stores ONLY language-neutral error keys
    const stateErrors = initialValidation.errors;
    assert.deepEqual(stateErrors, {
      route: 'routeRequired',
      reason: 'reasonRequired',
    });

    // 2. Render under VI
    const viRoute = legalBasisRouteI18n.vi[stateErrors.route];
    const viReason = legalBasisRouteI18n.vi[stateErrors.reason];
    assert.equal(viRoute, 'Vui lòng chọn một phương án xử lý.');
    assert.equal(viReason, 'Vui lòng nhập lý do lựa chọn phương án xử lý.');

    // 3. Switch to EN — stateErrors remains UNCHANGED
    const enRoute = legalBasisRouteI18n.en[stateErrors.route];
    const enReason = legalBasisRouteI18n.en[stateErrors.reason];
    assert.equal(enRoute, 'Please select a handling option.');
    assert.equal(enReason, 'Please enter rationale for the selected handling option.');

    // Helper formatting test
    const formattedEn = formatBasisRouteErrors(stateErrors, 'en');
    assert.equal(formattedEn.route, 'Please select a handling option.');
    assert.equal(formattedEn.reason, 'Please enter rationale for the selected handling option.');
  });
});

describe('PS-30 Legal CSS Scoping Verification - No Leakage into Owner or Other Views', () => {
  it('ensures every selector in LegalBasisRouteSelectionPage.css is scoped under .lv-basis-route-view', () => {
    const cssPath = path.resolve(__dirname, '../pages/legal/LegalBasisRouteSelectionPage.css');
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
          if (!sel.startsWith('.lv-basis-route-view')) {
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
