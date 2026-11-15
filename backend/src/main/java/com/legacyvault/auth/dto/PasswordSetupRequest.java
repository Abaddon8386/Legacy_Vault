package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Mật khẩu lần đầu cho tài khoản từ trước đến nay chỉ đăng nhập bằng Google. Bắt buộc có Google ID token mới để
 * một phiên đăng nhập trơn không thể tự đặt mật khẩu: subject của token phải được liên kết với tài khoản đang đăng nhập.
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
