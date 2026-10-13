package com.legacyvault.common.security;

import java.util.UUID;

public record CustomUserPrincipal(
        Long userId,
        UUID publicId,
        String email
) {
    public CustomUserPrincipal {
        if (userId == null || publicId == null || email == null || email.isBlank()) {
            throw new IllegalArgumentException("Invalid authenticated principal");
        }
    }
}