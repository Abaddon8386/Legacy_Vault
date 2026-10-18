package com.legacyvault.verification.dto;

import java.time.Instant;
import java.util.UUID;

public record LegalVaultUnlockResponse(UUID caseId, UUID vaultId, String status,
        UUID unlockedBy, Instant unlockedAt) {}
