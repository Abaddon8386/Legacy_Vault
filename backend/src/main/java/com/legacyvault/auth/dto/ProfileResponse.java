package com.legacyvault.auth.dto;

import java.util.List;
import java.util.UUID;

/**
 * Hồ sơ công khai (đã lọc trường) của tài khoản đang đăng nhập, trả về bởi {@code GET /api/v1/auth/me}
 * và {@code PATCH /api/v1/auth/me}.
 *
 * @param id                   publicId (UUID) của tài khoản
 * @param fullName             họ tên
 * @param email                email đã chuẩn hóa
 * @param phoneNumber          số điện thoại, có thể {@code null}
 * @param roles                role đã bỏ tiền tố {@code ROLE_}, sắp xếp và loại trùng
 * @param passwordLoginEnabled {@code false} nếu tài khoản Google-only chưa đặt mật khẩu
 */
public record ProfileResponse(UUID id, String fullName, String email, String phoneNumber, List<String> roles,
        boolean passwordLoginEnabled) {
}
