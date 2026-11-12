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
 * <p>
 * Bảng {@code dbo.will_comparisons}. Kết quả: MATCH, MISMATCH, INCONCLUSIVE. Do {@code WillComparisonService} tạo, tham chiếu
 * {@link OriginalWillIntake} và phiên bản tài sản/di chúc scan ({@code asset_version_id}).
 */
@Entity
@Table(name = "will_comparisons", schema = "dbo")
public class WillComparison {

    /**
     * Bản gốc khớp với bản scan.
     */
    public static final String RESULT_MATCH = "MATCH";
    /**
     * Bản gốc không khớp bản scan.
     */
    public static final String RESULT_MISMATCH = "MISMATCH";
    /**
     * Không thể kết luận.
     */
    public static final String RESULT_INCONCLUSIVE = "INCONCLUSIVE";

    /**
     * Khóa chính nội bộ {@code will_comparison_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "will_comparison_id")
    private Long willComparisonId;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id ca xác minh.
     */
    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    /**
     * Id bản ghi nhận di chúc gốc được đối chiếu.
     */
    @Column(name = "original_will_intake_id", nullable = false, updatable = false)
    private Long originalWillIntakeId;

    /**
     * Id phiên bản di chúc scan được so.
     */
    @Column(name = "asset_version_id", nullable = false, updatable = false)
    private Long assetVersionId;

    /**
     * SHA-256 của phiên bản scan tại thời điểm đối chiếu.
     */
    @Column(name = "referenced_sha256_hash", nullable = false, length = 64, updatable = false)
    private String referencedSha256Hash;

    /**
     * Kết quả: MATCH, MISMATCH hoặc INCONCLUSIVE.
     */
    @Column(name = "comparison_result", nullable = false, length = 20, updatable = false)
    private String comparisonResult;

    /**
     * Id Legal Verifier đối chiếu.
     */
    @Column(name = "checked_by_user_id", nullable = false, updatable = false)
    private Long checkedByUserId;

    /**
     * Lý do/nhận xét (tùy chọn, tối đa 1000 ký tự).
     */
    @Column(name = "reason", length = 1000, updatable = false)
    private String reason;

    /**
     * Thời điểm đối chiếu (UTC).
     */
    @Column(name = "compared_at", nullable = false, updatable = false)
    private LocalDateTime comparedAt;

    /**
     * Thời điểm tạo bản ghi (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected WillComparison() {
    }

    /**
     * Tạo bản ghi đối chiếu di chúc.
     * @param verificationCaseId     id ca xác minh
     * @param originalWillIntakeId   id bản ghi nhận di chúc gốc
     * @param assetVersionId         id phiên bản di chúc scan
     * @param referencedSha256Hash   SHA-256 phiên bản scan
     * @param comparisonResult       MATCH, MISMATCH hoặc INCONCLUSIVE
     * @param checkedByUserId        id Legal đối chiếu
     * @param reason                 lý do
     */
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

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt {@code comparedAt} và {@code createdAt} (UTC) nếu chưa có.
     */
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
