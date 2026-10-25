package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * PS-64: one asset that the current Legal approval allows to be handed to a recipient.
 * BE-02: {@code recipientSource} (OWNER_DESIGNATED | COURT_DOCUMENT), {@code accountLinked}, and
 * {@code deliverable}/{@code blockedReason} tell Staff why a line cannot be delivered yet
 * (RECIPIENT_ACCOUNT_REQUIRED) without trying and failing.
 */
public record EligibleHandoverAssetResponse(
        UUID assetId,
        UUID recipientId,
        String description,
        String deliveryStatus,
        String assetName,
        String recipientName,
        String recipientSource,
        boolean accountLinked,
        boolean deliverable,
        String blockedReason
) {
    public EligibleHandoverAssetResponse(UUID assetId, UUID recipientId, String description, String deliveryStatus) {
        this(assetId, recipientId, description, deliveryStatus, null, null, null, true,
                ELIGIBLE.equals(deliveryStatus), null);
    }
    public static final String ELIGIBLE = "ELIGIBLE";
    public static final String DELIVERED = "DELIVERED";
    public static final String BLOCKED_ACCOUNT_REQUIRED = "RECIPIENT_ACCOUNT_REQUIRED";
}
