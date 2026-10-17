package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Hồ sơ căn cứ phân chia của một ca. {@code routeReason} chỉ có khi người xem là Legal (lý do phân loại có thể chứa
 * thông tin tranh chấp); với Staff nó là {@code null}. {@code versions} mới nhất trước.
 */
public record BasisDossierResponse(
        UUID id,
        UUID caseId,
        String route,
        String status,
        String disputeStatus,
        String routeReason,
        UUID classifiedBy,
        Instant createdAt,
        Instant updatedAt,
        List<BasisVersionResponse> versions,
        int requiredVersion
) {
}
