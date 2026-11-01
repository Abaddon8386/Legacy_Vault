package com.legacyvault.verification.dto;

import java.util.UUID;

/** Legal decision only when it still covers the current dossier snapshot. */
public record CurrentBasisDecision(UUID id, String status, String reason, int documentVersion,
        String documentSha256, String allocationSha256) { }
