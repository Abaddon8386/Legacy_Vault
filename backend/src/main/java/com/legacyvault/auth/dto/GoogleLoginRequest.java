package com.legacyvault.auth.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body của {@code POST /api/v1/auth/google} và {@code POST /api/v1/auth/google/link}: ID token do Google Identity
 * Services (GIS) cấp cho client (PS-83). Server sẽ xác minh chữ ký/audience/hạn dùng trong {@link GoogleIdTokenVerifier}.
 *
 * @param credential chuỗi ID token (JWT) từ Google, bắt buộc, tối đa 8192 ký tự
 */
public record GoogleLoginRequest(
        @NotBlank(message = "{auth.google.credential.required}")
        @Size(max = 8192, message = "{auth.google.credential.max}")
        String credential
) {
}
