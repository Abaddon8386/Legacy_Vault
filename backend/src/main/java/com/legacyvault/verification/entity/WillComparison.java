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
 * Kết quả Legal đối chiếu bản di chúc giấy gốc với một phiên bản bản scan đã lưu (ST-15, LV-WILL-001).
 * {@code referencedSha256Hash} là SHA-256 của phiên bản bản scan tại thời điểm đối chiếu, để biết chính xác phiên bản
 * nào đã được so. Hash chỉ phát hiện thay đổi, không chứng minh giá trị pháp lý. Bản ghi không bị sửa hay xóa; đối chiếu
 * lại thì tạo bản ghi mới.
 */
@Entity
@Table(name = "will_comparisons", schema = "dbo")
public class WillComparison {

    public static final String RESULT_MATCH = "MATCH";
    public static final String RESULT_MISMATCH = "MISMATCH";
    public static final String RESULT_INCONCLUSIVE = "INCONCLUSIVE";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "will_comparison_id")
    private Long willComparisonId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "original_will_intake_id", nullable = false, updatable = false)
    private Long originalWillIntakeId;

    @Column(name = "asset_version_id", nullable = false, updatable = false)
    private Long assetVersionId;

    @Column(name = "referenced_sha256_hash", nullable = false, length = 64, updatable = false)
    private String referencedSha256Hash;

    @Column(name = "comparison_result", nullable = false, length = 20, updatable = false)
    private String comparisonResult;

    @Column(name = "checked_by_user_id", nullable = false, updatable = false)
    private Long checkedByUserId;

    @Column(name = "reason", length = 1000, updatable = false)
    private String reason;

    @Column(name = "compared_at", nullable = false, updatable = false)
    private LocalDateTime comparedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected WillComparison() {
    }

    public WillComparison(
            Long verificationCaseId,
            Long originalWillIntakeId,
            Long assetVersionId,
            String referencedSha256Hash,
            String comparisonResult,
            Long checkedByUserId,
            String reason
    ) {
        this.verificationCaseId = verificationCaseId;
        this.originalWillIntakeId = originalWillIntakeId;
        this.assetVersionId = assetVersionId;
        this.referencedSha256Hash = referencedSha256Hash;
        this.comparisonResult = comparisonResult;
        this.checkedByUserId = checkedByUserId;
        this.reason = reason;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (comparedAt == null) comparedAt = now;
        if (createdAt == null) createdAt = now;
    }

    public Long getWillComparisonId() {
        return willComparisonId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public Long getOriginalWillIntakeId() {
        return originalWillIntakeId;
    }

    public Long getAssetVersionId() {
        return assetVersionId;
    }

    public String getReferencedSha256Hash() {
        return referencedSha256Hash;
    }

    public String getComparisonResult() {
        return comparisonResult;
    }

    public Long getCheckedByUserId() {
        return checkedByUserId;
    }

    public String getReason() {
        return reason;
    }

    public LocalDateTime getComparedAt() {
        return comparedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
