package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record LegalDeathDecisionRequest(
        @NotNull(message = "{validation.NotNull}")
        Decision decision,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 1000, message = "{validation.Size}")
        String reason
) {
    public enum Decision {
        APPROVE,
        REJECT,
        REQUEST_MORE
    }
}