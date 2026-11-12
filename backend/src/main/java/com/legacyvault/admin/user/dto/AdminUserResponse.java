package com.legacyvault.admin.user.dto;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

/**
 * Các trường tài khoản công khai (theo danh sách cho phép) trả về cho Admin; không có id nội bộ hay mật khẩu.
 * <p>Trả về từ các API {@code /api/v1/admin/users}. {@code status} là trạng thái gốc (DELETED nếu xoá mềm);
 * {@code accountStatus} là trạng thái hiển thị (ACTIVE chuyển thành IN_PROCESS khi tài khoản đang trong hồ sơ xử lý);
 * {@code vaultStatus} chỉ có cho Vault Owner: NO_VAULT, ACTIVE, IN_PROCESS hoặc ARCHIVED.
 */
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
