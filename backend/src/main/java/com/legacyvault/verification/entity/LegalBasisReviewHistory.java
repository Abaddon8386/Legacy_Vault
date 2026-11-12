
package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Lịch sử rà soát hồ sơ căn cứ của Legal.
 * <p>
 * Bảng {@code dbo.legal_basis_review_history}: mỗi dòng ghi một lần đổi trạng thái rà soát ({@link LegalBasisReviewStatus}) của một
 * {@link LegalBasisDossier}, kèm phiên bản, hash, tranh chấp, hash phân bổ, mã lý do, lý do và người rà soát. Do {@code LegalBasisReviewService}
 * và {@code LegalApprovalService} ghi; {@code BasisDossierViewService} và {@code LegalApprovalGuard} đọc.
 */
@Entity
@Table(name = "legal_basis_review_history", schema = "dbo")
public class LegalBasisReviewHistory {

    /**
     * Khóa chính nội bộ {@code legal_basis_review_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "legal_basis_review_id")
    private Long id;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;

    /**
     * Id hồ sơ căn cứ được rà soát.
     */
    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long dossierId;

    /**
     * Id phiên bản hồ sơ liên quan (có thể null).
     */
    @Column(name = "dossier_version_id")
    private Long dossierVersionId;

    /**
     * Số phiên bản liên quan.
     */
    @Column(name = "version_no")
    private Integer versionNo;

    /**
     * SHA-256 của phiên bản liên quan.
     */
    @Column(name = "sha256_hash", length = 64)
    private String sha256Hash;

    /**
     * Tình trạng tranh chấp tại thời điểm rà soát.
     */
    @Column(name = "dispute_status", length = 20)
    private String disputeStatus;

    /**
     * Hash phân bổ tại thời điểm rà soát.
     */
    @Column(name = "allocation_hash", length = 64)
    private String allocationHash;

    /**
     * Trạng thái rà soát sau lần ghi này (tên của {@link LegalBasisReviewStatus}).
     */
    @Column(name = "review_status", nullable = false, length = 30)
    private String reviewStatus;

    /**
     * Mã lý do (tối đa 50 ký tự).
     */
    @Column(name = "reason_code", nullable = false, length = 50)
    private String reasonCode;

    /**
     * Lý do chi tiết (tối đa 1000 ký tự).
     */
    @Column(name = "reason", nullable = false, length = 1000)
    private String reason;

    /**
     * Id Legal rà soát (null nếu do hệ thống tự đánh dấu).
     */
    @Column(name = "reviewed_by_user_id")
    private Long reviewedByUserId;

    /**
     * Thời điểm ghi (UTC).
     */
    @Column(name = "reviewed_at", nullable = false, updatable = false)
    private LocalDateTime reviewedAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected LegalBasisReviewHistory() {
    }

    /**
     * Tạo bản ghi lịch sử rà soát.
     * @param dossierId       id hồ sơ căn cứ
     * @param dossierVersionId id phiên bản hồ sơ
     * @param versionNo       số phiên bản
     * @param sha256Hash      SHA-256 phiên bản
     * @param disputeStatus   tình trạng tranh chấp
     * @param allocationHash  hash phân bổ
     * @param reviewStatus    trạng thái rà soát
     * @param reasonCode      mã lý do
     * @param reason          lý do chi tiết
     * @param reviewerUserId  id Legal rà soát
     */
    public LegalBasisReviewHistory(
            Long dossierId,
            Long dossierVersionId,
            Integer versionNo,
            String sha256Hash,
            String disputeStatus,
            String allocationHash,
            String reviewStatus,
            String reasonCode,
            String reason,
            Long reviewerUserId
    ) {
        this.dossierId = dossierId;
        this.dossierVersionId = dossierVersionId;
        this.versionNo = versionNo;
        this.sha256Hash = sha256Hash;
        this.disputeStatus = disputeStatus;
        this.allocationHash = allocationHash;
        this.reviewStatus = reviewStatus;
        this.reasonCode = reasonCode;
        this.reason = reason;
        this.reviewedByUserId = reviewerUserId;
    }

    /**
     * Trước khi lưu: sinh {@code publicId} và đặt {@code reviewedAt} (UTC) nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        if (publicId == null) {
            publicId = UUID.randomUUID();
        }
        if (reviewedAt == null) {
            reviewedAt = LocalDateTime.now(ZoneOffset.UTC);
        }
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getDossierId() { return dossierId; }
    public Long getDossierVersionId() { return dossierVersionId; }
    public Integer getVersionNo() { return versionNo; }
    public String getSha256Hash() { return sha256Hash; }
    public String getDisputeStatus() { return disputeStatus; }
    public String getAllocationHash() { return allocationHash; }
    public String getReviewStatus() { return reviewStatus; }
    public String getReasonCode() { return reasonCode; }
    public String getReason() { return reason; }
    public Long getReviewedByUserId() { return reviewedByUserId; }
    public LocalDateTime getReviewedAt() { return reviewedAt; }
}
