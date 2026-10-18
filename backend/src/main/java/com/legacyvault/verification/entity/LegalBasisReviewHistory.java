
package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "legal_basis_review_history", schema = "dbo")
public class LegalBasisReviewHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "legal_basis_review_id")
    private Long id;

    @Column(name = "public_id", nullable = false, updatable = false)
    private UUID publicId;

    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long dossierId;

    @Column(name = "dossier_version_id")
    private Long dossierVersionId;

    @Column(name = "version_no")
    private Integer versionNo;

    @Column(name = "sha256_hash", length = 64)
    private String sha256Hash;

    @Column(name = "dispute_status", length = 20)
    private String disputeStatus;

    @Column(name = "allocation_hash", length = 64)
    private String allocationHash;

    @Column(name = "review_status", nullable = false, length = 30)
    private String reviewStatus;

    @Column(name = "reason_code", nullable = false, length = 50)
    private String reasonCode;

    @Column(name = "reason", nullable = false, length = 1000)
    private String reason;

    @Column(name = "reviewed_by_user_id")
    private Long reviewedByUserId;

    @Column(name = "reviewed_at", nullable = false, updatable = false)
    private LocalDateTime reviewedAt;

    protected LegalBasisReviewHistory() {
    }

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
