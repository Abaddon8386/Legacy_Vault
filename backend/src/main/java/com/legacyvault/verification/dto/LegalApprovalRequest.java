package com.legacyvault.verification.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu Legal duyệt/từ chối phân bổ theo văn bản căn cứ.
 * versionNo, sha256Hash, allocationHash: Legal gửi đúng phiên bản và mã băm đã xem để tránh duyệt nhầm bản đã thay đổi; reason bắt buộc.
 */
public record LegalApprovalRequest(
        @NotNull Decision decision,
        @NotNull @Min(1) Integer versionNo,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String sha256Hash,
        @NotBlank @Pattern(regexp = "(?i)[a-f0-9]{64}") String allocationHash,
        @NotBlank @Size(max = 1000) String reason
) {
    public enum Decision { APPROVE, REJECT }
}
