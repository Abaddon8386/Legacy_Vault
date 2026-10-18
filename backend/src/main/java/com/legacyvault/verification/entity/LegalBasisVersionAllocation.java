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
 */
@Entity
@Table(name = "legal_basis_version_allocations", schema = "dbo")
public class LegalBasisVersionAllocation {

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_REJECTED = "REJECTED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "allocation_id")
    private Long allocationId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;

    @Column(name = "asset_id", nullable = false, updatable = false)
    private Long assetId;

    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    @Column(name = "allocation_description", updatable = false)
    private String allocationDescription;

    @Column(name = "status", nullable = false, length = 20)
    private String status = STATUS_DRAFT;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected LegalBasisVersionAllocation() {
    }

    public LegalBasisVersionAllocation(Long dossierVersionId, Long assetId, Long beneficiaryId, String description) {
        this.dossierVersionId = dossierVersionId;
        this.assetId = assetId;
        this.beneficiaryId = beneficiaryId;
        this.allocationDescription = description;
    }

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
