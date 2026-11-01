package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

public record LegalDeathDecisionResponse(UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String result,
        UUID verifierPublicId,
        Instant decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    public LegalDeathDecisionResponse(UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String result,
        UUID verifierPublicId,
        Instant decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus) { this(deathDocumentPublicId, verificationCasePublicId, result, verifierPublicId, decidedAt, reason, verificationCaseStatus, vaultStatus, null); }
    public LegalDeathDecisionResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalDeathDecisionResponse(deathDocumentPublicId, verificationCasePublicId, result, verifierPublicId, decidedAt, reason, verificationCaseStatus, vaultStatus, receipt); }
}