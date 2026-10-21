package com.legacyvault.admin.user.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Public, allow-listed account fields returned to authorized Admin users. */
public record AdminUserResponse(
        UUID publicId,
        String fullName,
        String email,
        List<String> roles,
        Instant createdAt,
        String status) {
}
