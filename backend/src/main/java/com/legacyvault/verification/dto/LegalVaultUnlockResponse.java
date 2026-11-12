package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Kết quả của {@code POST .../verification-cases/{caseId}/unlock}: ca, vault, trạng thái, người mở khóa, thời điểm và {@code notification}.
 */
public record LegalVaultUnlockResponse(UUID caseId, UUID vaultId, String status,
        UUID unlockedBy, Instant unlockedAt, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    /**
     * Constructor không có {@code notification}.
     */
    public LegalVaultUnlockResponse(UUID caseId, UUID vaultId, String status,
        UUID unlockedBy, Instant unlockedAt) { this(caseId, vaultId, status, unlockedBy, unlockedAt, null); }
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public LegalVaultUnlockResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalVaultUnlockResponse(caseId, vaultId, status, unlockedBy, unlockedAt, receipt); }}
