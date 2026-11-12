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
 * Một dòng phân bổ tài sản cho người nhận theo văn bản căn cứ của một phiên bản (ST-18/20): phạm vi mà Legal sẽ đối soát.
 * Là bản kê theo văn bản do Staff ghi nhận (DRAFT), chưa phải phê duyệt: chỉ cấp quyền khi Legal ký duyệt (ST-21).
 * Gắn với đúng một phiên bản và bất biến; phiên bản mới có bộ phân bổ riêng.
 * <p>
 * Bảng {@code dbo.legal_basis_version_allocations}. Trạng thái: DRAFT, APPROVED, REJECTED, SUPERSEDED. Do {@code BasisIntakeService}
 * tạo, {@code LegalApprovalService} đổi trạng thái khi duyệt, {@code HandoverScopeResolver}/{@code HandoverReceiptService} dùng làm phạm vi bàn giao.
 */
@Entity
@Table(name = "legal_basis_version_allocations", schema = "dbo")
public class LegalBasisVersionAllocation {

    /**
     * Nháp theo văn bản Staff ghi nhận.
     */
    public static final String STATUS_DRAFT = "DRAFT";
    /**
     * Đã được Legal duyệt.
     */
    public static final String STATUS_APPROVED = "APPROVED";
    /**
     * Bị Legal từ chối.
     */
    public static final String STATUS_REJECTED = "REJECTED";
    /**
     * Bị thay thế bởi phiên bản phân bổ mới.
     */
    public static final String STATUS_SUPERSEDED = "SUPERSEDED";

    /**
     * Khóa chính nội bộ {@code allocation_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "allocation_id")
    private Long allocationId;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id phiên bản hồ sơ căn cứ sở hữu dòng phân bổ.
     */
    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;

    /**
     * Id tài sản được phân bổ.
     */
    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    /**
     * Id người nhận.
     */
    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    /**
     * Mô tả phân bổ theo văn bản (tùy chọn).
     */
    @Column(name = "allocation_description", updatable = false)
    private String allocationDescription;

    /**
     * Trạng thái: DRAFT (mặc định), APPROVED, REJECTED hoặc SUPERSEDED.
     */
    @Column(name = "status", nullable = false, length = 20)
    private String status = STATUS_DRAFT;

    /**
     * Thời điểm tạo (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected LegalBasisVersionAllocation() {
    }

    /**
     * Tạo dòng phân bổ ở trạng thái DRAFT.
     * @param dossierVersionId id phiên bản hồ sơ
     * @param assetId          id tài sản
     * @param beneficiaryId    id người nhận
     * @param description      mô tả phân bổ
     */
    public LegalBasisVersionAllocation(Long dossierVersionId, Long assetId, Long beneficiaryId, String description) {
        this.dossierVersionId = dossierVersionId;
        this.assetId = assetId;
        this.beneficiaryId = beneficiaryId;
        this.allocationDescription = description;
    }

    /**
     * Trước khi lưu: sinh {@code publicId} và đặt {@code createdAt} (UTC) nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (createdAt == null) createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getAllocationId() {
        return allocationId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getDossierVersionId() {
        return dossierVersionId;
    }

    public Long getAssetId() {
        return assetId;
    }

    public Long getBeneficiaryId() {
        return beneficiaryId;
    }

    public String getAllocationDescription() {
        return allocationDescription;
    }

    public String getStatus() {
        return status;
    }
}
