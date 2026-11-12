package com.legacyvault.verification.dto;

import com.legacyvault.verification.repository.WillComparisonRow;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Một kết quả đối chiếu. Chỉ ID công khai; thời gian UTC. {@code sha256} là hash của phiên bản đã so.
 *
 * Kết quả của {@code POST .../will-comparisons}; thêm các trường {@code originalWillIntakeId}, {@code willId},
 * {@code version}, {@code result}, {@code checkedBy}, {@code reason}, {@code comparedAt}, {@code notification}.
 */
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
    /**
     * Constructor không có {@code notification}.
     */
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
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public WillComparisonResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new WillComparisonResponse(id, caseId, originalWillIntakeId, willId, version, sha256, result, checkedBy, reason, comparedAt, receipt); }

    /**
     * Dựng response từ dòng DB {@code WillComparisonRow}; đổi thời gian sang UTC.
     */
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
