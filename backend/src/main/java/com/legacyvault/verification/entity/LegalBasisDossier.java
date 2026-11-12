
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
 * <p>
 * Bảng {@code dbo.legal_basis_dossiers}. Nhánh ({@code route}): NOTARIAL (công chứng), COURT (tòa án) hoặc ON_HOLD (tạm giữ).
 * Trạng thái ({@code status}): DRAFT, LEGAL_BASIS_PROVIDED, LEGAL_BASIS_FORWARDED. Tranh chấp ({@code dispute_status}): NONE, DISPUTED, UNDETERMINED.
 * Trạng thái rà soát ({@code review_status}): xem {@link LegalBasisReviewStatus}. Các phiên bản văn bản nằm ở {@link LegalBasisDossierVersion},
 * lịch sử phân loại ở {@link LegalBasisClassificationHistory}, lịch sử rà soát ở {@link LegalBasisReviewHistory}.
 * Dùng bởi các service {@code Basis*Service}, {@code LegalBasisHoldService}, {@code LegalBasisReviewService}, {@code LegalApprovalService}, {@code CourtDecisionService}.
 */
@Entity
@Table(name = "legal_basis_dossiers", schema = "dbo")
public class LegalBasisDossier {

    /**
     * Nhánh công chứng.
     */
    public static final String ROUTE_NOTARIAL = "NOTARIAL";
    /**
     * Nhánh tòa án.
     */
    public static final String ROUTE_COURT = "COURT";
    /**
     * Nhánh tạm giữ (chưa đủ điều kiện, chờ phân loại lại).
     */
    public static final String ROUTE_ON_HOLD = "ON_HOLD";

    /**
     * Trạng thái nháp, Staff chưa cung cấp phiên bản văn bản.
     */
    public static final String STATUS_DRAFT = "DRAFT";
    /**
     * Trạng thái Staff đã tiếp nhận phiên bản văn bản.
     */
    public static final String STATUS_PROVIDED = "LEGAL_BASIS_PROVIDED";
    /**
     * Trạng thái đã chuyển phiên bản mới nhất cho Legal.
     */
    public static final String STATUS_FORWARDED = "LEGAL_BASIS_FORWARDED";

    /**
     * Không có tranh chấp.
     */
    public static final String DISPUTE_NONE = "NONE";
    /**
     * Có tranh chấp.
     */
    public static final String DISPUTE_DISPUTED = "DISPUTED";
    /**
     * Chưa xác định tranh chấp.
     */
    public static final String DISPUTE_UNDETERMINED = "UNDETERMINED";

    /**
     * Khóa chính nội bộ {@code legal_basis_dossier_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "legal_basis_dossier_id")
    private Long legalBasisDossierId;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id ca xác minh (mỗi ca tối đa một hồ sơ).
     */
    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    /**
     * Nhánh hiện hành: NOTARIAL, COURT hoặc ON_HOLD.
     */
    @Column(name = "route", nullable = false, length = 20)
    private String route;

    /**
     * Trạng thái hồ sơ: DRAFT, LEGAL_BASIS_PROVIDED hoặc LEGAL_BASIS_FORWARDED.
     */
    @Column(name = "status", nullable = false, length = 30)
    private String status;

    /**
     * Lý do chọn nhánh (hoặc lý do tạm giữ).
     */
    @Column(name = "route_reason", length = 1000)
    private String routeReason;

    /**
     * Tình trạng tranh chấp: NONE, DISPUTED hoặc UNDETERMINED.
     */
    @Column(name = "dispute_status", nullable = false, length = 20)
    private String disputeStatus;

    /**
     * Số phiên bản văn bản tối thiểu cần có (tăng khi bị tạm giữ yêu cầu phiên bản mới), mặc định 1.
     */
    @Column(name = "required_version_no", nullable = false)
    private int requiredVersionNo = 1;

    /**
     * Trạng thái rà soát của Legal (tên của {@link LegalBasisReviewStatus}), mặc định REVIEW_REQUIRED.
     */
    @Column(name = "review_status", nullable = false, length = 30)
    private String reviewStatus = LegalBasisReviewStatus.REVIEW_REQUIRED.name();

    /**
     * Mã lý do khiến cần rà soát lại.
     */
    @Column(name = "review_required_reason", length = 1000)
    private String reviewRequiredReason;

    /**
     * Số phiên bản đã được rà soát gần nhất.
     */
    @Column(name = "last_reviewed_version_no")
    private Integer lastReviewedVersionNo;

    /**
     * SHA-256 của phiên bản đã rà soát gần nhất.
     */
    @Column(name = "last_reviewed_sha256_hash", length = 64)
    private String lastReviewedSha256Hash;

    /**
     * Tình trạng tranh chấp tại thời điểm rà soát gần nhất.
     */
    @Column(name = "last_reviewed_dispute_status", length = 20)
    private String lastReviewedDisputeStatus;

    /**
     * Hash phân bổ tại thời điểm rà soát gần nhất.
     */
    @Column(name = "last_reviewed_allocation_hash", length = 64)
    private String lastReviewedAllocationHash;

    /**
     * Id người tạo hồ sơ (Legal hoặc Staff nếu mở qua intake).
     */
    @Column(name = "created_by_user_id", nullable = false, updatable = false)
    private Long createdByUserId;

    /**
     * Id Legal phân loại nhánh hiện hành (null nếu hồ sơ mở bởi Staff intake và chưa ai phân loại).
     */
    @Column(name = "classified_by_user_id")
    private Long classifiedByUserId;

    /**
     * Thời điểm tạo (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Thời điểm cập nhật gần nhất (UTC).
     */
    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected LegalBasisDossier() {
    }

    /**
     * Tạo hồ sơ căn cứ ở trạng thái DRAFT; người tạo cũng là người phân loại ban đầu.
     * @param verificationCaseId id ca xác minh
     * @param route              nhánh ban đầu
     * @param routeReason        lý do phân nhánh
     * @param disputeStatus      tình trạng tranh chấp
     * @param createdByUserId    id người tạo
     */
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

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt trạng thái DRAFT mặc định và {@code createdAt}/{@code updatedAt} (UTC).
     */
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_DRAFT;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    /**
     * Trước khi cập nhật: làm mới {@code updatedAt} (UTC).
     */
    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    /**
     * ST-18: đã tiếp nhận phiên bản văn bản; không đồng nghĩa đã duyệt. Đặt trạng thái {@link #STATUS_PROVIDED}.
     */
    public void markProvided() {
        this.status = STATUS_PROVIDED;
    }

    /**
     * ST-19: đã chuyển phiên bản mới nhất cho Legal. Đặt trạng thái {@link #STATUS_FORWARDED}.
     */
    public void markForwarded() {
        this.status = STATUS_FORWARDED;
    }

    /**
     * PS-37 / ST-20: Legal yêu cầu Staff bổ sung hồ sơ.
     * Chỉ hồ sơ đã forward mới được trả về trạng thái PROVIDED.
     * @throws IllegalStateException nếu hồ sơ chưa ở trạng thái FORWARDED
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
     * @param newRoute         nhánh mới (NOTARIAL hoặc COURT)
     * @param newReason        lý do phân loại mới
     * @param newDisputeStatus tình trạng tranh chấp mới
     * @param legalUserId      id Legal thực hiện
     * @throws IllegalStateException nếu hồ sơ không phải ON_HOLD ở trạng thái DRAFT hoặc nhánh mới không hợp lệ
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

    /**
     * NOTARIAL and COURT dossiers take Staff intake and forward; ON_HOLD does not.
     * @return true nếu nhánh là COURT hoặc NOTARIAL (nhận intake và chuyển tiếp)
     */
    public boolean acceptsIntake() {
        return ROUTE_COURT.equals(route) || ROUTE_NOTARIAL.equals(route);
    }

    /**
     * Routes Legal may review, approve and unlock.
     * @return true nếu Legal được rà soát/duyệt/mở khóa (cùng điều kiện {@link #acceptsIntake()})
     */
    public boolean isLegalReviewable() {
        return acceptsIntake();
    }

    /**
     * Dossier opened by Staff intake when Legal has not classified yet: the route follows the document actually
     * submitted. Nobody is recorded as the classifier; Legal still reviews validity and may place it on hold.
     * @param verificationCaseId id ca xác minh
     * @param route              nhánh theo loại văn bản Staff nộp
     * @param disputeStatus      tình trạng tranh chấp
     * @param staffUserId        id Staff mở hồ sơ
     * @return hồ sơ mới với {@code classifiedByUserId = null}
     */
    public static LegalBasisDossier openedByIntake(Long verificationCaseId, String route, String disputeStatus,
            Long staffUserId) {
        LegalBasisDossier dossier = new LegalBasisDossier(verificationCaseId, route,
                "Opened by Staff intake from the submitted document type", disputeStatus, staffUserId);
        dossier.classifiedByUserId = null;
        return dossier;
    }

    /**
     * A hold invalidates earlier clearance while preserving all versions and assessment history.
     * Chuyển hồ sơ sang ON_HOLD, đặt lại về DRAFT và nâng {@code requiredVersionNo} lên ít nhất {@code requiredVersion}.
     * @param reason          lý do tạm giữ
     * @param dispute         tình trạng tranh chấp
     * @param legalUserId     id Legal thực hiện
     * @param requiredVersion số phiên bản tối thiểu mới yêu cầu (>= 1)
     * @throws IllegalStateException nếu hồ sơ không thuộc nhánh nhận intake hoặc {@code requiredVersion < 1}
     */
    public void placeOnHold(String reason, String dispute, Long legalUserId, int requiredVersion) {
        if (!acceptsIntake() || requiredVersion < 1) throw new IllegalStateException("Invalid hold transition");
        route = ROUTE_ON_HOLD;
        status = STATUS_DRAFT;
        routeReason = reason;
        disputeStatus = dispute;
        classifiedByUserId = legalUserId;
        requiredVersionNo = Math.max(requiredVersionNo, requiredVersion);
    }

    /**
     * @return số phiên bản văn bản tối thiểu cần có
     */
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

    /**
     * Legal đã phân loại nhánh hiện hành.
     * @return id người phân loại, nếu chưa có thì rơi về người tạo hồ sơ
     */
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

    /**
     * Đánh dấu hồ sơ cần rà soát lại (REVIEW_REQUIRED) với mã lý do.
     * @param reasonCode mã lý do cần rà soát
     */
    public void requireReview(String reasonCode) {
        this.reviewStatus = LegalBasisReviewStatus.REVIEW_REQUIRED.name();
        this.reviewRequiredReason = reasonCode;
    }

    /**
     * Ghi ảnh chụp rà soát của Legal: phiên bản, hash, tranh chấp, hash phân bổ; chuyển {@code review_status} sang FRESH và xóa lý do cần rà soát.
     * @param versionNo            số phiên bản đã rà soát (>= 1)
     * @param sha256Hash           SHA-256 của phiên bản
     * @param currentDisputeStatus tình trạng tranh chấp hiện tại
     * @param allocationHash       hash phân bổ
     * @param reviewerUserId       id Legal rà soát
     * @throws IllegalArgumentException nếu thiếu bất kỳ thông tin nào của ảnh chụp
     */
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
