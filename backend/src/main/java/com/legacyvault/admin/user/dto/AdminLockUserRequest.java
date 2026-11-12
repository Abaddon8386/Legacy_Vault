package com.legacyvault.admin.user.dto;

import jakarta.validation.constraints.Size;

/**
 * Lý do (văn bản tự do, tuỳ chọn) được ghi vào audit khi Admin khoá một tài khoản.
 * Body của {@code POST /api/v1/admin/users/{publicId}/lock}; có thể bỏ trống.
 */
public record AdminLockUserRequest(@Size(max = 255) String reason) {
}
