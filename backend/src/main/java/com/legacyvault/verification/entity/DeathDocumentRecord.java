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
 */
@Entity
@Table(name = "death_document_records", schema = "dbo")
public class DeathDocumentRecord {

    public static final String TYPE_DEATH_CERTIFICATE = "DEATH_CERTIFICATE";
    public static final String TYPE_DEATH_REGISTRATION_EXTRACT = "DEATH_REGISTRATION_EXTRACT";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "death_document_record_id")
    private Long deathDocumentRecordId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "document_type", nullable = false, length = 40, updatable = false)
    private String documentType;

    @Column(name = "issuing_authority", length = 255, updatable = false)
    private String issuingAuthority;

    @Column(name = "document_number", length = 100, updatable = false)
    private String documentNumber;

    @Column(name = "issued_date", updatable = false)
    private LocalDate issuedDate;

    @Column(name = "received_by_user_id", nullable = false, updatable = false)
    private Long receivedByUserId;

    @Column(name = "received_at", nullable = false, updatable = false)
    private LocalDateTime receivedAt;

    @Column(name = "evidence_reference", length = 500, updatable = false)
    private String evidenceReference;

    @Column(name = "notes", length = 1000, updatable = false)
    private String notes;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected DeathDocumentRecord() {
    }

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
