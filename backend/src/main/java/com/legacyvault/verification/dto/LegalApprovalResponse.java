package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Kết quả của {@code POST .../basis-dossier/decision}: {@code dossierId}, {@code decision}, {@code versionNo},
 * {@code sha256Hash}, {@code allocationHash}, {@code decidedBy}, {@code decidedAt}, {@code notification}.
 */
public record LegalApprovalResponse(UUID dossierId,
        String decision,
        Integer versionNo,
        String sha256Hash,
        String allocationHash,
        UUID decidedBy,
        LocalDateTime decidedAt, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    /**
     * Constructor không có {@code notification}.
     */
    public LegalApprovalResponse(UUID dossierId,
        String decision,
        Integer versionNo,
        String sha256Hash,
        String allocationHash,
        UUID decidedBy,
        LocalDateTime decidedAt) { this(dossierId, decision, versionNo, sha256Hash, allocationHash, decidedBy, decidedAt, null); }
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public LegalApprovalResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalApprovalResponse(dossierId, decision, versionNo, sha256Hash, allocationHash, decidedBy, decidedAt, receipt); }
}
