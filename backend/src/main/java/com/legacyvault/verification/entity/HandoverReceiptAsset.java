package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * Immutable link from a receipt to the authoritative allocation row and asset.
 * <p>
 * Bảng {@code dbo.handover_receipt_assets}: liên kết bất biến giữa một biên nhận ({@link HandoverReceipt}) với dòng phân bổ và tài sản
 * được bao trong biên nhận đó. Do {@code HandoverReceiptService} tạo cùng biên nhận, {@code HandoverArchiveService} đọc.
 */
@Entity
@Table(name = "handover_receipt_assets", schema = "dbo")
public class HandoverReceiptAsset {
    /**
     * Khóa chính nội bộ {@code handover_receipt_asset_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_receipt_asset_id")
    private Long id;

    /**
     * Id biên nhận ({@code handover_receipts}).
     */
    @Column(name = "handover_receipt_id", nullable = false, updatable = false)
    private Long handoverReceiptId;

    /**
     * Id dòng phân bổ ({@code legal_basis_version_allocations}).
     */
    @Column(name = "allocation_id", nullable = false, updatable = false)
    private Long allocationId;

    /**
     * Id tài sản được bàn giao.
     */
    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    /**
     * Constructor không tham số cho JPA.
     */
    protected HandoverReceiptAsset() {}

    /**
     * Tạo liên kết biên nhận - tài sản.
     * @param handoverReceiptId id biên nhận
     * @param allocationId      id dòng phân bổ
     * @param assetId           id tài sản
     */
    public HandoverReceiptAsset(Long handoverReceiptId, Long allocationId, Long assetId) {
        this.handoverReceiptId = handoverReceiptId;
        this.allocationId = allocationId;
        this.assetId = assetId;
    }

    public Long getId() { return id; }
    public Long getHandoverReceiptId() { return handoverReceiptId; }
    public Long getAllocationId() { return allocationId; }
    public Long getAssetId() { return assetId; }
}
