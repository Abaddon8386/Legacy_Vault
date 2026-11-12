package com.legacyvault.verification.repository;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * Một dòng đối chiếu kèm các ID công khai cần cho response (không có khóa nội bộ).
 *
 * Projection của {@code WillComparisonRepository.findRowsByCase}; {@code WillComparisonResponse.from} chuyển thành response.
 */
public record WillComparisonRow(
        UUID id,
        UUID originalWillIntakeId,
        UUID willId,
        int version,
        String sha256,
        String result,
        UUID checkedBy,
        String reason,
        LocalDateTime comparedAt
) {
}
