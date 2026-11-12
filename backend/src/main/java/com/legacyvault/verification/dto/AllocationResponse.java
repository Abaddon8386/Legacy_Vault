package com.legacyvault.verification.dto;

import java.util.UUID;

/**
 * Dòng phân bổ của một phiên bản (chỉ ID công khai). BE-02: kèm thông tin để Legal đối chiếu văn bản với tài sản và
 * người nhận; {@code recipientSource} là {@code OWNER_DESIGNATED} hoặc {@code COURT_DOCUMENT} (khi đó
 * {@code sourceVersionNo} là phiên bản văn bản nêu tên). {@code accountLinked=false} chỉ là thông tin, không chặn duyệt.
 *
 * Được nhúng trong {@link BasisVersionResponse#allocations()}.
 *
 * Các trường:
 * - {@code assetId}, {@code beneficiaryId}: UUID công khai của tài sản và người nhận.
 * - {@code description}: mô tả phần được chia.
 * - {@code assetName}, {@code assetType}: tên và loại tài sản để Legal đối chiếu.
 * - {@code recipientName}, {@code recipientRelationship}: tên và quan hệ của người nhận.
 * - {@code recipientSource}: nguồn người nhận (OWNER_DESIGNATED hoặc COURT_DOCUMENT).
 * - {@code sourceVersionNo}: phiên bản văn bản nêu tên người nhận (khi nguồn là COURT_DOCUMENT).
 * - {@code accountLinked}: người nhận đã liên kết tài khoản hay chưa (chỉ mang tính thông tin).
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
    /**
     * Constructor rút gọn: chỉ có ba trường cơ bản, các trường thông tin đối chiếu để null, {@code accountLinked=false}.
     */
    public AllocationResponse(UUID assetId, UUID beneficiaryId, String description) {
        this(assetId, beneficiaryId, description, null, null, null, null, null, null, false);
    }
}
