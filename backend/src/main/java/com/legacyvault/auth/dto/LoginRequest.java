package com.legacyvault.auth.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST /api/v1/auth/login} (đăng nhập bằng email + mật khẩu), được {@code AuthService.login} xử lý.
 *
 * @param email    email đăng nhập, bắt buộc, đúng định dạng, tối đa 254 ký tự (được chuẩn hóa bằng {@link EmailNormalizer})
 * @param password mật khẩu thô, bắt buộc, tối đa 72 ký tự (giới hạn byte của BCrypt)
 */
public record LoginRequest(
        @NotBlank(message = "{auth.login.email.required}")
        @Email(message = "{auth.login.email.invalid}")
        @Size(max = 254, message = "{auth.login.email.max}")
        String email,

        @NotBlank(message = "{auth.login.password.required}")
        @Size(max = 72, message = "{auth.login.password.max}")
        String password
) {
}