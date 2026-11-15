package com.legacyvault.admin.user.dto;

import com.legacyvault.auth.policy.ValidPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST /api/v1/admin/users/reset-password}: Admin đặt mật khẩu mới cho mọi tài khoản không phải Admin.
 *
 * <ul>
 *   <li>{@code email}: địa chỉ tài khoản đích. Được chuẩn hóa bằng {@code EmailNormalizer} trước
 *       khi tra cứu, nên chữ hoa/thường và khoảng trắng hai đầu không quan trọng.</li>
 *   <li>{@code newPassword}: mật khẩu cần lưu. Phải thỏa cùng policy với đăng ký
 *       ({@link ValidPassword}, 8 đến 72 ký tự); server băm nó và không bao giờ trả về hay log.</li>
 * </ul>
 */
public record AdminResetPasswordRequest(
        @NotBlank @Email @Size(max = 254) String email,
        @NotBlank @Size(min = 8, max = 72) @ValidPassword String newPassword) {

    /** Giữ mật khẩu mới khỏi log và đầu ra toString() vô tình; chỉ hiển thị email. */
    @Override
    public String toString() {
        return "AdminResetPasswordRequest[email=" + email + "]";
    }
}
