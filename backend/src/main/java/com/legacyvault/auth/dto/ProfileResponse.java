package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

/** Dữ liệu hồ sơ công khai (theo danh sách cho phép) của tài khoản đã xác thực. */
public record ProfileResponse(UUID id, String fullName, String email, String phoneNumber, List<String> roles,
        boolean passwordLoginEnabled) {
}
