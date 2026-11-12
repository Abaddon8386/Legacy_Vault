package com.legacyvault.verification.dto;
import jakarta.validation.constraints.*;
/**
 * Exact server snapshot displayed to Legal, not a request to review whatever is current at submit time.
 *
 * Body của {@code POST /api/v1/legal-verifications/verification-cases/{caseId}/basis-dossier/review}.
 *
 * Các trường:
 * - {@code reason}: lý do/kết luận review, tối đa 1000 ký tự.
 * - {@code versionNo}: số phiên bản đã xem (>= 1).
 * - {@code sha256Hash}: hash SHA-256 (64 ký tự hex) của file phiên bản đó.
 * - {@code allocationHash}: hash SHA-256 của phạm vi phân bổ.
 * - {@code disputeStatus}: NONE, DISPUTED hoặc UNDETERMINED.
 */
public record CompleteLegalBasisReviewRequest(
    @NotBlank @Size(max=1000) String reason,
    @NotNull @Min(1) Integer versionNo,
    @NotBlank @Pattern(regexp="[a-fA-F0-9]{64}") String sha256Hash,
    @NotBlank @Pattern(regexp="[a-fA-F0-9]{64}") String allocationHash,
    @NotBlank @Pattern(regexp="NONE|DISPUTED|UNDETERMINED") String disputeStatus) {}
