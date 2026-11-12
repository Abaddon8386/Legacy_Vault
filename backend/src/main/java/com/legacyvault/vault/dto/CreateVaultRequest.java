package com.legacyvault.vault.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Request tạo két ({@code POST /api/v1/vaults}).
 *
 * <ul>
 *   <li>{@code name}: tên két, bắt buộc, không rỗng, tối đa 150 ký tự (service sẽ cắt khoảng trắng hai đầu);</li>
 *   <li>{@code description}: mô tả tùy chọn, tối đa 1000 ký tự.</li>
 * </ul>
 */
public record CreateVaultRequest(
        @NotBlank(message = "{vault.name.notBlank}")
        @Size(max = 150, message = "{vault.name.max}")
        String name,

        @Size(max = 1000, message = "{vault.description.max}")
        String description
) {
}