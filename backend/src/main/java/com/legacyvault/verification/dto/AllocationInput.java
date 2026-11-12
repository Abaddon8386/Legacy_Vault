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
 *
 * Dùng làm đầu vào trong {@link BasisIntakeMetadata} và {@code DistributionWorkflowDtos.ActionBody}.
 *
 * Các trường:
 * - {@code assetId}: UUID công khai của tài sản, bắt buộc.
 * - {@code beneficiaryId}: UUID người thụ hưởng đã có trong kho (có thể null khi dùng {@code courtRecipient}).
 * - {@code description}: mô tả phần được chia, tối đa 2000 ký tự.
 * - {@code courtRecipient}: thông tin người nhận chỉ có trong văn bản Tòa án (nhánh COURT).
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
    /**
     * Constructor rút gọn cho trường hợp không có {@code courtRecipient} (đặt null).
     */
    public AllocationInput(UUID assetId, UUID beneficiaryId, String description) {
        this(assetId, beneficiaryId, description, null);
    }
}
