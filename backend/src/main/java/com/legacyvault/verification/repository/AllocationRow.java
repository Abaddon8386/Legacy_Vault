package com.legacyvault.verification.repository;

import java.util.UUID;

import com.legacyvault.asset.entity.AssetType;

/**
 * Một dòng phân bổ kèm ID công khai của tài sản và người nhận, theo số phiên bản. BE-02: kèm thông tin hiển thị cho Legal
 * (tên tài sản/loại, tên người nhận, nguồn người nhận, phiên bản văn bản đã nêu tên, đã liên kết tài khoản hay chưa).
 * Các trường bổ sung KHÔNG tham gia hash phân bổ. {@code recipientLinkedUserId} chỉ dùng nội bộ để suy ra
 * {@link #accountLinked()}, không đưa ra API.
 */
public record AllocationRow(
        int versionNo,
        UUID assetId,
        UUID beneficiaryId,
        String description,
        String assetName,
        AssetType assetType,
        String recipientName,
        String recipientRelationship,
        String recipientSource,
        Integer sourceVersionNo,
        Long recipientLinkedUserId
) {
    public AllocationRow(int versionNo, UUID assetId, UUID beneficiaryId, String description) {
        this(versionNo, assetId, beneficiaryId, description, null, null, null, null, null, null, null);
    }

    public boolean accountLinked() {
        return recipientLinkedUserId != null;
    }
}
