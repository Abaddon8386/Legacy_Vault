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
 * Phân loại cũ của hồ sơ căn cứ, lưu khi Legal phân loại lại từ ON_HOLD (LV-HOLD-001). Chỉ thêm mới, không sửa/xóa.
 * <p>
 * Bảng {@code dbo.legal_basis_classification_history}. Do {@code BasisReclassificationService} và {@code LegalBasisHoldService} tạo
 * bằng {@link #of(LegalBasisDossier)} để chụp lại nhánh, tình trạng tranh chấp và lý do cũ của {@link LegalBasisDossier}.
 */
@Entity
@Table(name = "legal_basis_classification_history", schema = "dbo")
public class LegalBasisClassificationHistory {

    /**
     * Khóa chính nội bộ {@code classification_history_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "classification_history_id")
    private Long classificationHistoryId;

    /**
     * Mã công khai (UUID).
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id hồ sơ căn cứ ({@code legal_basis_dossiers}).
     */
    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long legalBasisDossierId;

    /**
     * Nhánh cũ: NOTARIAL, COURT hoặc ON_HOLD.
     */
    @Column(name = "route", nullable = false, updatable = false, length = 20)
    private String route;

    /**
     * Tình trạng tranh chấp cũ: NONE, DISPUTED hoặc UNDETERMINED.
     */
    @Column(name = "dispute_status", nullable = false, updatable = false, length = 20)
    private String disputeStatus;

    /**
     * Lý do phân nhánh cũ.
     */
    @Column(name = "route_reason", updatable = false, length = 1000)
    private String routeReason;

    /**
     * Id người phân loại cũ.
     */
    @Column(name = "classified_by_user_id", nullable = false, updatable = false)
    private Long classifiedByUserId;

    /**
     * Thời điểm phân loại cũ (lấy từ {@code updated_at} của hồ sơ lúc chụp).
     */
    @Column(name = "classified_at", nullable = false, updatable = false)
    private LocalDateTime classifiedAt;

    /**
     * Thời điểm phân loại này bị thay thế (UTC).
     */
    @Column(name = "superseded_at", nullable = false, updatable = false)
    private LocalDateTime supersededAt;

    /**
     * Constructor không tham số cho JPA (dùng {@link #of}).
     */
    protected LegalBasisClassificationHistory() {
    }

    /**
     * Chụp phân loại hiện hành của hồ sơ trước khi bị thay thế.
     * @param dossier hồ sơ căn cứ đang được phân loại lại
     * @return bản ghi lịch sử chưa lưu, sao chép route, dispute_status, route_reason, người và thời điểm phân loại
     */
    public static LegalBasisClassificationHistory of(LegalBasisDossier dossier) {
        LegalBasisClassificationHistory h = new LegalBasisClassificationHistory();
        h.legalBasisDossierId = dossier.getLegalBasisDossierId();
        h.route = dossier.getRoute();
        h.disputeStatus = dossier.getDisputeStatus();
        h.routeReason = dossier.getRouteReason();
        h.classifiedByUserId = dossier.getClassifiedByUserId();
        h.classifiedAt = dossier.getUpdatedAt();
        return h;
    }

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt {@code supersededAt} (UTC) và {@code classifiedAt} nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (supersededAt == null) supersededAt = LocalDateTime.now(ZoneOffset.UTC);
        if (classifiedAt == null) classifiedAt = supersededAt;
    }

    public Long getClassificationHistoryId() {
        return classificationHistoryId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getLegalBasisDossierId() {
        return legalBasisDossierId;
    }

    public String getRoute() {
        return route;
    }

    public String getDisputeStatus() {
        return disputeStatus;
    }

    public String getRouteReason() {
        return routeReason;
    }

    public Long getClassifiedByUserId() {
        return classifiedByUserId;
    }

    public LocalDateTime getClassifiedAt() {
        return classifiedAt;
    }

    public LocalDateTime getSupersededAt() {
        return supersededAt;
    }
}
