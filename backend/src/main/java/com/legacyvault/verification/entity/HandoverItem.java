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
 * <p>
 * Bảng {@code dbo.handover_items}: mỗi dòng là một lần giao một dòng phân bổ (tài sản cho người nhận) trong một phiên bàn giao.
 * Do {@code HandoverDeliveryService} tạo. Trạng thái: {@code DELIVERED} (mặc định) hoặc {@code VERIFIED_BY_BENEFICIARY} (sau đối soát).
 */
@Entity
@Table(name = "handover_items", schema = "dbo")
public class HandoverItem {

    /**
     * Trạng thái mặc định: đã giao tại quầy.
     */
    public static final String STATUS_DELIVERED = "DELIVERED";

    /**
     * Khóa chính nội bộ {@code handover_item_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_item_id")
    private Long id;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id phiên bàn giao ({@code handover_sessions}).
     */
    @Column(name = "handover_session_id", nullable = false, updatable = false)
    private Long handoverSessionId;

    /**
     * Id dòng phân bổ đã duyệt ({@code legal_basis_version_allocations}).
     */
    @Column(name = "allocation_id", nullable = false, updatable = false)
    private Long allocationId;

    /**
     * Id tài sản được giao.
     */
    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    /**
     * Id người nhận.
     */
    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    /**
     * Id Staff thực hiện việc giao.
     */
    @Column(name = "delivered_by_staff_user_id", nullable = false, updatable = false)
    private Long deliveredByStaffUserId;

    /**
     * Thời điểm giao (UTC).
     */
    @Column(name = "delivered_at", nullable = false, updatable = false)
    private LocalDateTime deliveredAt;

    /**
     * Trạng thái: {@link #STATUS_DELIVERED} hoặc {@code VERIFIED_BY_BENEFICIARY}; cột duy nhất có thể đổi sau khi tạo.
     */
    @Column(name = "status", nullable = false, length = 30)
    private String status = STATUS_DELIVERED;

    /**
     * Constructor không tham số cho JPA.
     */
    protected HandoverItem() {}

    /**
     * Tạo dòng giao với trạng thái DELIVERED.
     * @param handoverSessionId     id phiên bàn giao
     * @param allocationId          id dòng phân bổ
     * @param assetId               id tài sản
     * @param beneficiaryId         id người nhận
     * @param deliveredByStaffUserId id Staff giao
     */
    public HandoverItem(Long handoverSessionId, Long allocationId, Long assetId, Long beneficiaryId,
            Long deliveredByStaffUserId) {
        this.handoverSessionId = handoverSessionId;
        this.allocationId = allocationId;
        this.assetId = assetId;
        this.beneficiaryId = beneficiaryId;
        this.deliveredByStaffUserId = deliveredByStaffUserId;
    }

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt {@code deliveredAt} (UTC) và {@code status} mặc định nếu chưa có.
     */
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
