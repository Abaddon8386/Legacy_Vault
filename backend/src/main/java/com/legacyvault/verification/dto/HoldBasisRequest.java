package com.legacyvault.verification.dto;
import jakarta.validation.constraints.*;

/**
 * Body của {@code POST .../basis-dossier/hold}: {@code cause} (nguyên nhân) và {@code reason} (lý do, tối đa 1000 ký tự).
 */
public record HoldBasisRequest(
        /**
         * Nguyên nhân tạm giữ: có tranh chấp mới hoặc chứng cứ chưa đủ.
         */
        @NotNull(message = "{validation.NotNull}") Cause cause,
        @NotBlank(message = "{validation.NotBlank}") @Size(max = 1000, message = "{validation.Size}") String reason) {
    public enum Cause { NEW_DISPUTE, INSUFFICIENT_EVIDENCE }
}
