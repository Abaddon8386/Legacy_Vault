package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

/**
 * Phản hồi đăng nhập thành công của {@code POST /api/v1/auth/login} và {@code POST /api/v1/auth/google}.
 *
 * @param accessToken      JWT truy cập do {@link com.legacyvault.auth.JwtService} ký (chứa roles và authVersion)
 * @param tokenType        luôn là {@code "Bearer"}
 * @param expiresInSeconds thời gian sống của token tính bằng giây
 * @param user             thông tin tóm tắt người dùng vừa đăng nhập
 */
public record LoginResponse(
        String accessToken,
        String tokenType,
        long expiresInSeconds,
        AuthUserResponse user
) {
    /**
     * Thông tin người dùng trả kèm token.
     *
     * @param id       publicId (UUID) của tài khoản, không phải khóa nội bộ
     * @param fullName họ tên hiển thị
     * @param email    email đã chuẩn hóa
     * @param roles    danh sách role đã bỏ tiền tố {@code ROLE_} (ví dụ {@code VAULT_OWNER})
     */
    public record AuthUserResponse(
            UUID id,
            String fullName,
            String email,
            List<String> roles
    ) {
    }
}