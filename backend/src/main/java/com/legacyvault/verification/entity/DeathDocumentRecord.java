package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

/**
 * Bản ghi metadata của giấy tờ khai tử vật lý mà Staff đã nhận (ST-11, LV-DEATH-002). Chỉ là ghi nhận việc
 * tiếp nhận: không chứng minh giấy tờ hợp lệ, việc đó thuộc Legal Verifier (ST-12). Bản ghi không bị sửa hay xóa;
 * nhận thêm giấy tờ khác thì tạo bản ghi mới.
 * <p>
 * Bảng {@code dbo.death_document_records}, thuộc một ca xác minh ({@code verification_cases}). Do {@code DeathDocumentIntakeService}
 * tạo, {@code IntakeAttachmentService} gắn file đính kèm ({@code StaffIntakeAttachment}) và {@code LegalDeathVerificationService}
 * đọc để Legal quyết định (kết quả lưu ở {@link LegalVerification}).
 */
@Entity
@Table(name = "death_document_records", schema = "dbo")
public class DeathDocumentRecord {

    /**
     * Loại giấy tờ: giấy chứng tử.
     */
    public static final String TYPE_DEATH_CERTIFICATE = "DEATH_CERTIFICATE";
    /**
     * Loại giấy tờ: trích lục khai tử.
     */
    public static final String TYPE_DEATH_REGISTRATION_EXTRACT = "DEATH_REGISTRATION_EXTRACT";

    /**
     * Khóa chính nội bộ {@code death_document_record_id} (IDENTITY).
     */
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "death_document_record_id")
    private Long deathDocumentRecordId;

    /**
     * Mã công khai (UUID) dùng ở API.
     */
    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    /**
     * Id ca xác minh chứa giấy tờ.
     */
    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    /**
     * Loại giấy tờ: {@link #TYPE_DEATH_CERTIFICATE} hoặc {@link #TYPE_DEATH_REGISTRATION_EXTRACT}.
     */
    @Column(name = "document_type", nullable = false, length = 40, updatable = false)
    private String documentType;

    /**
     * Cơ quan cấp giấy tờ (tùy chọn).
     */
    @Column(name = "issuing_authority", length = 255, updatable = false)
    private String issuingAuthority;

    /**
     * Số giấy tờ (tùy chọn).
     */
    @Column(name = "document_number", length = 100, updatable = false)
    private String documentNumber;

    /**
     * Ngày cấp (tùy chọn).
     */
    @Column(name = "issued_date", updatable = false)
    private LocalDate issuedDate;

    /**
     * Id Staff đã nhận giấy tờ tại quầy.
     */
    @Column(name = "received_by_user_id", nullable = false, updatable = false)
    private Long receivedByUserId;

    /**
     * Thời điểm nhận (UTC); mặc định là lúc lưu nếu chưa đặt.
     */
    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    /**
     * Tham chiếu bằng chứng tiếp nhận (tùy chọn).
     */
    @Column(name = "evidence_reference", length = 500, updatable = false)
    private String evidenceReference;

    /**
     * Ghi chú tình trạng giấy tờ (tùy chọn, tối đa 1000 ký tự).
     */
    @Column(name = "notes", length = 1000, updatable = false)
    private String notes;

    /**
     * Thời điểm tạo bản ghi (UTC).
     */
    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    /**
     * Constructor không tham số cho JPA.
     */
    protected DeathDocumentRecord() {
    }

    /**
     * Tạo bản ghi tiếp nhận giấy tờ khai tử.
     * @param verificationCaseId id ca xác minh
     * @param documentType       loại giấy tờ (xem hằng số {@code TYPE_*})
     * @param issuingAuthority   cơ quan cấp
     * @param documentNumber     số giấy tờ
     * @param issuedDate         ngày cấp
     * @param receivedByUserId   id Staff nhận
     * @param evidenceReference  tham chiếu bằng chứng
     * @param notes              ghi chú
     */
    public DeathDocumentRecord(
            Long verificationCaseId,
            String documentType,
            String issuingAuthority,
            String documentNumber,
            LocalDate issuedDate,
            Long receivedByUserId,
            String evidenceReference,
            String notes
    ) {
        this.verificationCaseId = verificationCaseId;
        this.documentType = documentType;
        this.issuingAuthority = issuingAuthority;
        this.documentNumber = documentNumber;
        this.issuedDate = issuedDate;
        this.receivedByUserId = receivedByUserId;
        this.evidenceReference = evidenceReference;
        this.notes = notes;
    }

    /**
     * Callback trước khi lưu lần đầu: sinh {@code publicId}, đặt {@code receivedAt} và {@code createdAt} (UTC) nếu chưa có.
     */
    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (receivedAt == null) receivedAt = now;
        if (createdAt == null) createdAt = now;
    }

    public Long getDeathDocumentRecordId() {
        return deathDocumentRecordId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public String getDocumentType() {
        return documentType;
    }

    public String getIssuingAuthority() {
        return issuingAuthority;
    }

    public String getDocumentNumber() {
        return documentNumber;
    }

    public LocalDate getIssuedDate() {
        return issuedDate;
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

    public String getNotes() {
        return notes;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }
}
