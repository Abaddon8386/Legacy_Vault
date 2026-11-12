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
 * <p>
 * Bảng {@code dbo.original_will_intakes}, thuộc một ca xác minh. Do {@code OriginalWillIntakeService} tạo; {@code IntakeAttachmentService}
 * gắn file ({@link StaffIntakeAttachment}); {@code WillComparisonService} dùng khi Legal đối chiếu ({@link WillComparison}).
 */
@Entity
@Table(name = "original_will_intakes", schema = "dbo")
public class OriginalWillIntake {

    /**
     * Khóa chính nội bộ {@code original_will_intake_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "original_will_intake_id")
    private Long originalWillIntakeId;

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
     * Họ tên người giao di chúc gốc.
     */
    @Column(name = "delivered_by_name", nullable = false, length = 150, updatable = false)
    private String deliveredByName;

    /**
     * Quan hệ của người giao với người lập di chúc (tùy chọn).
     */
    @Column(name = "delivered_by_relationship", length = 100, updatable = false)
    private String deliveredByRelationship;

    /**
     * Id Staff nhận di chúc.
     */
    @Column(name = "received_by_user_id", nullable = false, updatable = false)
    private Long receivedByUserId;

    /**
     * Thời điểm nhận (UTC).
     */
    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    /**
     * Tham chiếu bằng chứng tiếp nhận (tùy chọn).
     */
    @Column(name = "evidence_reference", length = 500, updatable = false)
    private String evidenceReference;

    /**
     * Ghi chú tình trạng bản gốc (tùy chọn).
     */
    @Column(name = "condition_notes", length = 1000, updatable = false)
    private String conditionNotes;

    /**
     * Thời điểm tạo bản ghi (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected OriginalWillIntake() {
    }

    /**
     * Tạo bản ghi tiếp nhận di chúc gốc.
     * @param verificationCaseId     id ca xác minh
     * @param deliveredByName        tên người giao
     * @param deliveredByRelationship quan hệ của người giao
     * @param receivedByUserId       id Staff nhận
     * @param evidenceReference      tham chiếu bằng chứng
     * @param conditionNotes         ghi chú tình trạng
     */
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

    /**
     * Trước khi lưu: sinh {@code publicId}, đặt {@code receivedAt} và {@code createdAt} (UTC) nếu chưa có.
     */
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
