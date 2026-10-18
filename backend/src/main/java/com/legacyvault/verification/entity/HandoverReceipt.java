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

/** Immutable server-recorded Staff attestation of a completed handover. */
@Entity
@Table(name = "handover_receipts", schema = "dbo")
public class HandoverReceipt {
    public static final String STAFF_ATTESTATION = "STAFF_ATTESTATION";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_receipt_id")
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "handover_session_id", nullable = false, updatable = false)
    private Long handoverSessionId;

    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    @Column(name = "staff_user_id", nullable = false, updatable = false)
    private Long staffUserId;

    @Column(name = "dossier_version_id", nullable = false, updatable = false)
    private Long dossierVersionId;

    @Column(name = "dossier_version_no", nullable = false, updatable = false)
    private int dossierVersionNo;

    @Column(name = "sha256_hash", nullable = false, length = 64, updatable = false)
    private String sha256Hash;

    @Column(name = "allocation_hash", nullable = false, length = 64, updatable = false)
    private String allocationHash;

    @Column(name = "confirmation_type", nullable = false, length = 30, updatable = false)
    private String confirmationType;

    @Column(name = "confirmed_at", nullable = false, updatable = false)
    private LocalDateTime confirmedAt;

    @Column(name = "supersedes_receipt_id", updatable = false)
    private Long supersedesReceiptId;

    protected HandoverReceipt() {}

    public HandoverReceipt(Long handoverSessionId, Long beneficiaryId, Long staffUserId,
            Long dossierVersionId, int dossierVersionNo, String sha256Hash, String allocationHash,
            Long supersedesReceiptId, LocalDateTime confirmedAt) {
        this.publicId = UUID.randomUUID();
        this.handoverSessionId = handoverSessionId;
        this.beneficiaryId = beneficiaryId;
        this.staffUserId = staffUserId;
        this.dossierVersionId = dossierVersionId;
        this.dossierVersionNo = dossierVersionNo;
        this.sha256Hash = sha256Hash;
        this.allocationHash = allocationHash;
        this.confirmationType = STAFF_ATTESTATION;
        this.supersedesReceiptId = supersedesReceiptId;
        this.confirmedAt = confirmedAt;
    }

    @PrePersist
    protected void onCreate() {
        if (publicId == null) publicId = UUID.randomUUID();
        if (confirmationType == null) confirmationType = STAFF_ATTESTATION;
        if (confirmedAt == null) confirmedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getHandoverSessionId() { return handoverSessionId; }
    public Long getBeneficiaryId() { return beneficiaryId; }
    public Long getStaffUserId() { return staffUserId; }
    public Long getDossierVersionId() { return dossierVersionId; }
    public int getDossierVersionNo() { return dossierVersionNo; }
    public String getSha256Hash() { return sha256Hash; }
    public String getAllocationHash() { return allocationHash; }
    public String getConfirmationType() { return confirmationType; }
    public LocalDateTime getConfirmedAt() { return confirmedAt; }
    public Long getSupersedesReceiptId() { return supersedesReceiptId; }
}
