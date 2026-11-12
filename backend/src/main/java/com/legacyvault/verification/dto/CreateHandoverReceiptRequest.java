package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * Client chọn người nhận và các tài sản dự kiến; service kiểm tra chúng với các phân bổ đã được duyệt.
 *
 * Body của {@code POST .../handover-sessions/{sessionId}/receipts}.
 *
 * - {@code recipientId}: người nhận dự kiến.
 * - {@code assetIds}: 1..100 tài sản bàn giao.
 * - {@code supersedesReceiptId}: biên nhận cũ bị thay thế (tùy chọn).
 */
public record CreateHandoverReceiptRequest(
        @NotNull UUID recipientId,
        @NotEmpty @Size(max = 100) List<@NotNull UUID> assetIds,
        UUID supersedesReceiptId
) {}
