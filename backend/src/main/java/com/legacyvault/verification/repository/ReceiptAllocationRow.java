package com.legacyvault.verification.repository;

import java.util.UUID;

/**
 * Authoritative allocation ids/public ids and approval state used to compose an immutable receipt.
 * BE-02: {@code recipientLinkedUserId} / {@code recipientSource} let the delivery step require a linked official account
 * (LV-HANDOVER-001) without reading the Owner configured list. The user id is internal and never leaves the service layer.
 *
 * Nguồn từ {@code LegalBasisVersionAllocationRepository.findReceiptRowsByDossier}; dùng bởi
 * {@code HandoverReceiptService}, {@code AllocationScopeHash}, {@link com.legacyvault.verification.group.GroupHandoverService}.
 *
 * Các trường: {@code versionNo}, {@code allocationId}, {@code assetId} (khóa nội bộ), {@code assetPublicId},
 * {@code beneficiaryId}, {@code beneficiaryPublicId}, trạng thái xác minh danh tính, {@code status}, {@code description},
 * {@code assetName}, {@code beneficiaryName}, {@code recipientLinkedUserId}, {@code recipientSource}.
 */
public record ReceiptAllocationRow(
        int versionNo,
        Long allocationId,
        Long assetId,
        UUID assetPublicId,
        Long beneficiaryId,
        UUID beneficiaryPublicId,
        String beneficiaryIdentityVerificationStatus,
        String status,
        String description,
        String assetName,
        String beneficiaryName,
        Long recipientLinkedUserId,
        String recipientSource
) {
    /**
     * Fixture value meaning "a linked account exists" when a test does not care which one.
     *
     * Giá trị mặc định cho test.
     */
    public static final long FIXTURE_LINKED_USER_ID = 1L;

    public ReceiptAllocationRow(int versionNo, Long allocationId, Long assetId, UUID assetPublicId,
            Long beneficiaryId, UUID beneficiaryPublicId, String beneficiaryIdentityVerificationStatus,
            String status, String description, String assetName, String beneficiaryName) {
        this(versionNo, allocationId, assetId, assetPublicId, beneficiaryId, beneficiaryPublicId,
                beneficiaryIdentityVerificationStatus, status, description, assetName, beneficiaryName,
                FIXTURE_LINKED_USER_ID, "OWNER_DESIGNATED");
    }

    /** Fixture shortcut: Owner designated recipient with a linked account. */
    public ReceiptAllocationRow(int versionNo, Long allocationId, Long assetId, UUID assetPublicId,
            Long beneficiaryId, UUID beneficiaryPublicId, String beneficiaryIdentityVerificationStatus,
            String status, String description) {
        this(versionNo, allocationId, assetId, assetPublicId, beneficiaryId, beneficiaryPublicId,
                beneficiaryIdentityVerificationStatus, status, description, null, null);
    }

    /**
     * True khi người nhận đã liên kết tài khoản chính thức.
     */
    public boolean accountLinked() {
        return recipientLinkedUserId != null;
    }
}
