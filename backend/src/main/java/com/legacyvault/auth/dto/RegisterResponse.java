package com.legacyvault.auth.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

// DTO phản hồi đăng ký.
// Chỉ chứa dữ liệu công khai, không chứa mật khẩu hay password_hash.
public record RegisterResponse(
        UUID id,
        String fullName,
        String email,
        List<String> roles,
        String status,
        Instant createdAt
) {}