package com.legacyvault.vault.dto;

import java.time.Instant;
import java.util.UUID;

/**
 * Phản hồi thông tin két, trả bởi {@code VaultController}.
 *
 * <ul>
 *   <li>{@code id}: UUID công khai của két (không phải khóa chính nội bộ);</li>
 *   <li>{@code name}: tên két;</li>
 *   <li>{@code description}: mô tả két, có thể null;</li>
 *   <li>{@code status}: trạng thái két, ví dụ {@code ACTIVE}, {@code AWAITING_VERIFICATION}, {@code ARCHIVED};</li>
 *   <li>{@code createdAt}, {@code updatedAt}: thời điểm tạo và cập nhật cuối.</li>
 * </ul>
 */
public record VaultResponse(
        UUID id,
        String name,
        String description,
        String status,
        Instant createdAt,
        Instant updatedAt
) {
}