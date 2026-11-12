package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * PS-64: one asset that the current Legal approval allows to be handed to a recipient.
 * BE-02: {@code recipientSource} (OWNER_DESIGNATED | COURT_DOCUMENT), {@code accountLinked}, and
 * {@code deliverable}/{@code blockedReason} tell Staff why a line cannot be delivered yet
 * (RECIPIENT_ACCOUNT_REQUIRED) without trying and failing.
 *
 * Kết quả {@code GET .../handover-sessions/{sessionId}/eligible-assets}.
 *
 * Các trường: {@code assetId}, {@code recipientId}, {@code description}, {@code deliveryStatus}
 * (ELIGIBLE, DELIVERED hoặc RECIPIENT_ACCOUNT_REQUIRED), {@code assetName}, {@code recipientName},
 * {@code recipientSource}, {@code accountLinked}, {@code deliverable}, {@code blockedReason}.
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
    /**
     * Constructor rút gọn: {@code accountLinked=true}, {@code deliverable} = (trạng thái là ELIGIBLE).
     */
    public EligibleHandoverAssetResponse(UUID assetId, UUID recipientId, String description, String deliveryStatus) {
        this(assetId, recipientId, description, deliveryStatus, null, null, null, true,
                ELIGIBLE.equals(deliveryStatus), null);
    }
    /**
     * Trạng thái: tài sản có thể bàn giao.
     */
    public static final String ELIGIBLE = "ELIGIBLE";
    /**
     * Trạng thái: tài sản đã bàn giao.
     */
    public static final String DELIVERED = "DELIVERED";
    /**
     * Lý do chặn: người nhận chưa có tài khoản liên kết.
     */
    public static final String BLOCKED_ACCOUNT_REQUIRED = "RECIPIENT_ACCOUNT_REQUIRED";
}
