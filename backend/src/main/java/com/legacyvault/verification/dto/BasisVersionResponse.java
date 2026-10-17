package com.legacyvault.verification.dto;

import com.legacyvault.verification.repository.BasisVersionRow;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.UUID;

/** Một phiên bản văn bản căn cứ. Không có nội dung file, tên file hay khóa nội bộ; thời gian UTC. */
public record BasisVersionResponse(
        int version,
        String legalBasisType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issueDate,
        String notaryAuthority,
        String notarialDocumentNumber,
        LocalDate notarizedAt,
        String evidenceReference,
        String notes,
        String contentType,
        Long sizeBytes,
        String sha256,
        String forwardStatus,
        UUID createdBy,
        Instant createdAt,
        Instant forwardedAt
) {

    public static BasisVersionResponse from(BasisVersionRow row, UUID createdBy, String evidenceReference) {
        return new BasisVersionResponse(
                row.versionNo(),
                row.legalBasisType(),
                row.issuingAuthority(),
                row.documentNumber(),
                row.issueDate(),
                row.notaryAuthority(),
                row.notarialDocumentNumber(),
                row.notarizedAt(),
                evidenceReference,
                row.versionNotes(),
                row.contentType(),
                row.fileSizeBytes(),
                row.sha256Hash(),
                row.forwardStatus(),
                createdBy,
                row.createdAt() == null ? null : row.createdAt().toInstant(ZoneOffset.UTC),
                row.forwardedAt() == null ? null : row.forwardedAt().toInstant(ZoneOffset.UTC)
        );
    }
}
