package com.legacyvault.verification.repository;

import java.time.LocalDate;
import java.time.LocalDateTime;

/**
 * Metadata một phiên bản văn bản căn cứ, không nạp nội dung file mã hóa.
 *
 * Kết quả projection của {@code LegalBasisDossierVersionRepository.findRows}, được
 * {@code BasisVersionResponse.from} chuyển thành response.
 *
 * Các trường: số phiên bản, loại căn cứ, cơ quan cấp, số văn bản, ngày cấp, thông tin công chứng, {@code evidenceMetadata},
 * {@code versionNotes}, {@code contentType}, {@code fileSizeBytes}, {@code sha256Hash}, {@code forwardStatus},
 * {@code createdByUserId} (khóa nội bộ), {@code createdAt}, {@code forwardedAt}.
 */
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
