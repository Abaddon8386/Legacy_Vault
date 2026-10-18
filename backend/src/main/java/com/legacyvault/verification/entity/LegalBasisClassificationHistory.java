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
 */
@Entity
@Table(name = "legal_basis_classification_history", schema = "dbo")
public class LegalBasisClassificationHistory {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "classification_history_id")
    private Long classificationHistoryId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "legal_basis_dossier_id", nullable = false, updatable = false)
    private Long legalBasisDossierId;

    @Column(name = "route", nullable = false, updatable = false, length = 20)
    private String route;

    @Column(name = "dispute_status", nullable = false, updatable = false, length = 20)
    private String disputeStatus;

    @Column(name = "route_reason", updatable = false, length = 1000)
    private String routeReason;

    @Column(name = "classified_by_user_id", nullable = false, updatable = false)
    private Long classifiedByUserId;

    @Column(name = "classified_at", nullable = false, updatable = false)
    private LocalDateTime classifiedAt;

    @Column(name = "superseded_at", nullable = false, updatable = false)
    private LocalDateTime supersededAt;

    protected LegalBasisClassificationHistory() {
    }

    /** Chụp phân loại hiện hành của hồ sơ trước khi bị thay thế. */
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
