package com.legacyvault.auth.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Phản hồi {@code 201 Created} của {@code POST /api/v1/auth/register}. Chỉ chứa dữ liệu công khai, không có
 * mật khẩu hay {@code password_hash}.
 *
 * @param id        publicId (UUID) của tài khoản mới
 * @param fullName họ tên đã trim
 * @param email    email đã chuẩn hóa
 * @param roles    role đã bỏ tiền tố, mặc định {@code VAULT_OWNER}
 * @param status   trạng thái tài khoản ({@code ACTIVE})
 * @param createdAt thời điểm tạo (UTC)
 */
public record RegisterResponse(
        UUID id,
        String fullName,
        String email,
        List<String> roles,
        String status,
        Instant createdAt
) {}