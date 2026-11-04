package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Response cho kết quả đánh giá/review hồ sơ căn cứ pháp lý.
 * dossierId là UUID công khai, không phải khóa chính tuần tự trong database.
 */
public record LegalBasisReviewResponse(
        UUID dossierId,
        String reviewStatus,
        boolean reviewRequired,
        String reasonCode,
        String reason,
        Integer currentVersionNo,
        String currentSha256Hash,
        String currentDisputeStatus,
        String currentAllocationHash,
        LocalDateTime checkedAt,
        com.legacyvault.notification.WorkflowNotificationService.Receipt notification
) {
    public LegalBasisReviewResponse(UUID dossierId, String reviewStatus, boolean reviewRequired, String reasonCode,
            String reason, Integer currentVersionNo, String currentSha256Hash, String currentDisputeStatus,
            String currentAllocationHash, LocalDateTime checkedAt) {
        this(dossierId, reviewStatus, reviewRequired, reasonCode, reason, currentVersionNo, currentSha256Hash,
                currentDisputeStatus, currentAllocationHash, checkedAt, null);
    }
    public LegalBasisReviewResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) {
        return new LegalBasisReviewResponse(dossierId, reviewStatus, reviewRequired, reasonCode, reason, currentVersionNo,
                currentSha256Hash, currentDisputeStatus, currentAllocationHash, checkedAt, receipt);
    }
}
