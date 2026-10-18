package com.legacyvault.verification.entity;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/**
 * PS-65 (ST-25, LV-HANDOVER-001): one approved allocation line (asset -> recipient) handed over at the counter.
 * Append-only evidence: the delivery identity never changes; only the later reconciliation step (ST-26) may move
 * {@code status} from DELIVERED to VERIFIED_BY_BENEFICIARY.
 */
@Entity
@Table(name = "handover_items", schema = "dbo")
public class HandoverItem {

    public static final String STATUS_DELIVERED = "DELIVERED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_item_id")
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "handover_session_id", nullable = false, updatable = false)
    private Long handoverSessionId;

    @Column(name = "allocation_id", nullable = false, updatable = false)
    private Long allocationId;

    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    @Column(name = "delivered_by_staff_user_id", nullable = false, updatable = false)
    private Long deliveredByStaffUserId;

    @Column(name = "delivered_at", nullable = false, updatable = false)
    private LocalDateTime deliveredAt;

    @Column(name = "status", nullable = false, length = 30)
    private String status = STATUS_DELIVERED;

    protected HandoverItem() {}

    public HandoverItem(Long handoverSessionId, Long allocationId, Long assetId, Long beneficiaryId,
            Long deliveredByStaffUserId) {
        this.handoverSessionId = handoverSessionId;
        this.allocationId = allocationId;
        this.assetId = assetId;
        this.beneficiaryId = beneficiaryId;
        this.deliveredByStaffUserId = deliveredByStaffUserId;
    }

    @PrePersist
    protected void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (deliveredAt == null) deliveredAt = LocalDateTime.now(ZoneOffset.UTC);
        if (status == null) status = STATUS_DELIVERED;
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getHandoverSessionId() { return handoverSessionId; }
    public Long getAllocationId() { return allocationId; }
    public Long getAssetId() { return assetId; }
    public Long getBeneficiaryId() { return beneficiaryId; }
    public Long getDeliveredByStaffUserId() { return deliveredByStaffUserId; }
    public LocalDateTime getDeliveredAt() { return deliveredAt; }
    public String getStatus() { return status; }
}
