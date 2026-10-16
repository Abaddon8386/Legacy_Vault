import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canAccessLegalDossierReview,
  validateLegalDossierReviewForm,
  checkDossierReviewStatus,
  isDossierReviewStale,
  isValidDossierVersion,
  formatDossierVersion,
  LEGAL_DOSSIER_REVIEW_ERROR_KEYS,
  getLegalDossierReviewErrorMessage,
  formatLegalDossierReviewErrors,
} from './legalDossierReviewValidation.js';
import { legalDossierReviewI18n } from '../pages/legal/legalDossierReviewI18n.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

describe('PS-32 Legal Dossier Review - Route & Client Role Guard', () => {
  it('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessLegalDossierReview(null), false);
    assert.equal(canAccessLegalDossierReview(undefined), false);
    assert.equal(canAccessLegalDossierReview({}), false);

    const expiredSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() - 1000,
      user: { id: 'u1', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalDossierReview(expiredSession), false);
  });

  it('rejects access when session is active but user lacks LEGAL_VERIFIER role', () => {
    const ownerSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60000,
      user: { id: 'u1', roles: ['VAULT_OWNER'] },
    };
    assert.equal(canAccessLegalDossierReview(ownerSession), false);

    const staffSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60000,
      user: { id: 'u2', roles: ['STAFF_EXECUTOR'] },
    };
    assert.equal(canAccessLegalDossierReview(staffSession), false);

    const adminSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60000,
      user: { id: 'u3', roles: ['ADMIN'] },
    };
    assert.equal(canAccessLegalDossierReview(adminSession), false);
  });

  it('grants access when session is active and user has LEGAL_VERIFIER role', () => {
    const legalSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60000,
      user: { id: 'u4', roles: ['LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalDossierReview(legalSession), true);
  });

  it('grants access when user holds multiple roles including LEGAL_VERIFIER', () => {
    const multiSession = {
      accessToken: 'token-123',
      expiresAt: Date.now() + 60000,
      user: { id: 'u5', roles: ['VAULT_OWNER', 'LEGAL_VERIFIER'] },
    };
    assert.equal(canAccessLegalDossierReview(multiSession), true);
  });
});

describe('PS-32 Legal Dossier Review - Form Validation & Review Decisions', () => {
  it('accepts the four AC review decisions: APPROVE, REJECT, HOLD, RE_REVIEW', () => {
    const decisions = ['APPROVE', 'REJECT', 'HOLD', 'RE_REVIEW'];
    for (const dec of decisions) {
      const res = validateLegalDossierReviewForm({ decision: dec });
      assert.equal(res.isValid, true);
      assert.deepEqual(res.errors, {});
    }
  });

  it('fails when decision is missing or whitespace-only', () => {
    const empty = validateLegalDossierReviewForm({ decision: '' });
    assert.equal(empty.isValid, false);
    assert.equal(
      empty.errors.decision,
      LEGAL_DOSSIER_REVIEW_ERROR_KEYS.DECISION_REQUIRED
    );

    const whitespace = validateLegalDossierReviewForm({ decision: '   ' });
    assert.equal(whitespace.isValid, false);
    assert.equal(
      whitespace.errors.decision,
      LEGAL_DOSSIER_REVIEW_ERROR_KEYS.DECISION_REQUIRED
    );
  });

  it('fails when decision is an invalid arbitrary string', () => {
    const invalid = validateLegalDossierReviewForm({ decision: 'ARBITRARY_STATUS' });
    assert.equal(invalid.isValid, false);
    assert.equal(
      invalid.errors.decision,
      LEGAL_DOSSIER_REVIEW_ERROR_KEYS.DECISION_INVALID
    );
  });

  it('does not force review note to be mandatory when not constrained by contract', () => {
    const resWithoutNote = validateLegalDossierReviewForm({ decision: 'APPROVE' });
    assert.equal(resWithoutNote.isValid, true);

    const resWithNote = validateLegalDossierReviewForm({
      decision: 'APPROVE',
      note: 'Dossier fully verified against notarial records.',
    });
    assert.equal(resWithNote.isValid, true);
  });
});

describe('PS-32 Legal Dossier Review - Dossier Identifier & Freshness Logic', () => {
  it('identifies MISMATCH when review record belongs to a different dossier id', () => {
    const currentDossier = { id: 'dossier-A', version: 2, sha256: 'hash-A' };
    const foreignRecord = { dossierId: 'dossier-B', version: 1, sha256: 'hash-B' };

    const status = checkDossierReviewStatus(currentDossier, foreignRecord);
    assert.equal(status, 'MISMATCH');
    // Cannot be treated as a stale review of the current dossier
    assert.equal(isDossierReviewStale(currentDossier, foreignRecord), false);
    // Non-stale result must NOT be misconstrued as fresh
    assert.notEqual(status, 'FRESH');
  });

  it('identifies INDETERMINATE when dossier objects or identifiers are missing', () => {
    // Missing either side entirely
    assert.equal(checkDossierReviewStatus(null, null), 'INDETERMINATE');
    assert.equal(checkDossierReviewStatus({ id: 'dossier-1' }, null), 'INDETERMINATE');
    assert.equal(checkDossierReviewStatus(null, { dossierId: 'dossier-1' }), 'INDETERMINATE');

    // Missing dossier ID on current dossier
    const unindentifiedDossier = { version: 2, sha256: 'hash' };
    const validRecord = { dossierId: 'dossier-1', version: 2, sha256: 'hash' };
    assert.equal(
      checkDossierReviewStatus(unindentifiedDossier, validRecord),
      'INDETERMINATE'
    );

    // Missing dossierId on reviewed record
    const validDossier = { id: 'dossier-1', version: 2, sha256: 'hash' };
    const recordWithoutDossierId = { version: 2, sha256: 'hash' };
    assert.equal(
      checkDossierReviewStatus(validDossier, recordWithoutDossierId),
      'INDETERMINATE'
    );
  });

  it('identifies INDETERMINATE when version or hash is missing on either side', () => {
    const baseDossier = { id: 'dossier-1', version: 2, sha256: 'sha256-abc' };
    const baseRecord = { dossierId: 'dossier-1', version: 2, sha256: 'sha256-abc' };

    // Missing version on current dossier
    const dossierNoVer = { id: 'dossier-1', sha256: 'sha256-abc' };
    const statusNoCurVer = checkDossierReviewStatus(dossierNoVer, baseRecord);
    assert.equal(statusNoCurVer, 'INDETERMINATE');
    assert.equal(isDossierReviewStale(dossierNoVer, baseRecord), false);
    assert.notEqual(statusNoCurVer, 'FRESH');

    // Missing version on reviewed record
    const recordNoVer = { dossierId: 'dossier-1', sha256: 'sha256-abc' };
    const statusNoRevVer = checkDossierReviewStatus(baseDossier, recordNoVer);
    assert.equal(statusNoRevVer, 'INDETERMINATE');
    assert.equal(isDossierReviewStale(baseDossier, recordNoVer), false);
    assert.notEqual(statusNoRevVer, 'FRESH');

    // Missing sha256 on current dossier
    const dossierNoHash = { id: 'dossier-1', version: 2 };
    const statusNoCurHash = checkDossierReviewStatus(dossierNoHash, baseRecord);
    assert.equal(statusNoCurHash, 'INDETERMINATE');
    assert.equal(isDossierReviewStale(dossierNoHash, baseRecord), false);
    assert.notEqual(statusNoCurHash, 'FRESH');

    // Missing sha256 on reviewed record
    const recordNoHash = { dossierId: 'dossier-1', version: 2 };
    const statusNoRevHash = checkDossierReviewStatus(baseDossier, recordNoHash);
    assert.equal(statusNoRevHash, 'INDETERMINATE');
    assert.equal(isDossierReviewStale(baseDossier, recordNoHash), false);
    assert.notEqual(statusNoRevHash, 'FRESH');

    // Empty or whitespace hash
    const recordEmptyHash = { dossierId: 'dossier-1', version: 2, sha256: '   ' };
    assert.equal(
      checkDossierReviewStatus(baseDossier, recordEmptyHash),
      'INDETERMINATE'
    );
  });

  it('does NOT recognize uncontracted alias fields as valid metrics', () => {
    const currentDossier = { id: 'dossier-1', version: 2, sha256: 'sha256-abc' };
    // Provided dossierVersion and dossierHash instead of standard version and sha256
    const aliasRecord = {
      dossierId: 'dossier-1',
      dossierVersion: 2,
      dossierHash: 'sha256-abc',
    };

    // Because version and sha256 are missing, must evaluate to INDETERMINATE, not FRESH
    const status = checkDossierReviewStatus(currentDossier, aliasRecord);
    assert.equal(status, 'INDETERMINATE');
    assert.notEqual(status, 'FRESH');
  });

  it('identifies STALE when same dossier has a strictly higher version', () => {
    const currentDossier = { id: 'dossier-1', version: 3, sha256: 'sha256-v3' };
    const reviewedRecord = { dossierId: 'dossier-1', version: 2, sha256: 'sha256-v2' };

    assert.equal(checkDossierReviewStatus(currentDossier, reviewedRecord), 'STALE');
    assert.equal(isDossierReviewStale(currentDossier, reviewedRecord), true);
  });

  it('identifies STALE when current dossier version is LOWER than reviewed record version', () => {
    // Current version lower: review is still NOT valid / effective
    const currentDossier = { id: 'dossier-1', version: 1, sha256: 'sha256-v1' };
    const reviewedRecord = { dossierId: 'dossier-1', version: 2, sha256: 'sha256-v2' };

    assert.equal(checkDossierReviewStatus(currentDossier, reviewedRecord), 'STALE');
    assert.equal(isDossierReviewStale(currentDossier, reviewedRecord), true);
  });

  it('identifies STALE when same dossier version has a changed content hash', () => {
    const currentDossier = { id: 'dossier-1', version: 2, sha256: 'sha256-tampered' };
    const reviewedRecord = { dossierId: 'dossier-1', version: 2, sha256: 'sha256-original' };

    assert.equal(checkDossierReviewStatus(currentDossier, reviewedRecord), 'STALE');
    assert.equal(isDossierReviewStale(currentDossier, reviewedRecord), true);
  });

  it('identifies FRESH ONLY when same dossier matches both version and hash completely', () => {
    const currentDossier = { id: 'dossier-1', version: 2, sha256: 'sha256-v2' };
    const reviewedRecord = { dossierId: 'dossier-1', version: 2, sha256: 'sha256-v2' };

    assert.equal(checkDossierReviewStatus(currentDossier, reviewedRecord), 'FRESH');
    assert.equal(isDossierReviewStale(currentDossier, reviewedRecord), false);
  });
});

describe('PS-32 Legal Dossier Review - Dynamic Language Switching (VI <-> EN)', () => {
  it('correctly resolves decision error keys in Vietnamese dictionary', () => {
    assert.equal(
      getLegalDossierReviewErrorMessage('decisionRequired', 'vi'),
      'Vui lòng chọn một kết quả thẩm định.'
    );
    assert.equal(
      getLegalDossierReviewErrorMessage('decisionInvalid', 'vi'),
      'Kết quả thẩm định không hợp lệ.'
    );
  });

  it('correctly resolves decision error keys in English dictionary', () => {
    assert.equal(
      getLegalDossierReviewErrorMessage('decisionRequired', 'en'),
      'Please select a review decision.'
    );
    assert.equal(
      getLegalDossierReviewErrorMessage('decisionInvalid', 'en'),
      'Invalid review decision.'
    );
  });

  it('dynamically switches error messages without re-validating form state', () => {
    const validation = validateLegalDossierReviewForm({ decision: '' });
    assert.equal(validation.isValid, false);
    const stateErrors = validation.errors;
    assert.deepEqual(stateErrors, { decision: 'decisionRequired' });

    // Render in VI
    const viMsg = legalDossierReviewI18n.vi[stateErrors.decision];
    assert.equal(viMsg, 'Vui lòng chọn một kết quả thẩm định.');

    // Switch to EN
    const enMsg = legalDossierReviewI18n.en[stateErrors.decision];
    assert.equal(enMsg, 'Please select a review decision.');

    const formattedEn = formatLegalDossierReviewErrors(stateErrors, 'en');
    assert.equal(formattedEn.decision, 'Please select a review decision.');
  });
});

describe('PS-32 Legal CSS Scoping Verification - No Leakage into Other Views', () => {
  it('ensures every selector in LegalDossierReviewPage.css is scoped under .lv-legal-dossier-review-view', () => {
    const cssPath = path.resolve(__dirname, '../pages/legal/LegalDossierReviewPage.css');
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
          if (!sel.startsWith('.lv-legal-dossier-review-view')) {
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

describe('PS-32 Regression Tests - Strict Version Validation & Coercion Resistance', () => {
  it('validates legitimate positive safe integer versions only', () => {
    assert.equal(isValidDossierVersion(1), true);
    assert.equal(isValidDossierVersion(2), true);
    assert.equal(isValidDossierVersion('1'), true);
    assert.equal(isValidDossierVersion('  10  '), true);

    // Invalid numbers and coercible non-numbers
    assert.equal(isValidDossierVersion(''), false);
    assert.equal(isValidDossierVersion('   '), false);
    assert.equal(isValidDossierVersion(false), false);
    assert.equal(isValidDossierVersion(true), false);
    assert.equal(isValidDossierVersion(Infinity), false);
    assert.equal(isValidDossierVersion(-Infinity), false);
    assert.equal(isValidDossierVersion(NaN), false);
    assert.equal(isValidDossierVersion(0), false);
    assert.equal(isValidDossierVersion(-1), false);
    assert.equal(isValidDossierVersion(1.5), false);
    assert.equal(isValidDossierVersion('1.5'), false);
    assert.equal(isValidDossierVersion('0'), false);
    assert.equal(isValidDossierVersion(null), false);
    assert.equal(isValidDossierVersion(undefined), false);
    assert.equal(isValidDossierVersion({}), false);
    assert.equal(isValidDossierVersion([]), false);
  });

  it('evaluates to INDETERMINATE (never FRESH) when both sides receive identical coercible falsy/infinite values ("", " ", false, Infinity)', () => {
    const invalidValues = ['', '   ', false, Infinity, -Infinity, NaN, 0, -1, null, undefined];

    for (const badVal of invalidValues) {
      const currentDossier = {
        id: 'dossier-rec-1',
        version: badVal,
        sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
      };
      const lastReviewedRecord = {
        dossierId: 'dossier-rec-1',
        version: badVal,
        sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
      };

      const result = checkDossierReviewStatus(currentDossier, lastReviewedRecord);
      assert.equal(
        result,
        'INDETERMINATE',
        `Expected INDETERMINATE for invalid version ${JSON.stringify(badVal)}, but got ${result}`
      );
      assert.notEqual(
        result,
        'FRESH',
        `Coercion vulnerability: version ${JSON.stringify(badVal)} must never evaluate to FRESH`
      );
      assert.equal(isDossierReviewStale(currentDossier, lastReviewedRecord), false);
    }
  });

  it('evaluates to INDETERMINATE when one side has an invalid version and the other side is valid', () => {
    const validDossier = {
      id: 'dossier-rec-2',
      version: 1,
      sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
    };

    const invalidVariants = ['', '   ', false, Infinity, NaN, 0, null, undefined, 'abc'];

    for (const invalidVer of invalidVariants) {
      // 1. Current valid, record invalid
      const recordInvalid = {
        dossierId: 'dossier-rec-2',
        version: invalidVer,
        sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
      };
      const result1 = checkDossierReviewStatus(validDossier, recordInvalid);
      assert.equal(result1, 'INDETERMINATE');
      assert.notEqual(result1, 'FRESH');

      // 2. Current invalid, record valid
      const currentInvalid = {
        id: 'dossier-rec-2',
        version: invalidVer,
        sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
      };
      const recordValid = {
        dossierId: 'dossier-rec-2',
        version: 1,
        sha256: 'f568a834b9d0b63b2a2b3780360a08e1d6d6e2468352e804f378a57467615951',
      };
      const result2 = checkDossierReviewStatus(currentInvalid, recordValid);
      assert.equal(result2, 'INDETERMINATE');
      assert.notEqual(result2, 'FRESH');
    }
  });

  it('evaluates to FRESH when both sides have complete, valid, and strictly matching information', () => {
    const currentDossier = {
      id: 'dossier-rec-3',
      version: 2,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };
    const lastReviewedRecord = {
      dossierId: 'dossier-rec-3',
      version: 2,
      sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    };

    assert.equal(checkDossierReviewStatus(currentDossier, lastReviewedRecord), 'FRESH');
    assert.equal(isDossierReviewStale(currentDossier, lastReviewedRecord), false);
  });
});

describe('PS-32 Regression Tests - Review History Version Formatting & Absence of Fake v1', () => {
  it('correctly formats valid versions as v{version}', () => {
    assert.equal(formatDossierVersion(1, 'vi'), 'v1');
    assert.equal(formatDossierVersion(2, 'vi'), 'v2');
    assert.equal(formatDossierVersion('3', 'vi'), 'v3');
    assert.equal(formatDossierVersion(1, 'en'), 'v1');
    assert.equal(formatDossierVersion(2, 'en'), 'v2');
    assert.equal(formatDossierVersion('10', 'en'), 'v10');
  });

  it('displays "Chưa có thông tin" (vi) or "Not available" (en) for missing/invalid versions without assuming v1', () => {
    const invalidVersions = [
      null,
      undefined,
      '',
      '   ',
      false,
      true,
      Infinity,
      -Infinity,
      NaN,
      0,
      -1,
      'abc',
      {},
      [],
    ];

    for (const badVer of invalidVersions) {
      const viDisplay = formatDossierVersion(badVer, 'vi');
      const enDisplay = formatDossierVersion(badVer, 'en');

      assert.equal(
        viDisplay,
        'Chưa có thông tin',
        `Expected "Chưa có thông tin" for ${JSON.stringify(badVer)}, got "${viDisplay}"`
      );
      assert.equal(
        enDisplay,
        'Not available',
        `Expected "Not available" for ${JSON.stringify(badVer)}, got "${enDisplay}"`
      );

      // Crucial assertion: never emit synthetic v1
      assert.equal(
        viDisplay.includes('v1'),
        false,
        `Must not synthesize "v1" for missing/invalid version: ${JSON.stringify(badVer)}`
      );
      assert.equal(
        enDisplay.includes('v1'),
        false,
        `Must not synthesize "v1" for missing/invalid version: ${JSON.stringify(badVer)}`
      );
    }
  });

  it('renders history items with formatDossierVersion preserving raw item intact', () => {
    const mockHistoryItemMissingVer = {
      id: 'h1',
      version: null,
      decision: 'APPROVE',
      createdAt: '2026-10-16 10:00:00',
    };

    const renderedVi = formatDossierVersion(mockHistoryItemMissingVer.version, 'vi');
    assert.equal(renderedVi, 'Chưa có thông tin');
    // Ensure raw item is not mutated
    assert.equal(mockHistoryItemMissingVer.version, null);

    const mockHistoryItemEmptyVer = {
      id: 'h2',
      version: '',
      decision: 'HOLD',
      createdAt: '2026-10-16 11:00:00',
    };
    const renderedEn = formatDossierVersion(mockHistoryItemEmptyVer.version, 'en');
    assert.equal(renderedEn, 'Not available');
    assert.equal(mockHistoryItemEmptyVer.version, '');
  });
});
