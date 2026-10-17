
package com.legacyvault.verification.dto;

import java.time.LocalDateTime;

public record LegalBasisReviewResponse(
        Long dossierId,
        String reviewStatus,
        boolean reviewRequired,
        String reasonCode,
        String reason,
        Integer currentVersionNo,
        String currentSha256Hash,
        String currentDisputeStatus,
        String currentAllocationHash,
        LocalDateTime checkedAt
) {
}
