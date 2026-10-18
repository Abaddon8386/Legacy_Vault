package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

public record CourtDecisionResponse(UUID id, UUID caseId, int version, String sha256,
        String result, String reason, UUID reviewedBy, Instant reviewedAt) { }
