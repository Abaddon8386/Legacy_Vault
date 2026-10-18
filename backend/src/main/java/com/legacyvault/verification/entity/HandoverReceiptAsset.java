package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Immutable link from a receipt to the authoritative allocation row and asset. */
@Entity
@Table(name = "handover_receipt_assets", schema = "dbo")
public class HandoverReceiptAsset {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_receipt_asset_id")
    private Long id;

    @Column(name = "handover_receipt_id", nullable = false, updatable = false)
    private Long handoverReceiptId;

    @Column(name = "allocation_id", nullable = false, updatable = false)
    private Long allocationId;

    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    protected HandoverReceiptAsset() {}

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
