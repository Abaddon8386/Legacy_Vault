
package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

public record RecordLegalBasisReviewRequest(
        @NotBlank
        @Size(max = 1000)
        String reason
) {
}
