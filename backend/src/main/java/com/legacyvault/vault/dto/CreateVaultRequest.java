package com.legacyvault.vault.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Body tạo Vault.
 *
 * @param name        tên Vault (bắt buộc, tối đa 150 ký tự)
 * @param description mô tả (tùy chọn, tối đa 1000 ký tự)
 */
public record CreateVaultRequest(
        @NotBlank(message = "{vault.name.notBlank}")
        @Size(max = 150, message = "{vault.name.max}")
        String name,

        @Size(max = 1000, message = "{vault.description.max}")
        String description
) {
}