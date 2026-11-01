package com.legacyvault.verification.dto;

import com.legacyvault.verification.repository.WillComparisonRow;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

/** Một kết quả đối chiếu. Chỉ ID công khai; thời gian UTC. {@code sha256} là hash của phiên bản đã so. */
public record WillComparisonResponse(UUID id,
        UUID caseId,
        UUID originalWillIntakeId,
        UUID willId,
        int version,
        String sha256,
        String result,
        UUID checkedBy,
        String reason,
        Instant comparedAt, com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
    public WillComparisonResponse(UUID id,
        UUID caseId,
        UUID originalWillIntakeId,
        UUID willId,
        int version,
        String sha256,
        String result,
        UUID checkedBy,
        String reason,
        Instant comparedAt) { this(id, caseId, originalWillIntakeId, willId, version, sha256, result, checkedBy, reason, comparedAt, null); }
    public WillComparisonResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new WillComparisonResponse(id, caseId, originalWillIntakeId, willId, version, sha256, result, checkedBy, reason, comparedAt, receipt); }

    public static WillComparisonResponse from(WillComparisonRow row, UUID caseId) {
        return new WillComparisonResponse(
                row.id(),
                caseId,
                row.originalWillIntakeId(),
                row.willId(),
                row.version(),
                row.sha256(),
                row.result(),
                row.checkedBy(),
                row.reason(),
                row.comparedAt().toInstant(ZoneOffset.UTC)
        );
    }
}
