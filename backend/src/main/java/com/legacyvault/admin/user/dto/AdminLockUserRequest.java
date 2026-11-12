package com.legacyvault.admin.user.dto;

import jakarta.validation.constraints.Size;

/**
 * Optional free-text reason recorded in the audit trail when an Admin locks an account.
 * Body của {@code POST /api/v1/admin/users/{publicId}/lock}; có thể bỏ trống.
 */
public record AdminLockUserRequest(@Size(max = 255) String reason) {
}
