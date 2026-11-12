package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Một bản ghi quyết định tòa án (kết quả của {@code POST/GET .../court-decisions}).
 *
 * Các trường: {@code id}, {@code caseId}, {@code version}, {@code sha256} (hash file phiên bản đã đánh giá),
 * {@code result}, {@code reason}, {@code reviewedBy} (UUID Legal), {@code reviewedAt}.
 */
public record CourtDecisionResponse(UUID id, UUID caseId, int version, String sha256,
        String result, String reason, UUID reviewedBy, Instant reviewedAt) { }
