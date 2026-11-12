package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST /api/v1/legal-verifications/death-documents/{id}/decision}: {@code decision} và {@code reason} (bắt buộc, tối đa 1000 ký tự).
 */
public record LegalDeathDecisionRequest(
        @NotNull(message = "{validation.NotNull}")
        Decision decision,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 1000, message = "{validation.Size}")
        String reason
) {
    /**
     * Quyết định: {@code APPROVE}, {@code REJECT} hoặc {@code REQUEST_MORE} (yêu cầu bổ sung).
     */
    public enum Decision {
        APPROVE,
        REJECT,
        REQUEST_MORE
    }
}