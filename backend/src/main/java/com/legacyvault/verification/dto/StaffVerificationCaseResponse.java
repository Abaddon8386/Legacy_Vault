package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Ca xác minh hiển thị cho Staff: thông tin Vault, chủ sở hữu, trạng thái phân công và người được ủy thác (trustee).
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
    public record TrusteeSummary(UUID trusteeId, String fullName, String phone, String email, String relationship) { }
}
