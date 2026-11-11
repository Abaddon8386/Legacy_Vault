package com.legacyvault.admin.user.dto;

import jakarta.validation.constraints.NotBlank;

public record AdminUpdateUserRoleRequest(@NotBlank String role) {
}
