package com.legacyvault.verification.repository;

import java.time.LocalDate;

/** Chỉ chứa metadata: bước thẩm định pháp lý không giải mã nội dung file đã mã hóa. Các trường công chứng là null với dòng của tòa án. */
public record CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
        String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
        boolean hasFile, String notaryAuthority, String notarialDocumentNumber, LocalDate notarizedAt) {
    /**
     * Constructor rút gọn cho chứng cứ tòa án: các trường công chứng được đặt null.
     */
    public CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
            String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
            boolean hasFile) {
        this(id, version, sha256, legalBasisType, issuingAuthority, documentNumber, issueDate, forwardStatus,
                hasFile, null, null, null);
    }

    /** Bản công chứng đã lưu và đã chuyển, có công chứng viên, số văn bản và ngày không ở tương lai. */
    public boolean isNotarialReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile && "NOTARIAL_PARTITION".equals(legalBasisType)
                && notaryAuthority != null && !notaryAuthority.isBlank()
                && notarialDocumentNumber != null && !notarialDocumentNumber.isBlank()
                && notarizedAt != null && !notarizedAt.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }

    /**
     * Phiên bản chứng cứ tòa án có đủ điều kiện để Legal xem xét hay không: đã chuyển (FORWARDED), có file,
     * loại căn cứ là COURT_JUDGMENT hoặc COURT_DECISION, có cơ quan ban hành, số văn bản và ngày ban hành không ở tương lai (tính theo UTC).
     */
    public boolean isReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile
                && ("COURT_JUDGMENT".equals(legalBasisType) || "COURT_DECISION".equals(legalBasisType))
                && issuingAuthority != null && !issuingAuthority.isBlank()
                && documentNumber != null && !documentNumber.isBlank()
                && issueDate != null && !issueDate.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }
}
