import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path, { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import {
  canAccessCloseArchive,
  normalizeSafeIntegerCount,
  isCaseArchived,
  evaluateCloseArchivePreconditions,
  CLOSE_ARCHIVE_ELIGIBILITY_STATUS,
  CLOSE_ARCHIVE_CONDITIONS,
} from './closeAndArchiveValidation.js';
import { closeAndArchiveI18n } from '../pages/staff/closeAndArchiveI18n.js';

test('PS-56 Staff Role & Session Guard (canAccessCloseArchive)', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessCloseArchive(null), false);
    assert.equal(canAccessCloseArchive(undefined), false);
    assert.equal(
      canAccessCloseArchive({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      false
    );
  });

  await t.test('rejects access when user lacks STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCloseArchive({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
    assert.equal(
      canAccessCloseArchive({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['LEGAL_VERIFIER'] },
      }),
      false
    );
  });

  await t.test('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCloseArchive({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      true
    );
  });

  await t.test('grants access when user has multiple roles including STAFF_EXECUTOR', () => {
    assert.equal(
      canAccessCloseArchive({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR', 'LEGAL_VERIFIER'] },
      }),
      true
    );
  });
});

test('PS-56 Strict Safe Integer Counter Validation (normalizeSafeIntegerCount)', async (t) => {
  await t.test('accepts valid non-negative safe integers', () => {
    assert.equal(normalizeSafeIntegerCount(0), 0);
    assert.equal(normalizeSafeIntegerCount(1), 1);
    assert.equal(normalizeSafeIntegerCount(42), 42);
    assert.equal(normalizeSafeIntegerCount(Number.MAX_SAFE_INTEGER), Number.MAX_SAFE_INTEGER);
  });

  await t.test('strictly rejects non-number types without coercion', () => {
    assert.equal(normalizeSafeIntegerCount(''), null);
    assert.equal(normalizeSafeIntegerCount(' '), null);
    assert.equal(normalizeSafeIntegerCount('0'), null);
    assert.equal(normalizeSafeIntegerCount('42'), null);
    assert.equal(normalizeSafeIntegerCount(false), null);
    assert.equal(normalizeSafeIntegerCount(true), null);
    assert.equal(normalizeSafeIntegerCount(null), null);
    assert.equal(normalizeSafeIntegerCount(undefined), null);
    assert.equal(normalizeSafeIntegerCount({}), null);
    assert.equal(normalizeSafeIntegerCount([]), null);
  });

  await t.test('strictly rejects invalid numbers (NaN, Infinity, negative, floating point)', () => {
    assert.equal(normalizeSafeIntegerCount(NaN), null);
    assert.equal(normalizeSafeIntegerCount(Infinity), null);
    assert.equal(normalizeSafeIntegerCount(-Infinity), null);
    assert.equal(normalizeSafeIntegerCount(-1), null);
    assert.equal(normalizeSafeIntegerCount(-42), null);
    assert.equal(normalizeSafeIntegerCount(1.5), null);
    assert.equal(normalizeSafeIntegerCount(3.14159), null);
  });
});

test('PS-56 Read-Only Archived State Detection (isCaseArchived)', async (t) => {
  await t.test('identifies case as archived when vaultStatus is ARCHIVED', () => {
    assert.equal(isCaseArchived('ARCHIVED', 'IN_PROGRESS'), true);
    assert.equal(isCaseArchived('archived', 'IN_PROGRESS'), true);
  });

  await t.test('identifies case as archived when caseStatus is CLOSED', () => {
    assert.equal(isCaseArchived('OPEN', 'CLOSED'), true);
    assert.equal(isCaseArchived('OPEN', 'closed'), true);
  });

  await t.test('identifies case as NOT archived when vault is OPEN and case is IN_PROGRESS', () => {
    assert.equal(isCaseArchived('OPEN', 'IN_PROGRESS'), false);
    assert.equal(isCaseArchived('LOCKED', 'IN_PROGRESS'), false);
    assert.equal(isCaseArchived(null, undefined), false);
  });
});

test('PS-56 Close & Archive Preconditions (LV-CLOSE-001 Dual 100% Verification)', async (t) => {
  await t.test('evaluates to ELIGIBLE when assets 100% AND beneficiaries 100%', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 4, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isEligible, true);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.ELIGIBLE);
    assert.equal(res.isAssetComplete, true);
    assert.equal(res.isBeneficiaryComplete, true);
    assert.equal(res.unmetConditions.length, 0);
  });

  await t.test('evaluates to INELIGIBLE when assets < 100% but beneficiaries 100%', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 3, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(res.isAssetComplete, false);
    assert.equal(res.isBeneficiaryComplete, true);
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.ASSET_DELIVERY_INCOMPLETE));
  });

  await t.test('evaluates to INELIGIBLE when beneficiaries < 100% but assets 100%', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 4, total: 4 },
      { confirmed: 1, total: 2 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INELIGIBLE);
    assert.equal(res.isAssetComplete, true);
    assert.equal(res.isBeneficiaryComplete, false);
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE));
  });

  await t.test('relies on direct count equality (delivered === total), NOT rounded percentage', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 999, total: 1000 },
      { confirmed: 5, total: 5 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.isAssetComplete, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INELIGIBLE);
  });
});

test('PS-56 Missing Count, Zero Count, and Out-of-Bounds Protection', async (t) => {
  await t.test('0/0 is NEVER eligible and evaluates to INDETERMINATE', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 0, total: 0 },
      { confirmed: 0, total: 0 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE);
    assert.equal(res.isAssetValid, false);
    assert.equal(res.isBeneficiaryValid, false);
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.ASSET_DATA_UNAVAILABLE));
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE));
  });

  await t.test('delivered > total is rejected as INDETERMINATE', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 5, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE);
    assert.equal(res.isAssetValid, false);
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.ASSET_DATA_UNAVAILABLE));
  });

  await t.test('confirmed > total is rejected as INDETERMINATE', () => {
    const res = evaluateCloseArchivePreconditions(
      { delivered: 4, total: 4 },
      { confirmed: 3, total: 2 }
    );
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE);
    assert.equal(res.isBeneficiaryValid, false);
    assert.ok(res.unmetConditions.includes(CLOSE_ARCHIVE_CONDITIONS.BENEFICIARY_DATA_UNAVAILABLE));
  });

  await t.test('missing data (null/undefined) evaluates to INDETERMINATE', () => {
    const res = evaluateCloseArchivePreconditions(null, undefined);
    assert.equal(res.isEligible, false);
    assert.equal(res.eligibilityStatus, CLOSE_ARCHIVE_ELIGIBILITY_STATUS.INDETERMINATE);
  });
});

test('PS-56 Terminology & Status Accuracy', async (t) => {
  const vi = closeAndArchiveI18n.vi;
  const en = closeAndArchiveI18n.en;

  await t.test('uses "Phiên bàn giao" (Handover Session), NOT "Phiên thẩm định"', () => {
    assert.equal(vi.sessionStatusLabel, 'Phiên bàn giao');
    assert.equal(en.sessionStatusLabel, 'Handover Session');
    assert.ok(!vi.sessionStatusLabel.includes('thẩm định'));
  });

  await t.test('provides "Chưa có thông tin" for missing or invalid server statuses', () => {
    assert.equal(vi.statusUnavailable, 'Chưa có thông tin');
    assert.equal(en.statusUnavailable, 'Information unavailable');
  });

  await t.test('distinguishes between empty receipts and unavailable receipt data in i18n', () => {
    assert.ok(vi.receiptEmptyTitle);
    assert.ok(vi.receiptsUnavailableTitle);
    assert.notEqual(vi.receiptEmptyTitle, vi.receiptsUnavailableTitle);

    assert.ok(en.receiptEmptyTitle);
    assert.ok(en.receiptsUnavailableTitle);
    assert.notEqual(en.receiptEmptyTitle, en.receiptsUnavailableTitle);
  });

  await t.test('contains ONLY "Chức năng hiện chưa khả dụng" without API/server explanations on UI', () => {
    assert.equal(vi.functionUnavailableNotice, 'Chức năng hiện chưa khả dụng');
    assert.equal(en.functionUnavailableNotice, 'This function is currently unavailable');
    // Ensure no backend/API explanatory field exists
    assert.equal(vi.actionDisabledExpl, undefined);
    assert.equal(en.actionDisabledExpl, undefined);
  });
});

test('PS-56 CSS Scoping Verification - No Leakage', () => {
  const cssPath = path.resolve(__dirname, '../pages/staff/CloseAndArchivePage.css');
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
          s.startsWith('.lv-close-archive-view'),
          `Selector "${s}" in CloseAndArchivePage.css must start with .lv-close-archive-view`
        );
      }
    }
  }
});
