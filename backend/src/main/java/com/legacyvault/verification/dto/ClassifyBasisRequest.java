package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Legal phân loại căn cứ phân chia và tạo hồ sơ căn cứ (ST-16, LV-BASIS-001). Chỉ Legal được chọn nhánh; Staff và Trustee
 * không bao giờ chọn (AC-L04). {@code ON_HOLD} nghĩa là chưa đủ thông tin phân loại (UNDETERMINED trong tài liệu nghiệp vụ).
 * {@code routeReason} ghi lý do và chứng cứ dẫn tới phân loại, bắt buộc với mọi nhánh.
 *
 * Body của {@code POST .../basis-dossier} và {@code POST .../basis-dossier/reclassification} (Legal).
 *
 * Các trường:
 * - {@code route}: nhánh được chọn, bắt buộc.
 * - {@code routeReason}: lý do phân loại, bắt buộc, tối đa 1000 ký tự.
 */
public record ClassifyBasisRequest(
        @NotNull(message = "{validation.NotNull}")
        Route route,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 1000, message = "{validation.Size}")
        String routeReason
) {

    /**
     * Nhánh phân loại: {@code NOTARIAL} (công chứng), {@code COURT} (tòa án), {@code ON_HOLD} (chưa đủ thông tin).
     */
    public enum Route {
        NOTARIAL,
        COURT,
        ON_HOLD
    }
}
