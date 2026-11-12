package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST /api/v1/auth/password/setup}: đặt mật khẩu lần đầu cho tài khoản chỉ đăng nhập bằng Google.
 * Cần ID token Google mới để một phiên trần không thể tự đặt mật khẩu: subject của token phải đã liên kết với
 * tài khoản đang đăng nhập (kiểm tra trong {@code GoogleAuthService.setupPassword}).
 *
 * @param password   mật khẩu mới, 8-72 ký tự và thỏa {@link com.legacyvault.auth.policy.ValidPassword}
 * @param credential ID token Google mới, bắt buộc, tối đa 8192 ký tự
 */
public record PasswordSetupRequest(
        @NotBlank(message = "{auth.register.password.required}")
        @Size(min = 8, max = 72, message = "{auth.register.password.size}")
        @com.legacyvault.auth.policy.ValidPassword
        String password,

        @NotBlank(message = "{auth.google.credential.required}")
        @Size(max = 8192, message = "{auth.google.credential.max}")
        String credential
) {}
