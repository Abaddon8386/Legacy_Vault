package com.legacyvault.verification.repository;

import java.time.LocalDate;

/** Metadata only: court review does not materialize encrypted file content. */
public record CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
        String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
        boolean hasFile) {
    public boolean isReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile
                && ("COURT_JUDGMENT".equals(legalBasisType) || "COURT_DECISION".equals(legalBasisType))
                && issuingAuthority != null && !issuingAuthority.isBlank()
                && documentNumber != null && !documentNumber.isBlank()
                && issueDate != null && !issueDate.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }
}
