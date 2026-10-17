import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessCompletionProgress,
  evaluateCompletionProgress,
  COMPLETION_PROGRESS_STATUS,
  COMPLETION_MISSING_CONDITIONS,
} from './completionProgressValidation.js';
import { completionProgressI18n } from '../pages/staff/completionProgressI18n.js';

test('PS-55 Route & Client Role Guard', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessCompletionProgress(null), false);
    assert.equal(canAccessCompletionProgress(undefined), false);
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      false
    );
  });

  await t.test('rejects access when user lacks STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['LEGAL_VERIFIER'] },
      }),
      false
    );
  });

  await t.test('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      true
    );
  });

  await t.test('grants access when user holds multi-roles including STAFF_EXECUTOR', () => {
    assert.equal(
      canAccessCompletionProgress({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] },
      }),
      true
    );
  });
});

test('PS-55 LV-CLOSE-001 Dual 100% AND Condition Evaluation', async (t) => {
  await t.test('evaluates to COMPLETED when assets 100% AND beneficiaries 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 4, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isComplete, true);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.COMPLETED);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.is100, true);
    assert.equal(res.missingConditions.length, 0);
  });

  await t.test('evaluates to INCOMPLETE when assets 100% but beneficiaries < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 4, total: 4 },
      { confirmed: 1, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.is100, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE));
  });

  await t.test('evaluates to INCOMPLETE when beneficiaries 100% but assets < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: 4 },
      { confirmed: 2, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, false);
    assert.equal(res.beneficiaryMetric.is100, true);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE));
  });

  await t.test('evaluates to INCOMPLETE when both metrics < 100%', () => {
    const res = evaluateCompletionProgress(
      { delivered: 1, total: 4 },
      { confirmed: 0, total: 2 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.INCOMPLETE);
    assert.equal(res.assetMetric.is100, false);
    assert.equal(res.beneficiaryMetric.is100, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_DELIVERY_INCOMPLETE));
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.BENEFICIARY_CONFIRMATION_INCOMPLETE));
  });
});

test('PS-55 Missing Count & Zero Count (0/0) Protection', async (t) => {
  await t.test('0/0 is NEVER treated as complete and evaluates to PENDING_VERIFICATION', () => {
    const res = evaluateCompletionProgress(
      { delivered: 0, total: 0 },
      { confirmed: 0, total: 0 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.PENDING_VERIFICATION);
    assert.equal(res.assetMetric.isVerified, false);
    assert.equal(res.beneficiaryMetric.isVerified, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ZERO_TOTAL_AWAITING_CONFIRMATION));
  });

  await t.test('assets 100% (2/2) but beneficiaries 0/0 does not complete', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: 2 },
      { confirmed: 0, total: 0 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.PENDING_VERIFICATION);
    assert.equal(res.assetMetric.is100, true);
    assert.equal(res.beneficiaryMetric.isVerified, false);
  });

  await t.test('missing or null total count flags as unverified and blocks completion', () => {
    const res = evaluateCompletionProgress(
      { delivered: 2, total: null },
      { confirmed: 1, total: 1 }
    );
    assert.equal(res.isComplete, false);
    assert.equal(res.overallStatus, COMPLETION_PROGRESS_STATUS.PENDING_VERIFICATION);
    assert.equal(res.assetMetric.isVerified, false);
    assert.ok(res.missingConditions.includes(COMPLETION_MISSING_CONDITIONS.ASSET_TOTAL_UNVERIFIED));
  });

  await t.test('calculates independent ratios without blending percentages', () => {
    const res = evaluateCompletionProgress(
      { delivered: 1, total: 2 }, // 50%
      { confirmed: 1, total: 4 }  // 25%
    );
    assert.equal(res.assetMetric.percentage, 50);
    assert.equal(res.beneficiaryMetric.percentage, 25);
    // There is no combined percentage field
    assert.equal(res.combinedPercentage, undefined);
  });
});

test('PS-55 Dynamic Language Switching (VI <-> EN)', () => {
  const vi = completionProgressI18n.vi;
  const en = completionProgressI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  // Missing conditions resolution
  for (const cond of Object.values(COMPLETION_MISSING_CONDITIONS)) {
    assert.ok(vi[cond], `Missing VI translation for ${cond}`);
    assert.ok(en[cond], `Missing EN translation for ${cond}`);
  }
});

test('PS-55 CSS Scoping Verification - No Leakage', () => {
  const cssPath = resolve('src/pages/staff/CompletionProgressPage.css');
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
          s.startsWith('.lv-completion-progress-view'),
          `Selector "${s}" in CompletionProgressPage.css must start with .lv-completion-progress-view`
        );
      }
    }
  }
});
