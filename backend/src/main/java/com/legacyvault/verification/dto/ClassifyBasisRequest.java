package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * Legal phân loại căn cứ phân chia và tạo hồ sơ căn cứ (ST-16, LV-BASIS-001). Chỉ Legal được chọn nhánh; Staff và Trustee
 * không bao giờ chọn (AC-L04). {@code ON_HOLD} nghĩa là chưa đủ thông tin phân loại (UNDETERMINED trong tài liệu nghiệp vụ).
 * {@code routeReason} ghi lý do và chứng cứ dẫn tới phân loại, bắt buộc với mọi nhánh.
 */
public record ClassifyBasisRequest(
        @NotNull(message = "{validation.NotNull}")
        Route route,

        @NotBlank(message = "{validation.NotBlank}")
        @Size(max = 1000, message = "{validation.Size}")
        String routeReason
) {

    public enum Route {
        NOTARIAL,
        COURT,
        ON_HOLD
    }
}
