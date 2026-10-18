package com.legacyvault.verification.dto;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;
import java.util.UUID;

/** Client selects intended recipient/assets; the service validates them against approved allocations. */
public record CreateHandoverReceiptRequest(
        @NotNull UUID recipientId,
        @NotEmpty @Size(max = 100) List<@NotNull UUID> assetIds,
        UUID supersedesReceiptId
) {}
