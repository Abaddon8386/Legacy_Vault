import test from 'node:test';
import assert from 'node:assert/strict';

import {
  fetchEligibleAssets,
  deliverAssets,
  fetchBeneficiaryConfirmations,
  confirmBeneficiary,
  fetchCompletionProgress,
  fetchHandoverReceipts,
  createHandoverReceipt,
  closeHandoverSession,
  archiveHandoverCase,
} from '../pages/staff/handoverSessionService.js';
import { isCaseArchived } from './closeAndArchiveValidation.js';

test('PS-97: fetchEligibleAssets retrieves scoped assets and filters by recipientId', async () => {
  const assets = await fetchEligibleAssets('case-001', 'session-001', {
    isDevPreview: true,
    isTest: true,
  });

  assert.ok(Array.isArray(assets));
  assert.ok(assets.length > 0);
  assert.ok(assets[0].assetId);
  assert.ok(assets[0].recipientId);
  assert.ok(assets[0].status);

  // Filter by specific recipient
  const filtered = await fetchEligibleAssets('case-001', 'session-001', {
    recipientId: 'ben-001',
    isDevPreview: true,
    isTest: true,
  });
  assert.ok(filtered.every((a) => a.recipientId === 'ben-001'));
});

test('PS-97: deliverAssets validates parameters and records item deliveries', async () => {
  // Missing recipientId throws validation error
  await assert.rejects(
    async () => {
      await deliverAssets('case-001', 'session-001', { recipientId: null, assetIds: ['ast-001'] }, {
        isDevPreview: true,
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.code, 'VALIDATION_FAILED');
      return true;
    }
  );

  // Valid delivery
  const items = await deliverAssets('case-001', 'session-001', {
    recipientId: 'ben-001',
    assetIds: ['ast-001', 'ast-002'],
  }, {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(items.length, 2);
  assert.equal(items[0].status, 'DELIVERED');
  assert.equal(items[1].status, 'DELIVERED');
  assert.ok(items[0].deliveredAt);
});

test('PS-97: confirmBeneficiary validates receipt reference and updates confirmation status', async () => {
  // Empty receipt reference
  await assert.rejects(
    async () => {
      await confirmBeneficiary('case-001', 'session-001', 'ben-001', { receiptReference: '' }, {
        isDevPreview: true,
        isTest: true,
      });
    },
    (err) => {
      assert.equal(err.code, 'RECEIPT_REFERENCE_REQUIRED');
      return true;
    }
  );

  // Valid confirmation
  const res = await confirmBeneficiary('case-001', 'session-001', 'ben-001', {
    receiptReference: 'REC-CCCD-079-01',
  }, {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(res.beneficiaryId, 'ben-001');
  assert.equal(res.confirmationStatus, 'CONFIRMED');
  assert.equal(res.receiptReference, 'REC-CCCD-079-01');
  assert.ok(res.confirmedAt);
});

test('PS-97: fetchCompletionProgress checks dual gate completion', async () => {
  const progress = await fetchCompletionProgress('case-001', 'session-001', {
    isDevPreview: true,
    isTest: true,
  });

  assert.ok(progress.assetCompletion);
  assert.ok(progress.beneficiaryCompletion);
  assert.equal(typeof progress.readyForClose, 'boolean');
  assert.equal(typeof progress.readyForArchive, 'boolean');
});

test('PS-97: createHandoverReceipt creates staff attestation receipt with asset snapshots', async () => {
  const receipt = await createHandoverReceipt('case-001', 'session-001', {
    recipientId: 'ben-001',
    assetIds: ['ast-001', 'ast-002'],
  }, {
    isDevPreview: true,
    isTest: true,
  });

  assert.ok(receipt.receiptId);
  assert.equal(receipt.attestationType, 'STAFF_ATTESTATION');
  assert.deepEqual(receipt.assetIds, ['ast-001', 'ast-002']);
  assert.ok(receipt.createdAt);
});

test('PS-97: closeHandoverSession closes session with audit proof', async () => {
  const closed = await closeHandoverSession('case-001', 'session-001', {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(closed.sessionId, 'session-001');
  assert.equal(closed.status, 'COMPLETED');
  assert.ok(closed.closedAt);
  assert.ok(closed.proofHash);
});

test('PS-97: archiveHandoverCase atomically archives vault and closes verification case', async () => {
  const archived = await archiveHandoverCase('case-001', 'session-001', {
    isDevPreview: true,
    isTest: true,
  });

  assert.equal(archived.caseStatus, 'CLOSED');
  assert.equal(archived.vaultStatus, 'ARCHIVED');
  assert.ok(archived.archivedAt);

  // Check read-only state guard
  assert.equal(isCaseArchived('ARCHIVED', 'CLOSED'), true);
  assert.equal(isCaseArchived('UNLOCKED', 'OPEN'), false);
});
