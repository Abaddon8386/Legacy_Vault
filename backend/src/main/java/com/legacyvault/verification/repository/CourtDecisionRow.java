package com.legacyvault.verification.repository;
import com.legacyvault.verification.dto.CourtDecisionResponse;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

public record CourtDecisionRow(UUID id, UUID caseId, int version, String sha256, String result,
        String reason, UUID reviewedBy, LocalDateTime reviewedAt) {
    public CourtDecisionResponse response() {
        return new CourtDecisionResponse(id, caseId, version, sha256, result, reason, reviewedBy, reviewedAt.toInstant(ZoneOffset.UTC));
    }
}
