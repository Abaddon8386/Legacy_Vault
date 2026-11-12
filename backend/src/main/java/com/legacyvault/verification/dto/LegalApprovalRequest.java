package com.legacyvault.verification.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST .../basis-dossier/decision}. Legal phê duyệt/từ chối đúng snapshot đã xem.
 *
 * - {@code decision}: APPROVE hoặc REJECT.
 * - {@code versionNo}, {@code sha256Hash}, {@code allocationHash}: snapshot được quyết định.
 * - {@code reason}: lý do, tối đa 1000 ký tự.
 */
public record LegalApprovalRequest(
        @NotNull Decision decision,
        @NotNull @Min(1) Integer versionNo,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String sha256Hash,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationHash,
        @NotBlank @Size(max = 1000) String reason
) {
    /**
     * Quyết định: phê duyệt hoặc từ chối.
     */
    public enum Decision { APPROVE, REJECT }
}
