package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

public record LegalApprovalResponse(
        UUID dossierId,
        String decision,
        Integer versionNo,
        String sha256Hash,
        String allocationHash,
        UUID decidedBy,
        LocalDateTime decidedAt
) {
}
