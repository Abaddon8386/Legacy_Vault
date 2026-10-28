
package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Hồ sơ căn cứ phân chia di sản của một ca xác minh (ST-16..20, LV-BASIS-001).
 * Legal tạo khi phân loại nhánh; Staff bổ sung phiên bản văn bản.
 * Mỗi ca tối đa một hồ sơ theo ràng buộc unique tại DB.
 *
 * Package: com.legacyvault.verification.entity
 */
@Entity
@Table(name = "legal_basis_dossiers", schema = "dbo")
public class LegalBasisDossier {

    public static final String ROUTE_NOTARIAL = "NOTARIAL";
    public static final String ROUTE_COURT = "COURT";
    public static final String ROUTE_ON_HOLD = "ON_HOLD";

    public static final String STATUS_DRAFT = "DRAFT";
    public static final String STATUS_PROVIDED = "LEGAL_BASIS_PROVIDED";
    public static final String STATUS_FORWARDED = "LEGAL_BASIS_FORWARDED";

    public static final String DISPUTE_NONE = "NONE";
    public static final String DISPUTE_DISPUTED = "DISPUTED";
    public static final String DISPUTE_UNDETERMINED = "UNDETERMINED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "legal_basis_dossier_id")
    private Long legalBasisDossierId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "route", nullable = false, length = 20)
    private String route;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "route_reason", length = 1000)
    private String routeReason;

    @Column(name = "dispute_status", nullable = false, length = 20)
    private String disputeStatus;

    @Column(name = "required_version_no", nullable = false)
    private int requiredVersionNo = 1;

    @Column(name = "review_status", nullable = false, length = 30)
    private String reviewStatus = LegalBasisReviewStatus.REVIEW_REQUIRED.name();

    @Column(name = "review_required_reason", length = 1000)
    private String reviewRequiredReason;

    @Column(name = "last_reviewed_version_no")
    private Integer lastReviewedVersionNo;

    @Column(name = "last_reviewed_sha256_hash", length = 64)
    private String lastReviewedSha256Hash;

    @Column(name = "last_reviewed_dispute_status", length = 20)
    private String lastReviewedDisputeStatus;

    @Column(name = "last_reviewed_allocation_hash", length = 64)
    private String lastReviewedAllocationHash;

    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private Long createdByUserId;

    @Column(name = "classified_by_user_id")
    private Long classifiedByUserId;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected LegalBasisDossier() {
    }

    public LegalBasisDossier(
            Long verificationCaseId,
            String route,
            String routeReason,
            String disputeStatus,
            Long createdByUserId) {
        this.verificationCaseId = verificationCaseId;
        this.route = route;
        this.routeReason = routeReason;
        this.disputeStatus = disputeStatus;
        this.createdByUserId = createdByUserId;
        this.classifiedByUserId = createdByUserId;
        this.status = STATUS_DRAFT;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_DRAFT;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /** ST-18: đã tiếp nhận phiên bản văn bản; không đồng nghĩa đã duyệt. */
    public void markProvided() {
        this.status = STATUS_PROVIDED;
    }

    /** ST-19: đã chuyển phiên bản mới nhất cho Legal. */
    public void markForwarded() {
        this.status = STATUS_FORWARDED;
    }

    /**
     * PS-37 / ST-20: Legal yêu cầu Staff bổ sung hồ sơ.
     * Chỉ hồ sơ đã forward mới được trả về trạng thái PROVIDED.
     */
    public void markSupplementationRequired() {
        if (!STATUS_FORWARDED.equals(this.status)) {
            throw new IllegalStateException(
                    "Only a forwarded dossier can be returned for supplementation");
        }

        this.status = STATUS_PROVIDED;
    }

    /**
     * LV-HOLD-001: Legal phân loại lại hồ sơ đang ON_HOLD sang NOTARIAL/COURT. Chỉ ON_HOLD mới được đổi nhánh; NOTARIAL và
     * COURT không đổi trực tiếp lẫn nhau (D-LEGAL-002). Người phân loại hiện hành được cập nhật.
     */
    public void reclassify(
            String newRoute,
            String newReason,
            String newDisputeStatus,
            Long legalUserId) {

        if (!ROUTE_ON_HOLD.equals(route)
                || !STATUS_DRAFT.equals(status)
                || !(ROUTE_COURT.equals(newRoute) || ROUTE_NOTARIAL.equals(newRoute))) {
            throw new IllegalStateException(
                    "Only an ON_HOLD draft dossier can be reclassified to NOTARIAL or COURT");
        }

        this.route = newRoute;
        this.routeReason = newReason;
        this.disputeStatus = newDisputeStatus;
        this.classifiedByUserId = legalUserId;
    }

    /** NOTARIAL and COURT dossiers take Staff intake and forward; ON_HOLD does not. */
    public boolean acceptsIntake() {
        return ROUTE_COURT.equals(route) || ROUTE_NOTARIAL.equals(route);
    }

    /** Routes Legal may review, approve and unlock. */
    public boolean isLegalReviewable() {
        return acceptsIntake();
    }

    /**
     * Dossier opened by Staff intake when Legal has not classified yet: the route follows the document actually
     * submitted. Nobody is recorded as the classifier; Legal still reviews validity and may place it on hold.
     */
    public static LegalBasisDossier openedByIntake(Long verificationCaseId, String route, String disputeStatus,
            Long staffUserId) {
        LegalBasisDossier dossier = new LegalBasisDossier(verificationCaseId, route,
                "Opened by Staff intake from the submitted document type", disputeStatus, staffUserId);
        dossier.classifiedByUserId = null;
        return dossier;
    }

    /** A hold invalidates earlier clearance while preserving all versions and assessment history. */
    public void placeOnHold(String reason, String dispute, Long legalUserId, int requiredVersion) {
        if (!acceptsIntake() || requiredVersion < 1) throw new IllegalStateException("Invalid hold transition");
        route = ROUTE_ON_HOLD;
        status = STATUS_DRAFT;
        routeReason = reason;
        disputeStatus = dispute;
        classifiedByUserId = legalUserId;
        requiredVersionNo = Math.max(requiredVersionNo, requiredVersion);
    }

    public int getRequiredVersionNo() { return requiredVersionNo; }

    public Long getLegalBasisDossierId() {
        return legalBasisDossierId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public String getRoute() {
        return route;
    }

    public String getStatus() {
        return status;
    }

    public String getRouteReason() {
        return routeReason;
    }

    public String getDisputeStatus() {
        return disputeStatus;
    }

    /** Legal đã phân loại nhánh hiện hành. */
    public Long getClassifiedByUserId() {
        return classifiedByUserId != null ? classifiedByUserId : createdByUserId;
    }

    public Long getCreatedByUserId() {
        return createdByUserId;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }

    public String getReviewStatus() {
        return reviewStatus;
    }

    public String getReviewRequiredReason() {
        return reviewRequiredReason;
    }

    public Integer getLastReviewedVersionNo() {
        return lastReviewedVersionNo;
    }

    public String getLastReviewedSha256Hash() {
        return lastReviewedSha256Hash;
    }

    public String getLastReviewedDisputeStatus() {
        return lastReviewedDisputeStatus;
    }

    public String getLastReviewedAllocationHash() {
        return lastReviewedAllocationHash;
    }

    public void requireReview(String reasonCode) {
        this.reviewStatus = LegalBasisReviewStatus.REVIEW_REQUIRED.name();
        this.reviewRequiredReason = reasonCode;
    }

    public void recordReviewSnapshot(
            int versionNo,
            String sha256Hash,
            String currentDisputeStatus,
            String allocationHash,
            Long reviewerUserId) {

        if (versionNo < 1
                || sha256Hash == null
                || sha256Hash.isBlank()
                || currentDisputeStatus == null
                || currentDisputeStatus.isBlank()
                || allocationHash == null
                || allocationHash.isBlank()
                || reviewerUserId == null) {
            throw new IllegalArgumentException(
                    "Complete review snapshot is required");
        }

        this.lastReviewedVersionNo = versionNo;
        this.lastReviewedSha256Hash = sha256Hash;
        this.lastReviewedDisputeStatus = currentDisputeStatus;
        this.lastReviewedAllocationHash = allocationHash;
        this.reviewStatus = LegalBasisReviewStatus.FRESH.name();
        this.reviewRequiredReason = null;
    }
}
