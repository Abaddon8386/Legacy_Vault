package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * Legal decision only when it still covers the current dossier snapshot.
 *
 * Được nhúng trong {@link BasisDossierResponse#currentDecision()}.
 *
 * Các trường: {@code id}, {@code status}, {@code reason}, {@code documentVersion} (phiên bản được quyết định),
 * {@code documentSha256}, {@code allocationSha256} (hash phạm vi phân bổ tại thời điểm quyết định).
 */
public record CurrentBasisDecision(UUID id, String status, String reason, int documentVersion,
        String documentSha256, String allocationSha256) { }
