package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * PS-64: một tài sản mà phê duyệt hiện hành của Legal cho phép giao cho một người nhận.
 * BE-02: {@code recipientSource} (OWNER_DESIGNATED | COURT_DOCUMENT), {@code accountLinked},
 * {@code deliverable}/{@code blockedReason} cho Staff biết vì sao một dòng chưa giao được
 * (RECIPIENT_ACCOUNT_REQUIRED) mà không phải thử rồi thất bại.
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
