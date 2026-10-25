package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * Dòng phân bổ của một phiên bản (chỉ ID công khai). BE-02: kèm thông tin để Legal đối chiếu văn bản với tài sản và
 * người nhận; {@code recipientSource} là {@code OWNER_DESIGNATED} hoặc {@code COURT_DOCUMENT} (khi đó
 * {@code sourceVersionNo} là phiên bản văn bản nêu tên). {@code accountLinked=false} chỉ là thông tin, không chặn duyệt.
 */
public record AllocationResponse(
        UUID assetId,
        UUID beneficiaryId,
        String description,
        String assetName,
        String assetType,
        String recipientName,
        String recipientRelationship,
        String recipientSource,
        Integer sourceVersionNo,
        boolean accountLinked
) {
    public AllocationResponse(UUID assetId, UUID beneficiaryId, String description) {
        this(assetId, beneficiaryId, description, null, null, null, null, null, null, false);
    }
}
