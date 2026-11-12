package com.legacyvault.verification.dto;

import jakarta.validation.constraints.*;

/**
 * Đánh giá của Legal về đúng phiên bản văn bản Tòa án đã được chuyển; không phải phán quyết pháp lý tự động.
 *
 * Body của {@code POST .../basis-dossier/court-decisions}.
 *
 * Các trường:
 * - {@code version}: phiên bản văn bản Tòa án được đánh giá (>= 1).
 * - {@code result}: kết quả đánh giá.
 * - {@code reason}: lý do, bắt buộc, tối đa 1000 ký tự.
 */
public record CourtDecisionRequest(
        /**
         * Kết quả: {@code VALID} (hợp lệ), {@code INVALID} (không hợp lệ), {@code INCONCLUSIVE} (chưa kết luận).
         */
        @NotNull(message = "{validation.NotNull}") @Min(value = 1, message = "{validation.Min}") Integer version,
        @NotNull(message = "{validation.NotNull}") Result result,
        @NotBlank(message = "{validation.NotBlank}") @Size(max = 1000, message = "{validation.Size}") String reason) {
    public enum Result { VALID, INVALID, INCONCLUSIVE }
}
