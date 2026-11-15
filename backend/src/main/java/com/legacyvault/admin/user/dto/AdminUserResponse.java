package com.legacyvault.admin.user.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/** Các trường tài khoản công khai (theo danh sách cho phép) trả về cho Admin được ủy quyền. */
public record AdminUserResponse(
        UUID publicId,
        String fullName,
        String email,
        List<String> roles,
        Instant createdAt,
        String status,
        String accountStatus,
        String vaultStatus) {
}
