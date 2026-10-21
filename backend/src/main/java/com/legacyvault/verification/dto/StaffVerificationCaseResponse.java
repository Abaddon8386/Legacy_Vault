package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record StaffVerificationCaseResponse(
        UUID caseId,
        String caseNumber,
        String status,
        LocalDateTime triggeredAt,
        LocalDateTime closedAt,
        UUID vaultId,
        String vaultStatus,
        String vaultName,
        UUID ownerId,
        String ownerName,
        String assignmentStatus,
        TrusteeSummary trustee
) {
    public record TrusteeSummary(UUID trusteeId, String fullName, String phone, String email, String relationship) { }
}
