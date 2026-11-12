package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Kết quả quyết định thẩm định giấy chứng tử: giấy tờ, ca, {@code result}, {@code verifierPublicId},
 * {@code decidedAt}, {@code reason}, trạng thái ca và vault sau quyết định, và {@code notification}.
 */
public record LegalDeathDecisionResponse(UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String result,
        UUID verifierPublicId,
        Instant decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    /**
     * Constructor không có {@code notification}.
     */
    public LegalDeathDecisionResponse(UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String result,
        UUID verifierPublicId,
        Instant decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus) { this(deathDocumentPublicId, verificationCasePublicId, result, verifierPublicId, decidedAt, reason, verificationCaseStatus, vaultStatus, null); }
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public LegalDeathDecisionResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new LegalDeathDecisionResponse(deathDocumentPublicId, verificationCasePublicId, result, verifierPublicId, decidedAt, reason, verificationCaseStatus, vaultStatus, receipt); }
}