package com.legacyvault.verification.dto;

import com.legacyvault.verification.entity.DeathDocumentRecord;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

/** Metadata đã ghi nhận. {@code receivedBy} là ID công khai của Staff, không phải khóa nội bộ. */
public record DeathDocumentRecordResponse(
        UUID id,
        UUID caseId,
        String documentType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issuedDate,
        UUID receivedBy,
        Instant receivedAt,
        String evidenceReference,
        String notes
) {

    public static DeathDocumentRecordResponse from(
            DeathDocumentRecord record,
            UUID casePublicId,
            UUID receivedByPublicId
    ) {
        return new DeathDocumentRecordResponse(
                record.getPublicId(),
                casePublicId,
                record.getDocumentType(),
                record.getIssuingAuthority(),
                record.getDocumentNumber(),
                record.getIssuedDate(),
                receivedByPublicId,
                record.getReceivedAt().toInstant(ZoneOffset.UTC),
                record.getEvidenceReference(),
                record.getNotes()
        );
    }
}
