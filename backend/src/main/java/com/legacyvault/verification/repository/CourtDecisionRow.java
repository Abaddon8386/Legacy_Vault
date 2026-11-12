package com.legacyvault.verification.repository;
import com.legacyvault.verification.dto.CourtDecisionResponse;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Projection một quyết định tòa án (chỉ UUID công khai, không có khóa nội bộ: id, ca, người đánh giá; kèm phiên bản, SHA-256, kết quả, lý do, thời điểm), trả về từ {@link CourtDecisionRepository#findRows}.
 */
public record CourtDecisionRow(UUID id, UUID caseId, int version, String sha256, String result,
        String reason, UUID reviewedBy, LocalDateTime reviewedAt) {
    /**
     * Chuyển sang {@link CourtDecisionResponse}, đổi {@code reviewedAt} sang Instant UTC.
     */
    public CourtDecisionResponse response() {
        return new CourtDecisionResponse(id, caseId, version, sha256, result, reason, reviewedBy, reviewedAt.toInstant(ZoneOffset.UTC));
    }
}
