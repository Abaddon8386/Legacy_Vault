
package com.legacyvault.verification.dto;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

public record LegalDeathDocumentDetailResponse(
        UUID deathDocumentPublicId,
        UUID verificationCasePublicId,
        String verificationCaseStatus,
        String vaultStatus,
        DocumentMetadata document,
        List<DecisionHistory> decisions
) {
    public record DocumentMetadata(
            String documentType,
            String issuingAuthority,
            String documentNumber,
            LocalDate issuedDate,
            Long receivedByUserId,
            LocalDateTime receivedAt,
            String evidenceReference,
            String notes,
            LocalDateTime createdAt
    ) {
    }

    public record DecisionHistory(
            Long verificationId,
            String result,
            Long verifierUserId,
            LocalDateTime requestedAt,
            LocalDateTime decidedAt,
            String reason
    ) {
    }
}
