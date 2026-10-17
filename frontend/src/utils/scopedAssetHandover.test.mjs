import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  canAccessScopedAssetHandover,
  validateApprovedAllocationScope,
  filterScopedHandoverItems,
  validateHandoverAttempt,
  SCOPED_ASSET_HANDOVER_ERROR_KEYS,
  HANDOVER_STATUS,
} from './scopedAssetHandoverValidation.js';
import { scopedAssetHandoverI18n } from '../pages/staff/scopedAssetHandoverI18n.js';

test('PS-53 Route & Client Role Guard', async (t) => {
  await t.test('rejects access when session is null, undefined, or expired', () => {
    assert.equal(canAccessScopedAssetHandover(null), false);
    assert.equal(canAccessScopedAssetHandover(undefined), false);
    assert.equal(
      canAccessScopedAssetHandover({
        accessToken: 'token-123',
        expiresAt: Date.now() - 1000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      false
    );
  });

  await t.test('rejects access when user lacks STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessScopedAssetHandover({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER'] },
      }),
      false
    );
    assert.equal(
      canAccessScopedAssetHandover({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['LEGAL_VERIFIER'] },
      }),
      false
    );
  });

  await t.test('grants access when session is active and user has STAFF_EXECUTOR role', () => {
    assert.equal(
      canAccessScopedAssetHandover({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['STAFF_EXECUTOR'] },
      }),
      true
    );
  });

  await t.test('grants access when user holds multi-roles including STAFF_EXECUTOR', () => {
    assert.equal(
      canAccessScopedAssetHandover({
        accessToken: 'token-123',
        expiresAt: Date.now() + 60000,
        user: { roles: ['VAULT_OWNER', 'STAFF_EXECUTOR'] },
      }),
      true
    );
  });
});

test('PS-53 Approved Allocation Scope Validation', async (t) => {
  await t.test('rejects null, undefined or non-object scope', () => {
    const resNull = validateApprovedAllocationScope(null);
    assert.equal(resNull.isValid, false);
    assert.equal(resNull.errorKey, SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED);

    const resUndefined = validateApprovedAllocationScope(undefined);
    assert.equal(resUndefined.isValid, false);
  });

  await t.test('rejects unapproved scope', () => {
    const res = validateApprovedAllocationScope({
      status: 'PENDING',
      allocations: [{ assetId: 'a1', beneficiaryId: 'b1' }],
    });
    assert.equal(res.isValid, false);
    assert.equal(res.isApproved, false);
    assert.equal(res.errorKey, SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_NOT_APPROVED);
  });

  await t.test('rejects approved scope with empty allocations', () => {
    const res = validateApprovedAllocationScope({
      status: 'APPROVED',
      allocations: [],
    });
    assert.equal(res.isValid, false);
    assert.equal(res.isApproved, true);
    assert.equal(res.errorKey, SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED);
  });

  await t.test('accepts approved scope with non-empty allocations', () => {
    const res = validateApprovedAllocationScope({
      status: 'APPROVED',
      allocations: [{ assetId: 'a1', beneficiaryId: 'b1' }],
    });
    assert.equal(res.isValid, true);
    assert.equal(res.isApproved, true);
    assert.equal(res.errorKey, null);
  });
});

test('PS-53 LV-HANDOVER-001 Scoped Handover Items Filtering', async (t) => {
  const approvedScope = {
    status: 'APPROVED',
    allocations: [
      { allocationId: 'alloc-1', assetId: 'asset-1', beneficiaryId: 'ben-1', beneficiaryName: 'Nguyễn Văn B' },
      { allocationId: 'alloc-2', assetId: 'asset-2', beneficiaryId: 'ben-2', beneficiaryName: 'Trần Thị C' },
    ],
  };

  await t.test('blocks all items when scope is missing or unapproved', () => {
    const candidates = [
      { assetId: 'asset-1', beneficiaryId: 'ben-1' },
      { assetId: 'asset-2', beneficiaryId: 'ben-2' },
    ];
    const { eligible, blocked } = filterScopedHandoverItems(candidates, null);
    assert.equal(eligible.length, 0);
    assert.equal(blocked.length, 2);
    assert.equal(blocked[0].reason, SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED);
  });

  await t.test('separates eligible scoped assets from out-of-scope assets', () => {
    const candidates = [
      { assetId: 'asset-1', beneficiaryId: 'ben-1', handoverStatus: HANDOVER_STATUS.PENDING },
      { assetId: 'asset-99', beneficiaryId: 'ben-99', handoverStatus: HANDOVER_STATUS.PENDING }, // Out of scope
    ];

    const { eligible, blocked } = filterScopedHandoverItems(candidates, approvedScope);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].assetId, 'asset-1');
    assert.equal(eligible[0].handoverStatus, HANDOVER_STATUS.PENDING);
    assert.equal(eligible[0].isInApprovedScope, true);

    assert.equal(blocked.length, 1);
    assert.equal(blocked[0].assetId, 'asset-99');
    assert.equal(blocked[0].isInApprovedScope, false);
    assert.equal(blocked[0].reason, SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE);
  });

  await t.test('preserves DELIVERED status when candidate is already delivered', () => {
    const candidates = [
      { assetId: 'asset-2', beneficiaryId: 'ben-2', handoverStatus: HANDOVER_STATUS.DELIVERED },
    ];
    const { eligible } = filterScopedHandoverItems(candidates, approvedScope);
    assert.equal(eligible.length, 1);
    assert.equal(eligible[0].handoverStatus, HANDOVER_STATUS.DELIVERED);
  });
});

test('PS-53 Handover Action Validation (LV-HANDOVER-001)', async (t) => {
  const approvedScope = {
    status: 'APPROVED',
    allocations: [{ assetId: 'asset-1', beneficiaryId: 'ben-1' }],
  };

  await t.test('permits handover for pending scoped asset', () => {
    const item = { assetId: 'asset-1', beneficiaryId: 'ben-1', handoverStatus: HANDOVER_STATUS.PENDING };
    const res = validateHandoverAttempt(item, approvedScope);
    assert.equal(res.isAllowed, true);
    assert.equal(res.errorKey, null);
  });

  await t.test('blocks handover for out-of-scope asset', () => {
    const item = { assetId: 'asset-random', beneficiaryId: 'ben-1', handoverStatus: HANDOVER_STATUS.PENDING };
    const res = validateHandoverAttempt(item, approvedScope);
    assert.equal(res.isAllowed, false);
    assert.equal(res.errorKey, SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE);
  });

  await t.test('blocks handover for already delivered asset', () => {
    const item = { assetId: 'asset-1', beneficiaryId: 'ben-1', handoverStatus: HANDOVER_STATUS.DELIVERED };
    const res = validateHandoverAttempt(item, approvedScope);
    assert.equal(res.isAllowed, false);
    assert.equal(res.errorKey, SCOPED_ASSET_HANDOVER_ERROR_KEYS.ALREADY_DELIVERED);
  });
});

test('PS-53 Dynamic Language Switching (VI <-> EN)', () => {
  const vi = scopedAssetHandoverI18n.vi;
  const en = scopedAssetHandoverI18n.en;

  assert.ok(vi.pageTitle);
  assert.ok(en.pageTitle);
  assert.notEqual(vi.pageTitle, en.pageTitle);

  // Validate error key resolution
  assert.ok(vi[SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED]);
  assert.ok(en[SCOPED_ASSET_HANDOVER_ERROR_KEYS.SCOPE_REQUIRED]);
  assert.ok(vi[SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE]);
  assert.ok(en[SCOPED_ASSET_HANDOVER_ERROR_KEYS.ASSET_OUT_OF_SCOPE]);
  assert.ok(vi[SCOPED_ASSET_HANDOVER_ERROR_KEYS.ALREADY_DELIVERED]);
  assert.ok(en[SCOPED_ASSET_HANDOVER_ERROR_KEYS.ALREADY_DELIVERED]);
});

test('PS-53 CSS Scoping Verification - No Leakage', () => {
  const cssPath = resolve('src/pages/staff/ScopedAssetHandoverPage.css');
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
          s.startsWith('.lv-asset-handover-view'),
          `Selector "${s}" in ScopedAssetHandoverPage.css must start with .lv-asset-handover-view`
        );
      }
    }
  }
});
