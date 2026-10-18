package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/** Một dòng phân bổ theo văn bản căn cứ: tài sản nào cho người nhận nào. Cả hai phải thuộc Vault của ca. */
public record AllocationInput(
        @NotNull(message = "{validation.NotNull}")
        UUID assetId,

        @NotNull(message = "{validation.NotNull}")
        UUID beneficiaryId,

        @Size(max = 2000, message = "{validation.Size}")
        String description
) {
}
