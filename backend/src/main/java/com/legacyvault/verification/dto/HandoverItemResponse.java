package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/**
 * A recorded delivery (PS-65). Public ids only.
 *
 * Các trường: {@code itemId}, {@code sessionId}, {@code assetId}, {@code recipientId}, {@code status},
 * {@code deliveredAt}, {@code staffId} (Staff thực hiện). Dùng cho {@code POST/GET .../deliveries}.
 */
public record HandoverItemResponse(
        UUID itemId,
        UUID sessionId,
        UUID assetId,
        UUID recipientId,
        String status,
        LocalDateTime deliveredAt,
        UUID staffId
) {}
