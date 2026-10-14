package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresInSeconds,
        AuthUserResponse user
) {
    public record AuthUserResponse(
            UUID id,
            String fullName,
            String email,
            List<String> roles
    ) {
    }
}