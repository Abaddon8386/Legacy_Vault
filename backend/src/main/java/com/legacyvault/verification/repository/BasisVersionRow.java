package com.legacyvault.verification.repository;

import java.time.LocalDate;
import java.time.LocalDateTime;

/** Metadata một phiên bản văn bản căn cứ, không nạp nội dung file mã hóa. */
public record BasisVersionRow(
        int versionNo,
        String legalBasisType,
        String issuingAuthority,
        String documentNumber,
        LocalDate issueDate,
        String notaryAuthority,
        String notarialDocumentNumber,
        LocalDate notarizedAt,
        String evidenceMetadata,
        String versionNotes,
        String contentType,
        Long fileSizeBytes,
        String sha256Hash,
        String forwardStatus,
        Long createdByUserId,
        LocalDateTime createdAt,
        LocalDateTime forwardedAt
) {
}
