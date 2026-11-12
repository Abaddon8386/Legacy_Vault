package com.legacyvault.common.security;

import com.legacyvault.common.error.BusinessException;
import com.legacyvault.common.error.ErrorCode;

import java.util.UUID;

/**
 * Principal của người dùng đã xác thực, do {@link JwtAuthenticationFilter} tạo và đặt vào SecurityContext; controller
 * nhận qua {@code @AuthenticationPrincipal}.
 *
 * <ul>
 *   <li>{@code userId}: khóa chính nội bộ trong bảng {@code users};</li>
 *   <li>{@code publicId}: UUID công khai (là subject của JWT);</li>
 *   <li>{@code email}: email đăng nhập đã chuẩn hóa.</li>
 * </ul>
 */
public record CustomUserPrincipal(
        Long userId,
        UUID publicId,
        String email
) {
    /** Kiểm tra ba trường đều có giá trị; ném {@link IllegalArgumentException} nếu thiếu. */
    public CustomUserPrincipal {
        if (userId == null || publicId == null || email == null || email.isBlank()) {
            throw new IllegalArgumentException("Invalid authenticated principal");
        }
    }

    /**
     * userId nội bộ của người đang đăng nhập, lấy từ {@code @AuthenticationPrincipal}. Principal null nghĩa là
     * request không đi qua JwtAuthenticationFilter (không phải kiểu principal của hệ thống) -> coi như chưa đăng nhập.
     *
     * @param principal principal từ controller, có thể null
     * @return {@code userId} của principal
     * @throws BusinessException {@code UNAUTHENTICATED} nếu principal null
     */
    public static Long requireUserId(CustomUserPrincipal principal) {
        if (principal == null) {
            throw new BusinessException(ErrorCode.UNAUTHENTICATED);
        }
        return principal.userId();
    }
}