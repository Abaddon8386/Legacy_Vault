package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record LegalApprovalResponse(UUID dossierId,
        String decision,
        Integer versionNo,
        String sha256Hash,
        String allocationHash,
        UUID decidedBy,
        LocalDateTime decidedAt, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    public LegalApprovalResponse(UUID dossierId,
        String decision,
        Integer versionNo,
        String sha256Hash,
        String allocationHash,
        UUID decidedBy,
        LocalDateTime decidedAt) { this(dossierId, decision, versionNo, sha256Hash, allocationHash, decidedBy, decidedAt, null); }
    public LegalApprovalResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalApprovalResponse(dossierId, decision, versionNo, sha256Hash, allocationHash, decidedBy, decidedAt, receipt); }
}
