package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.OriginalWillIntake;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Metadata đã ghi nhận. {@code receivedBy} là ID công khai của Staff, không phải khóa nội bộ.
 *
 * Kết quả của {@code POST/GET /api/v1/staff/verification-cases/{caseId}/original-will-intakes}.
 *
 * Các trường: {@code id}, {@code caseId}, {@code deliveredByName}, {@code deliveredByRelationship} (người nộp),
 * {@code receivedBy}, {@code receivedAt}, {@code evidenceReference}, {@code conditionNotes} (tình trạng bản gốc),
 * {@code notification} và {@code comparison} (kết quả đối chiếu của Legal nếu có).
 */
public record OriginalWillIntakeResponse(UUID id,
        UUID caseId,
        String deliveredByName,
        String deliveredByRelationship,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String conditionNotes, com.legacyvault.notification.WorkflowNotificationService.Receipt notification,
        Comparison comparison) {
    /**
     * Kết quả đối chiếu gần nhất với bản scan phiên bản {@code digitalVersion}.
     */
    public record Comparison(String result, String reason, Instant comparedAt, int digitalVersion) { }
    /**
     * Constructor không có {@code comparison}.
     */
    public OriginalWillIntakeResponse(UUID id, UUID caseId, String deliveredByName, String deliveredByRelationship,
            UUID receivedBy, Instant receivedAt, String evidenceReference, String conditionNotes,
            com.legacyvault.notification.WorkflowNotificationService.Receipt notification) {
        this(id, caseId, deliveredByName, deliveredByRelationship, receivedBy, receivedAt, evidenceReference, conditionNotes, notification, null);
    }
    /**
     * Constructor tối giản: không có {@code notification} và {@code comparison}.
     */
    public OriginalWillIntakeResponse(UUID id,
        UUID caseId,
        String deliveredByName,
        String deliveredByRelationship,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String conditionNotes) { this(id, caseId, deliveredByName, deliveredByRelationship, receivedBy, receivedAt, evidenceReference, conditionNotes, null); }
    /**
     * Trả bản sao có gắn biên nhận thông báo.
     */
    public OriginalWillIntakeResponse withNotification(com.legacyvault.notification.WorkflowNotificationService.Receipt receipt) { return new OriginalWillIntakeResponse(id, caseId, deliveredByName, deliveredByRelationship, receivedBy, receivedAt, evidenceReference, conditionNotes, receipt, comparison); }
    /**
     * Trả bản sao có gắn kết quả đối chiếu {@code outcome}.
     */
    public OriginalWillIntakeResponse withComparison(Comparison outcome) {
        return new OriginalWillIntakeResponse(id, caseId, deliveredByName, deliveredByRelationship, receivedBy, receivedAt, evidenceReference, conditionNotes, notification, outcome);
    }

    /**
     * Dựng response từ entity {@code OriginalWillIntake}, đổi thời gian nhận sang UTC.
     */
    public static OriginalWillIntakeResponse from(
            OriginalWillIntake intake,
            UUID casePublicId,
            UUID receivedByPublicId
    ) {
        return new OriginalWillIntakeResponse(
                intake.getPublicId(),
                casePublicId,
                intake.getDeliveredByName(),
                intake.getDeliveredByRelationship(),
                receivedByPublicId,
                intake.getReceivedAt().toInstant(ZoneOffset.UTC),
                intake.getEvidenceReference(),
                intake.getConditionNotes()
        );
    }
}
