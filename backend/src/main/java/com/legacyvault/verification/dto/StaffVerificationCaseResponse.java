package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record StaffVerificationCaseResponse(
        UUID caseId,
        String status,
        LocalDateTime triggeredAt,
        LocalDateTime closedAt,
        UUID vaultId,
        String vaultName,
        UUID ownerId,
        String ownerName
) {
}
