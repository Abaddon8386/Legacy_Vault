package com.legacyvault.verification.dto;

import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/**
 * PS-65: Staff selects the recipient and assets handed over; the service validates them against the approved scope.
 *
 * Body của {@code POST .../handover-sessions/{sessionId}/deliveries}.
 *
 * - {@code recipientId}: người nhận.
 * - {@code assetIds}: 1..100 tài sản giao.
 */
public record HandoverDeliveryRequest(
        @NotNull UUID recipientId,
        @NotEmpty @Size(max = 100) List<@NotNull UUID> assetIds
) {}
