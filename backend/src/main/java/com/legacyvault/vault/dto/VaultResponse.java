package com.legacyvault.vault.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Thông tin Vault trả về cho chủ sở hữu; {@code id} là public ID (không lộ khóa nội bộ).
 */
public record VaultResponse(
        UUID id,
        String name,
        String description,
        String status,
        Instant createdAt,
        Instant updatedAt
) {
}