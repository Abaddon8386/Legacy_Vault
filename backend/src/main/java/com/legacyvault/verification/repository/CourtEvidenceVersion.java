package com.legacyvault.verification.repository;

import java.time.LocalDate;

/**
 * Metadata only: legal review does not materialize encrypted file content. Notarial fields are null for court rows.
 *
 * Dùng trong review của Legal và kiểm tra điều kiện duyệt. Được tạo bởi
 * {@code LegalBasisDossierVersionRepository.findCourtEvidence}; {@code hasFile} cho biết file mã hóa đã lưu và có kích thước > 0.
 */
public record CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
        String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
        boolean hasFile, String notaryAuthority, String notarialDocumentNumber, LocalDate notarizedAt) {
    /**
     * Constructor rút gọn: không có thông tin công chứng (đặt null).
     */
    public CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
            String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
            boolean hasFile) {
        this(id, version, sha256, legalBasisType, issuingAuthority, documentNumber, issueDate, forwardStatus,
                hasFile, null, null, null);
    }

    /**
     * A stored, forwarded notarial deed with its notary, number and a non-future date.
     *
     * True nếu là bản công chứng phân chia đã chuyển Legal, có file, đủ cơ quan công chứng, số và ngày không ở tương lai.
     */
    public boolean isNotarialReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile && "NOTARIAL_PARTITION".equals(legalBasisType)
                && notaryAuthority != null && !notaryAuthority.isBlank()
                && notarialDocumentNumber != null && !notarialDocumentNumber.isBlank()
                && notarizedAt != null && !notarizedAt.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }

    /**
     * True nếu là phán quyết/quyết định tòa án đã chuyển Legal, có file, đủ cơ quan cấp, số và ngày cấp không ở tương lai.
     */
    public boolean isReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile
                && ("COURT_JUDGMENT".equals(legalBasisType) || "COURT_DECISION".equals(legalBasisType))
                && issuingAuthority != null && !issuingAuthority.isBlank()
                && documentNumber != null && !documentNumber.isBlank()
                && issueDate != null && !issueDate.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }
}
