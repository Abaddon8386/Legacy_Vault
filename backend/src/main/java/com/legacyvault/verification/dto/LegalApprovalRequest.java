package com.legacyvault.verification.dto;

import jakarta.validation.constraints.AssertTrue;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record LegalApprovalRequest(
        @NotNull Decision decision,
        @NotNull @Min(1) Integer versionNo,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String sha256Hash,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationHash,
        @Size(max = 1000) String reason
) {
    public enum Decision { APPROVE, REJECT }

    @AssertTrue(message = "validation.legalApproval.rejectionReasonRequired")
    public boolean isRejectionReasonPresent() {
        return decision != Decision.REJECT || (reason != null && !reason.isBlank());
    }
}
