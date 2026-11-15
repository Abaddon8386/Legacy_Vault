package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

/** Kết quả đăng nhập: JWT, loại token (Bearer), thời hạn tính bằng giây và thông tin người dùng (role đã bỏ tiền tố {@code ROLE_}). */
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