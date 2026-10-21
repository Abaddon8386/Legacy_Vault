package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public metadata only. No internal keys, file bytes or secret payloads. */
public final class LegalReadDtos {
    private LegalReadDtos() { }
    public record QueueItem(UUID caseId,String caseNumber,UUID vaultId,String caseStatus,String vaultStatus,
        String route,String dossierStatus,String reviewStatus,Instant openedAt) { }
    public record DeathReference(UUID id,String documentType,Instant receivedAt) { }
    public record Decision(UUID id,Integer versionNo,String sha256Hash,String allocationHash,String disputeStatus,
        String result,UUID reviewedBy,Instant reviewedAt) { }
    public record Snapshot(UUID dossierId,int currentVersion,int requiredVersion,String sha256Hash,
        String allocationHash,String disputeStatus,String reviewStatus,boolean reviewFresh,boolean approvalCurrent,
        Decision latestDecision,String courtResult) { }
    public record Action(boolean allowed,String blockedReason) { }
    public record Capabilities(Action approval,Action unlock) { }
    public record Context(UUID caseId,String caseNumber,UUID vaultId,String caseStatus,String vaultStatus,
        List<DeathReference> deathDocuments,WillComparisonOverviewResponse willComparison,
        BasisDossierResponse basisDossier,Snapshot snapshot,Capabilities capabilities,Instant evaluatedAt) { }
}
