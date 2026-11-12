package com.legacyvault.admin.user.dto;

import jakarta.validation.constraints.NotBlank;

/** Body của {@code PUT /api/v1/admin/users/{publicId}/role}: {@code role} là role mới (bắt buộc, không rỗng). */
public record AdminUpdateUserRoleRequest(@NotBlank String role) {
}
