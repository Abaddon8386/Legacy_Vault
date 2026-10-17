package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.OriginalWillIntake;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;

/** Metadata đã ghi nhận. {@code receivedBy} là ID công khai của Staff, không phải khóa nội bộ. */
public record OriginalWillIntakeResponse(
        UUID id,
        UUID caseId,
        String deliveredByName,
        String deliveredByRelationship,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String conditionNotes
) {

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
