package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Dữ liệu để Legal đối chiếu di chúc của một ca: các lần Staff nhận bản gốc, các bản scan (kèm hash) và các kết quả đối
 * chiếu đã có. {@code approvalBlocked} là true cho tới khi kết quả đối chiếu <b>mới nhất</b> của ca là {@code MATCH}.
 */
public record WillComparisonOverviewResponse(
        UUID caseId,
        String vaultStatus,
        boolean approvalBlocked,
        String latestResult,
        List<OriginalIntake> originalWillIntakes,
        List<Will> wills,
        List<WillComparisonResponse> comparisons
) {

    public record OriginalIntake(UUID id, Instant receivedAt, String evidenceReference) {
    }

    public record Will(UUID id, List<Version> versions) {
    }

    public record Version(int version, String contentType, long sizeBytes, String sha256, Instant uploadedAt) {
    }
}
