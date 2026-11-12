package com.legacyvault.auth.dto;

/**
 * Phản hồi của {@code POST /api/v1/auth/password/setup}.
 *
 * @param passwordLoginEnabled {@code true} khi tài khoản đã được bật đăng nhập bằng mật khẩu
 */
public record PasswordSetupResponse(boolean passwordLoginEnabled) {}
