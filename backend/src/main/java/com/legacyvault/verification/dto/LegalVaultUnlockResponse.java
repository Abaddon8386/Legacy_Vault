package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

public record LegalVaultUnlockResponse(UUID caseId, UUID vaultId, String status,
        UUID unlockedBy, Instant unlockedAt, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    public LegalVaultUnlockResponse(UUID caseId, UUID vaultId, String status,
        UUID unlockedBy, Instant unlockedAt) { this(caseId, vaultId, status, unlockedBy, unlockedAt, null); }
    public LegalVaultUnlockResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalVaultUnlockResponse(caseId, vaultId, status, unlockedBy, unlockedAt, receipt); }}
