// Test-only contract fixtures. Never loaded by the application.
export function distributionFixture(context, phase) {
  const latest = context.basisDossier?.versions?.reduce((best, value) => !best || value.version > best.version ? value : best, null);
  const actualPhase = phase || (context.caseStatus !== 'OPEN' ? 'CLOSED' : context.vaultStatus === 'UNLOCKED' ? 'UNLOCKED'
    : context.capabilities?.unlock?.allowed ? 'APPROVED' : 'FINAL_APPROVAL');
  const names = latest?.allocations?.map(row => ({ ...row, assetName: row.assetName || 'Stored asset', recipientName: row.recipientName || 'Case recipient', description: row.description || '' }));
  return { caseId: context.caseId, revision: 1, phase: actualPhase, prerequisites: { deathApproved: true, willMatched: true },
    request: { id: context.caseId, reason: 'Nộp giấy tờ phân chia tài sản' },
    document: latest ? { version: latest.version, sha256: latest.sha256, status: 'APPROVED' } : null,
    allocation: latest ? { version: 1, documentVersion: latest.version, sha256: context.snapshot.allocationHash, status: 'APPROVED',
      items: names?.length ? names : [{ assetId: context.caseId, beneficiaryId: context.vaultId, assetName: 'Stored asset', recipientName: 'Case recipient', description: 'All' }] } : null,
    capabilities: Object.fromEntries(['requestDocuments', 'uploadDocuments', 'forwardDocuments', 'approveDocuments', 'requestDocumentSupplementation', 'submitAllocations', 'approveAllocations', 'requestAllocationChanges']
      .map(action => [action, { allowed: false, blockedReason: 'NOT_CURRENT_STEP' }])),
  };
}
