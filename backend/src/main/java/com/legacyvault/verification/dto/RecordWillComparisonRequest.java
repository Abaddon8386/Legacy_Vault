package com.legacyvault.verification.dto;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.UUID;

/**
 * Legal ghi kết quả đối chiếu bản di chúc giấy gốc với một phiên bản bản scan (ST-15, LV-WILL-001). Hash của phiên bản
 * do server lấy từ dữ liệu đã lưu, không nhận từ request. Người đối chiếu và thời điểm do server đặt.
 * {@code reason} bắt buộc khi kết quả là {@code MISMATCH} hoặc {@code INCONCLUSIVE} (kiểm tra ở service).
 */
public record RecordWillComparisonRequest(
        @NotNull(message = "{validation.NotNull}")
        UUID originalWillIntakeId,

        @NotNull(message = "{validation.NotNull}")
        UUID willId,

        @NotNull(message = "{validation.NotNull}")
        @Min(value = 1, message = "{validation.Min}")
        Integer version,

        @NotNull(message = "{validation.NotNull}")
        Result result,

        @Size(max = 1000, message = "{validation.Size}")
        String reason
) {

    public enum Result {
        MATCH,
        MISMATCH,
        INCONCLUSIVE
    }
}
