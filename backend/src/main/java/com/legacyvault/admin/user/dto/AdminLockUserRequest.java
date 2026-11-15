package com.legacyvault.admin.user.dto;

import jakarta.validation.constraints.Size;

/** Lý do dạng văn bản tự do (tùy chọn), được ghi vào audit trail khi Admin khóa tài khoản. */
public record AdminLockUserRequest(@Size(max = 255) String reason) {
}
