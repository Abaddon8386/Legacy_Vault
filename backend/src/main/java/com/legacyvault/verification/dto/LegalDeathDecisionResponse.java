package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record LegalDeathDecisionResponse(
        UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        Long verificationId,
        String result,
        UUID verifierPublicId,
        LocalDateTime decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus
) {
}