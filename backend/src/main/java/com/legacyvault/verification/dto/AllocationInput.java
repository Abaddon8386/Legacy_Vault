package com.legacyvault.verification.dto;

import com.legacyvault.beneficiary.BeneficiaryDtos;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Một dòng phân bổ theo văn bản căn cứ: tài sản nào cho người nhận nào. Tài sản phải thuộc Vault của ca.
 * Người nhận là đúng một trong hai: {@code beneficiaryId} (người đã có trong kho) hoặc {@code courtRecipient}
 * (BE-02: người chỉ có tên trong văn bản Tòa án, chỉ hợp lệ ở nhánh COURT; kiểm tra ở service).
 */
public record AllocationInput(
        @NotNull(message = "{validation.NotNull}")
        UUID assetId,

        UUID beneficiaryId,

        @Size(max = 2000, message = "{validation.Size}")
        String description,

        @Valid
        BeneficiaryDtos.UpsertRequest courtRecipient
) {
    public AllocationInput(UUID assetId, UUID beneficiaryId, String description) {
        this(assetId, beneficiaryId, description, null);
    }
}
