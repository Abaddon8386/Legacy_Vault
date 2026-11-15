package com.legacyvault.common.security;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

import java.util.UUID;

/**
 * Principal của người dùng đã xác thực, được {@link JwtAuthenticationFilter} đặt vào SecurityContext.
 *
 * @param userId   id nội bộ (khóa chính), dùng cho truy vấn và audit
 * @param publicId id công khai (UUID), là subject của JWT
 * @param email    email đăng nhập
 */
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