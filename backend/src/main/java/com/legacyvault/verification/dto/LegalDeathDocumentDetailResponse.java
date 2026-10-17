package com.legacyvault.verification.dto;

import java.time.Instant;
import java.time.LocalDate;
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
            UUID receivedByPublicId,
            Instant receivedAt,
            String evidenceReference,
            String notes,
            Instant createdAt
    ) {
    }

    public record DecisionHistory(
            String result,
            UUID verifierPublicId,
            Instant requestedAt,
            Instant decidedAt,
            String reason
    ) {
    }
}