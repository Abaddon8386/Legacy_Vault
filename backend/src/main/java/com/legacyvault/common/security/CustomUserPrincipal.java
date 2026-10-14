package com.legacyvault.common.security;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

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

    /**
     * userId nội bộ của người đang đăng nhập, lấy từ {@code @AuthenticationPrincipal}. Principal null nghĩa là
     * request không đi qua JwtAuthenticationFilter (không phải kiểu principal của hệ thống) -> coi như chưa đăng nhập.
     */
    public static Long requireUserId(CustomUserPrincipal principal) {
        if (principal == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED);
        }
        return principal.userId();
    }
}