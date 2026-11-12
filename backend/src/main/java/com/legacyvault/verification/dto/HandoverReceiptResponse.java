package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

/**
 * Biên nhận bàn giao, kết quả của {@code POST/GET .../handover-sessions/{sessionId}/receipts}.
 *
 * Các trường: {@code receiptId}, {@code sessionId}, {@code recipientId}, {@code recipientName}, {@code assetIds},
 * {@code staffId}, {@code dossierVersionNo}, {@code sha256Hash}, {@code allocationHash} (khóa biên nhận vào đúng
 * snapshot hồ sơ), {@code confirmationType}, {@code confirmedAt}, {@code supersedesReceiptId}.
 */
public record HandoverReceiptResponse(
        UUID receiptId,
        UUID sessionId,
        UUID recipientId,
        String recipientName,
        List<UUID> assetIds,
        UUID staffId,
        int dossierVersionNo,
        String sha256Hash,
        String allocationHash,
        String confirmationType,
        LocalDateTime confirmedAt,
        UUID supersedesReceiptId
) {
    /**
     * Constructor không có {@code recipientName} (đặt null).
     */
    public HandoverReceiptResponse(UUID receiptId, UUID sessionId, UUID recipientId, List<UUID> assetIds,
            UUID staffId, int dossierVersionNo, String sha256Hash, String allocationHash,
            String confirmationType, LocalDateTime confirmedAt, UUID supersedesReceiptId) {
        this(receiptId, sessionId, recipientId, null, assetIds, staffId, dossierVersionNo, sha256Hash,
                allocationHash, confirmationType, confirmedAt, supersedesReceiptId);
    }
}
