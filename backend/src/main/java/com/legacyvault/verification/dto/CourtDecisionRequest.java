package com.legacyvault.verification.dto;

import jakarta.validation.constraints.*;

/** Legal's assessment of the exact forwarded court document version, never an automatic legal judgment. */
public record CourtDecisionRequest(
        @NotNull(message = "{validation.NotNull}") @Min(value = 1, message = "{validation.Min}") Integer version,
        @NotNull(message = "{validation.NotNull}") Result result,
        @NotBlank(message = "{validation.NotBlank}") @Size(max = 1000, message = "{validation.Size}") String reason) {
    public enum Result { VALID, INVALID, INCONCLUSIVE }
}
