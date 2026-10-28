package com.legacyvault.verification.repository;

import java.time.LocalDate;

/** Metadata only: branch-specific review does not materialize encrypted file content. */
public record CourtEvidenceVersion(Long id, int version, String sha256, String legalBasisType,
        String issuingAuthority, String documentNumber, LocalDate issueDate, String forwardStatus,
        boolean hasFile, String notaryAuthority, String notarialDocumentNumber, LocalDate notarizedAt) {
    public CourtEvidenceVersion(Long id,int version,String sha256,String type,String issuer,String number,LocalDate date,String status,boolean file) {
        this(id,version,sha256,type,issuer,number,date,status,file,null,null,null);
    }
    public boolean isNotarialReviewable() {
        return notaryAuthority != null && !notaryAuthority.isBlank() && notarialDocumentNumber != null && !notarialDocumentNumber.isBlank()
            && notarizedAt != null && !notarizedAt.isAfter(LocalDate.now(java.time.ZoneOffset.UTC)) && "NOTARIAL_PARTITION".equals(legalBasisType) && "FORWARDED".equals(forwardStatus) && hasFile
            && issuingAuthority != null && !issuingAuthority.isBlank() && documentNumber != null && !documentNumber.isBlank()
            && issueDate != null && !issueDate.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }
    public boolean isReviewable() {
        return "FORWARDED".equals(forwardStatus) && hasFile
                && ("COURT_JUDGMENT".equals(legalBasisType) || "COURT_DECISION".equals(legalBasisType))
                && issuingAuthority != null && !issuingAuthority.isBlank()
                && documentNumber != null && !documentNumber.isBlank()
                && issueDate != null && !issueDate.isAfter(LocalDate.now(java.time.ZoneOffset.UTC));
    }
}
