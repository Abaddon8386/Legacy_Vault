package com.legacyvault.verification.dto;
import jakarta.validation.constraints.*;

public record HoldBasisRequest(
        @NotNull(message = "{validation.NotNull}") Cause cause,
        @NotBlank(message = "{validation.NotBlank}") @Size(max = 1000, message = "{validation.Size}") String reason) {
    public enum Cause { NEW_DISPUTE, INSUFFICIENT_EVIDENCE }
}
