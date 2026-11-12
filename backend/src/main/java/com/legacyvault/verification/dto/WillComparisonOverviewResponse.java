package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Dữ liệu để Legal đối chiếu di chúc của một ca: các lần Staff nhận bản gốc, các bản scan (kèm hash) và các kết quả đối
 * chiếu đã có. {@code approvalBlocked} là true cho tới khi kết quả đối chiếu <b>mới nhất</b> của ca là {@code MATCH}.
 *
 * Kết quả của {@code GET .../will-comparisons}.
 *
 * Các trường: {@code caseId}, {@code vaultStatus}, {@code approvalBlocked}, {@code latestResult}, và danh sách
 * {@code originalWillIntakes}, {@code wills}, {@code comparisons}.
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

    /**
     * Một lần Staff nhận bản giấy gốc.
     */
    public record OriginalIntake(UUID id, Instant receivedAt, String evidenceReference) {
    }

    /**
     * Một di chúc số cùng các phiên bản của nó.
     */
    public record Will(UUID id, List<Version> versions) {
    }

    /**
     * Một phiên bản bản scan (kèm hash SHA-256).
     */
    public record Version(int version, String contentType, long sizeBytes, String sha256, Instant uploadedAt) {
    }
}
