
package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST .../basis-dossier/request-supplementation}: {@code reason} là lý do trả hồ sơ về Staff (bắt buộc, tối đa 1000 ký tự).
 */
public record RecordLegalBasisReviewRequest(
        @NotBlank
        @Size(max = 1000)
        String reason
) {
}
