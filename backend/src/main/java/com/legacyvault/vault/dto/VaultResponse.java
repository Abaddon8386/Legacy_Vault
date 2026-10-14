package com.legacyvault.vault.dto;

import java.time.Instant;
import java.util.UUID;

public record VaultResponse(
        UUID id,
        String name,
        String description,
        String status,
        Instant createdAt,
        Instant updatedAt
) {
}