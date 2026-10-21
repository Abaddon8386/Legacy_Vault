package com.legacyvault.beneficiary;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.Table;

/** Encrypted, transactional handoff payload for the disabled-by-default PS-106 mail transport. */
@Entity
@Table(name = "beneficiary_invitation_mail_outbox", schema = "dbo")
public class BeneficiaryInvitationOutbox {
    public static final String QUEUED = "QUEUED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "outbox_id")
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "beneficiary_id", nullable = false, updatable = false)
    private Long beneficiaryId;

    @Column(name = "invitation_id", nullable = false, unique = true, updatable = false)
    private Long invitationId;

    @Column(name = "invitation_public_id", nullable = false, updatable = false)
    private UUID invitationPublicId;

    @Column(name = "request_generation", nullable = false, updatable = false)
    private int requestGeneration;

    @Column(name = "invitation_generation", nullable = false, updatable = false)
    private int invitationGeneration;

    @Column(name = "payload_ciphertext", nullable = false, columnDefinition = "varbinary(max)", updatable = false)
    private byte[] payloadCiphertext;

    @Column(name = "payload_iv", nullable = false, columnDefinition = "varbinary(12)", updatable = false)
    private byte[] payloadIv;

    @Column(name = "key_version", nullable = false, length = 32, updatable = false)
    private String keyVersion;

    @Column(name = "transport_status", nullable = false, length = 20)
    private String transportStatus = QUEUED;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    protected BeneficiaryInvitationOutbox() { }

    public BeneficiaryInvitationOutbox(UUID publicId, Long beneficiaryId, Long invitationId, UUID invitationPublicId,
            int requestGeneration,
            int invitationGeneration, byte[] payloadCiphertext, byte[] payloadIv, String keyVersion) {
        this.publicId = publicId;
        this.beneficiaryId = beneficiaryId;
        this.invitationId = invitationId;
        this.invitationPublicId = invitationPublicId;
        this.requestGeneration = requestGeneration;
        this.invitationGeneration = invitationGeneration;
        this.payloadCiphertext = payloadCiphertext.clone();
        this.payloadIv = payloadIv.clone();
        this.keyVersion = keyVersion;
    }

    @PrePersist
    void onCreate() {
        if (createdAt == null) createdAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getBeneficiaryId() { return beneficiaryId; }
    public Long getInvitationId() { return invitationId; }
    public UUID getInvitationPublicId() { return invitationPublicId; }
    public int getRequestGeneration() { return requestGeneration; }
    public int getInvitationGeneration() { return invitationGeneration; }
    public String getTransportStatus() { return transportStatus; }
    public LocalDateTime getCreatedAt() { return createdAt; }

    @Override public String toString() {
        return "BeneficiaryInvitationOutbox[publicId=" + publicId + ", transportStatus=" + transportStatus
                + ", payload=<encrypted>]";
    }
}
