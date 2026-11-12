package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Immutable server-recorded Staff attestation of a completed handover.
 * <p>
 * Bảng {@code dbo.handover_receipts}: biên nhận bàn giao do server ghi nhận khi Staff xác nhận (loại {@link #STAFF_ATTESTATION}) cho một người
 * nhận trong một phiên. Gắn với phiên bản hồ sơ căn cứ và hash phân bổ tại thời điểm xác nhận; biên nhận mới có thể thay thế biên nhận cũ
 * qua {@code supersedes_receipt_id}. Các tài sản của biên nhận nằm ở {@link HandoverReceiptAsset}. Do {@code HandoverReceiptService}
 * tạo, {@code HandoverArchiveService} đọc.
 */
@Entity
@Table(name = "handover_receipts", schema = "dbo")
public class HandoverReceipt {
    /**
     * Loại xác nhận: Staff chứng thực việc bàn giao.
     */
    public static final String STAFF_ATTESTATION = "STAFF_ATTESTATION";

    /**
     * Khóa chính nội bộ {@code handover_receipt_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_receipt_id")
    private Long id;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id phiên bàn giao.
     */
    @Column(name = "handover_session_id", nullable = false, updatable = false)
    private Long handoverSessionId;

    /**
     * Id người nhận mà biên nhận thuộc về.
     */
    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    /**
     * Id Staff xác nhận.
     */
    @Column(name = "staff_user_id", nullable = false, updatable = false)
    private Long staffUserId;

    /**
     * Id phiên bản hồ sơ căn cứ làm cơ sở.
     */
    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;

    /**
     * Số thứ tự phiên bản hồ sơ căn cứ.
     */
    @Column(name = "dossier_version_no", nullable = false, updatable = false)
    private int dossierVersionNo;

    /**
     * SHA-256 của phiên bản hồ sơ căn cứ.
     */
    @Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
    private String sha256Hash;

    /**
     * Hash phạm vi phân bổ của người nhận tại thời điểm xác nhận.
     */
    @Column(name = "allocation_hash", nullable = false, length = 64, updatable = false)
    private String allocationHash;

    /**
     * Loại xác nhận, hiện luôn là {@link #STAFF_ATTESTATION}.
     */
    @Column(name = "confirmation_type", nullable = false, length = 30, updatable = false)
    private String confirmationType;

    /**
     * Thời điểm xác nhận (UTC).
     */
    @Column(name = "confirmed_at", nullable = false, updatable = false)
    private LocalDateTime confirmedAt;

    /**
     * Id biên nhận trước đó mà biên nhận này thay thế (null nếu là biên nhận đầu tiên).
     */
    @Column(name = "supersedes_receipt_id", updatable = false)
    private Long supersedesReceiptId;

    /**
     * Constructor không tham số cho JPA.
     */
    protected HandoverReceipt() {}

    /**
     * Tạo biên nhận mới với loại {@link #STAFF_ATTESTATION}.
     * @param handoverSessionId   id phiên bàn giao
     * @param beneficiaryId       id người nhận
     * @param staffUserId         id Staff xác nhận
     * @param dossierVersionId    id phiên bản hồ sơ căn cứ
     * @param dossierVersionNo    số phiên bản
     * @param sha256Hash          SHA-256 phiên bản
     * @param allocationHash      hash phân bổ
     * @param supersedesReceiptId id biên nhận bị thay thế (có thể null)
     * @param confirmedAt         thời điểm xác nhận (UTC)
     */
    public HandoverReceipt(Long handoverSessionId, Long beneficiaryId, Long staffUserId,
            Long dossierVersionId, int dossierVersionNo, String sha256Hash, String allocationHash,
            Long supersedesReceiptId, LocalDateTime confirmedAt) {
        this.publicId = UUID.randomUUID();
        this.handoverSessionId = handoverSessionId;
        this.beneficiaryId = beneficiaryId;
        this.staffUserId = staffUserId;
        this.dossierVersionId = dossierVersionId;
        this.dossierVersionNo = dossierVersionNo;
        this.sha256Hash = sha256Hash;
        this.allocationHash = allocationHash;
        this.confirmationType = STAFF_ATTESTATION;
        this.supersedesReceiptId = supersedesReceiptId;
        this.confirmedAt = confirmedAt;
    }

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt loại xác nhận mặc định và {@code confirmedAt} (UTC) nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (confirmationType == null) confirmationType = STAFF_ATTESTATION;
        if (confirmedAt == null) confirmedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getHandoverSessionId() { return handoverSessionId; }
    public Long getBeneficiaryId() { return beneficiaryId; }
    public Long getStaffUserId() { return staffUserId; }
    public Long getDossierVersionId() { return dossierVersionId; }
    public int getDossierVersionNo() { return dossierVersionNo; }
    public String getSha256Hash() { return sha256Hash; }
    public String getAllocationHash() { return allocationHash; }
    public String getConfirmationType() { return confirmationType; }
    public LocalDateTime getConfirmedAt() { return confirmedAt; }
    public Long getSupersedesReceiptId() { return supersedesReceiptId; }
}
