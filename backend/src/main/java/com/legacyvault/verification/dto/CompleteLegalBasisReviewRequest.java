package com.legacyvault.verification.dto;
import jakarta.validation.constraints.*;
/** Exact server snapshot displayed to Legal, not a request to review whatever is current at submit time. */
public record CompleteLegalBasisReviewRequest(
    @NotBlank @Size(max=1000) String reason,
    @NotNull @Min(1) Integer versionNo,
    @NotBlank @Pattern(regexp="[a-fA-F0-9]{64}") String sha256Hash,
    @NotBlank @Pattern(regexp="[a-fA-F0-9]{64}") String allocationHash,
    @NotBlank @Pattern(regexp="NONE|DISPUTED|UNDETERMINED") String disputeStatus) {}
