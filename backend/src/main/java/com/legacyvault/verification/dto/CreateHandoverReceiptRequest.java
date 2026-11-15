package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/**
 * Yêu cầu tạo biên bản bàn giao (handover receipt) trong một phiên bàn giao.
 * recipientId: người nhận; assetIds: tối đa 100 tài sản bàn giao; supersedesReceiptId: biên bản cũ bị thay thế (nếu có).
 * Client chỉ chọn; service đối chiếu với phân bổ đã được Legal phê duyệt.
 */
public record CreateHandoverReceiptRequest(
        @NotNull UUID recipientId,
        @NotEmpty @Size(max = 100) List<@NotNull UUID> assetIds,
        UUID supersedesReceiptId
) {}
