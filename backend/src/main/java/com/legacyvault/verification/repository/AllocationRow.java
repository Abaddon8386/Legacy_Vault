package com.legacyvault.verification.repository;

import java.util.UUID;

import com.legacyvault.asset.entity.AssetType;

/**
 * Một dòng phân bổ kèm ID công khai của tài sản và người nhận, theo số phiên bản. BE-02: kèm thông tin hiển thị cho Legal
 * (tên tài sản/loại, tên người nhận, nguồn người nhận, phiên bản văn bản đã nêu tên, đã liên kết tài khoản hay chưa).
 * Các trường bổ sung KHÔNG tham gia hash phân bổ. {@code recipientLinkedUserId} chỉ dùng nội bộ để suy ra
 * {@link #accountLinked()}, không đưa ra API.
 *
 * Kết quả của {@code LegalBasisVersionAllocationRepository.findRowsByDossier}; được dịch vụ hồ sơ căn cứ đổi thành
 * {@code AllocationResponse} cho API {@code GET .../basis-dossier}. Bảng nguồn: {@code legal_basis_version_allocations},
 * {@code legal_basis_dossier_versions}, {@code assets}, {@code beneficiaries}.
 *
 * Các trường: {@code versionNo}, {@code assetId}, {@code beneficiaryId} (UUID công khai), {@code description},
 * {@code assetName}, {@code assetType}, {@code recipientName}, {@code recipientRelationship}, {@code recipientSource},
 * {@code sourceVersionNo}, {@code recipientLinkedUserId} (khóa nội bộ của tài khoản liên kết).
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
    /**
     * Constructor rút gọn: các trường hiển thị bổ sung đều null.
     */
    public AllocationRow(int versionNo, UUID assetId, UUID beneficiaryId, String description) {
        this(versionNo, assetId, beneficiaryId, description, null, null, null, null, null, null, null);
    }

    /**
     * True khi người nhận đã liên kết tài khoản chính thức ({@code recipientLinkedUserId != null}).
     */
    public boolean accountLinked() {
        return recipientLinkedUserId != null;
    }
}
