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
 * Ghi nhận bản di chúc giấy gốc đã được nộp tại quầy (ST-13, LV-WILL-001): ai giao, ai nhận, khi nào, bằng chứng và
 * tình trạng. Chỉ là ghi nhận việc nộp: không xác nhận di chúc hợp lệ hay đúng với bản scan (đối chiếu là việc của
 * Legal). Bản ghi không bị sửa hay xóa; nộp thêm thì tạo bản ghi mới.
 */
@Entity
@Table(name = "original_will_intakes", schema = "dbo")
public class OriginalWillIntake {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "original_will_intake_id")
    private Long originalWillIntakeId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "delivered_by_name", nullable = false, length = 150, updatable = false)
    private String deliveredByName;

    @Column(name = "delivered_by_relationship", length = 100, updatable = false)
    private String deliveredByRelationship;

    @Column(name = "received_by_user_id", nullable = false, updatable = false)
    private Long receivedByUserId;

    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    @Column(name = "evidence_reference", length = 500, updatable = false)
    private String evidenceReference;

    @Column(name = "condition_notes", length = 1000, updatable = false)
    private String conditionNotes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected OriginalWillIntake() {
    }

    public OriginalWillIntake(
            Long verificationCaseId,
            String deliveredByName,
            String deliveredByRelationship,
            Long receivedByUserId,
            String evidenceReference,
            String conditionNotes
    ) {
        this.verificationCaseId = verificationCaseId;
        this.deliveredByName = deliveredByName;
        this.deliveredByRelationship = deliveredByRelationship;
        this.receivedByUserId = receivedByUserId;
        this.evidenceReference = evidenceReference;
        this.conditionNotes = conditionNotes;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (receivedAt == null) receivedAt = now;
        if (createdAt == null) createdAt = now;
    }

    public Long getOriginalWillIntakeId() {
        return originalWillIntakeId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public String getDeliveredByName() {
        return deliveredByName;
    }

    public String getDeliveredByRelationship() {
        return deliveredByRelationship;
    }

    public Long getReceivedByUserId() {
        return receivedByUserId;
    }

    public LocalDateTime getReceivedAt() {
        return receivedAt;
    }

    public String getEvidenceReference() {
        return evidenceReference;
    }

    public String getConditionNotes() {
        return conditionNotes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
