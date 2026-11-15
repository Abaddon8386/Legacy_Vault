package com.legacyvault.auth.dto;

/** Kết quả thiết lập mật khẩu lần đầu; {@code passwordLoginEnabled} = true khi đăng nhập bằng mật khẩu đã được bật. */
public record PasswordSetupResponse(boolean passwordLoginEnabled) {}
