package com.legacyvault.verification.dto;

import java.time.LocalDateTime;
import java.util.List;
import java.util.UUID;

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
    public HandoverReceiptResponse(UUID receiptId, UUID sessionId, UUID recipientId, List<UUID> assetIds,
            UUID staffId, int dossierVersionNo, String sha256Hash, String allocationHash,
            String confirmationType, LocalDateTime confirmedAt, UUID supersedesReceiptId) {
        this(receiptId, sessionId, recipientId, null, assetIds, staffId, dossierVersionNo, sha256Hash,
                allocationHash, confirmationType, confirmedAt, supersedesReceiptId);
    }
}
