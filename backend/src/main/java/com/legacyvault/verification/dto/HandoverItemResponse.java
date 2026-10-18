package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.UUID;

/** A recorded delivery (PS-65). Public ids only. */
public record HandoverItemResponse(
        UUID itemId,
        UUID sessionId,
        UUID assetId,
        UUID recipientId,
        String status,
        LocalDateTime deliveredAt,
        UUID staffId
) {}
