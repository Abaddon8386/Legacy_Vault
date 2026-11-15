
package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Yêu cầu ghi nhận Legal đã rà soát hồ sơ căn cứ; reason bắt buộc.
 */
public record RecordLegalBasisReviewRequest(
        @NotBlank
        @Size(max = 1000)
        String reason
) {
}
