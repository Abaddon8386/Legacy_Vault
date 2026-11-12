package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ca xác minh trong màn hình Staff ({@code GET /api/v1/staff/verification-cases} và {@code /{caseId}}).
 *
 * Các trường: {@code caseId}, {@code caseNumber}, {@code status}, {@code triggeredAt}, {@code closedAt}, vault
 * ({@code vaultId}, {@code vaultStatus}, {@code vaultName}), chủ ({@code ownerId}, {@code ownerName}),
 * {@code assignmentStatus} và {@code trustee} (người được ủy thác).
 */
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
    /**
     * Thông tin tóm tắt người được ủy thác (trustee).
     */
    public record TrusteeSummary(UUID trusteeId, String fullName, String phone, String email, String relationship) { }
}
