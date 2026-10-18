package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

public record LegalDeathDecisionResponse(
        UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String result,
        UUID verifierPublicId,
        Instant decidedAt,
        String reason,
        String verificationCaseStatus,
        String vaultStatus
) {
}