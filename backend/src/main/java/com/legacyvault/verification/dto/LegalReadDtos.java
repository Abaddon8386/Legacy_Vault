package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Public metadata only. No internal keys, file bytes or secret payloads.
 *
 * DTO đọc cho Legal, dùng bởi {@code LegalReadController}.
 */
public final class LegalReadDtos {
    private LegalReadDtos() { }
    /**
     * Một dòng trong hàng đợi ca ({@code GET /api/v1/legal-verifications/verification-cases}).
     */
    public record QueueItem(UUID caseId,String caseNumber,UUID vaultId,String caseStatus,String vaultStatus,
        String route,String dossierStatus,String reviewStatus,Instant openedAt) { }
    /**
     * Tham chiếu tới giấy chứng tử đã nhận.
     */
    public record DeathReference(UUID id,String documentType,Instant receivedAt) { }
    /**
     * Quyết định gần nhất của Legal trên snapshot.
     */
    public record Decision(UUID id,Integer versionNo,String sha256Hash,String allocationHash,String disputeStatus,
        String result,UUID reviewedBy,Instant reviewedAt) { }
    /**
     * Snapshot hiện tại của hồ sơ căn cứ và các cờ tươi/còn hiệu lực của review và phê duyệt.
     */
    public record Snapshot(UUID dossierId,int currentVersion,int requiredVersion,String sha256Hash,
        String allocationHash,String disputeStatus,String reviewStatus,boolean reviewFresh,boolean approvalCurrent,
        Decision latestDecision,String courtResult) { }
    /**
     * Một hành động được phép hay bị chặn (kèm lý do).
     */
    public record Action(boolean allowed,String blockedReason) { }
    /**
     * Khả năng phê duyệt ({@code approval}) và mở khóa vault ({@code unlock}).
     */
    public record Capabilities(Action approval,Action unlock) { }
    /**
     * Ngữ cảnh đầy đủ của ca, trả về bởi {@code GET .../verification-cases/{caseId}/context}.
     */
    public record Context(UUID caseId,String caseNumber,UUID vaultId,String caseStatus,String vaultStatus,
        List<DeathReference> deathDocuments,WillComparisonOverviewResponse willComparison,
        BasisDossierResponse basisDossier,Snapshot snapshot,Capabilities capabilities,Instant evaluatedAt) { }
}
