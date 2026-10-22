package com.legacyvault.verification.dto;

import java.util.UUID;

/** PS-64: one asset that the current Legal approval allows to be handed to a recipient. */
public record EligibleHandoverAssetResponse(
        UUID assetId,
        UUID recipientId,
        String description,
        String deliveryStatus,
        String assetName,
        String recipientName
) {
    public EligibleHandoverAssetResponse(UUID assetId, UUID recipientId, String description, String deliveryStatus) {
        this(assetId, recipientId, description, deliveryStatus, null, null);
    }
    public static final String ELIGIBLE = "ELIGIBLE";
    public static final String DELIVERED = "DELIVERED";
}
