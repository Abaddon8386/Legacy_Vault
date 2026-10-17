package com.legacyvault.vault.entity;

import jakarta.persistence.*;
import java.time.Instant;
import java.util.UUID;

@Entity
@Table(
        name = "vaults",
        uniqueConstraints = @UniqueConstraint(
                name = "UQ_vaults_owner",
                columnNames = "owner_user_id"
        )
)
public class Vault {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "vault_id")
    private Long vaultId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "owner_user_id", nullable = false, updatable = false)
    private Long ownerUserId;

    @Column(name = "vault_name", nullable = false, length = 150)
    private String name;

    @Column(name = "description", columnDefinition = "nvarchar(max)")
    private String description;

    @Column(name = "status", nullable = false, length = 40)
    private String status;

    @Column(name = "created_at", nullable = false, updatable = false)
    private Instant createdAt;

    @Column(name = "updated_at", nullable = false)
    private Instant updatedAt;

    public Vault() {
    }

    @PrePersist
    protected void onCreate() {
        Instant now = Instant.now();
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = "ACTIVE";
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    public void restoreActive() {
        this.status = "ACTIVE";
        this.updatedAt = java.time.Instant.now();
    }

    public static final String STATUS_ACTIVE = "ACTIVE";
    public static final String STATUS_AWAITING_VERIFICATION = "AWAITING_VERIFICATION";
    public static final String STATUS_DOCUMENT_VERIFICATION = "DOCUMENT_VERIFICATION";

    public void markDocumentVerification() {
        if (!STATUS_AWAITING_VERIFICATION.equals(this.status)) {
            throw new IllegalStateException(
                    "Vault is not awaiting death-document verification"
            );
        }

        this.status = STATUS_DOCUMENT_VERIFICATION;
        this.updatedAt = Instant.now();
    }

    public static final String STATUS_WILL_VERIFICATION = "WILL_VERIFICATION";
    public static final String STATUS_AWAITING_LEGAL_BASIS = "AWAITING_LEGAL_BASIS";
    public static final String STATUS_ON_HOLD = "ON_HOLD";
    public static final String STATUS_LEGAL_BASIS_VERIFICATION = "LEGAL_BASIS_VERIFICATION";

    /** ST-15: Legal đối chiếu di chúc gốc khớp bản scan. DOCUMENT_VERIFICATION -> WILL_VERIFICATION. */
    public void markWillVerification() {
        moveTo(STATUS_DOCUMENT_VERIFICATION, STATUS_WILL_VERIFICATION);
    }

    /**
     * ST-16: Legal phân loại căn cứ. WILL_VERIFICATION -> AWAITING_LEGAL_BASIS (NOTARIAL/COURT) hoặc ON_HOLD (chưa đủ
     * thông tin). Qua LEGAL_BASIS_CLASSIFICATION trong cùng một thao tác.
     */
    public void markLegalBasisRouted(boolean onHold) {
        moveTo(STATUS_WILL_VERIFICATION, onHold ? STATUS_ON_HOLD : STATUS_AWAITING_LEGAL_BASIS);
    }

    /** ON_HOLD -> LEGAL_BASIS_CLASSIFICATION -> AWAITING_LEGAL_BASIS khi Legal đã đủ chứng cứ phân loại lại. */
    public void markAwaitingLegalBasisAfterHold() {
        moveTo(STATUS_ON_HOLD, STATUS_AWAITING_LEGAL_BASIS);
    }

    /** Legal reopens review on new dispute/missing evidence; this never unlocks the Vault. */
    public void holdLegalBasisReview() {
        if (!STATUS_AWAITING_LEGAL_BASIS.equals(status) && !STATUS_LEGAL_BASIS_VERIFICATION.equals(status))
            throw new IllegalStateException("Vault is not in the legal-basis workflow");
        status = STATUS_ON_HOLD;
        updatedAt = Instant.now();
    }

    /** ST-19/20: Staff chuyển văn bản đúng nhánh cho Legal. AWAITING_LEGAL_BASIS -> LEGAL_BASIS_VERIFICATION. */
    public void markLegalBasisVerification() {
        moveTo(STATUS_AWAITING_LEGAL_BASIS, STATUS_LEGAL_BASIS_VERIFICATION);
    }

    private void moveTo(String expectedFrom, String to) {
        if (!expectedFrom.equals(this.status)) {
            throw new IllegalStateException("Vault must be " + expectedFrom + " to move to " + to);
        }
        this.status = to;
        this.updatedAt = Instant.now();
    }

    public boolean canEnterVerification() {
        return STATUS_ACTIVE.equals(status);
    }

    public void markAwaitingVerification() {
        if (!canEnterVerification()) {
            throw new IllegalStateException(
                    "Vault is not eligible for verification transition"
            );
        }

        this.status = STATUS_AWAITING_VERIFICATION;
        this.updatedAt = Instant.now();
    }


    public Long getVaultId() {
        return vaultId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getOwnerUserId() {
        return ownerUserId;
    }

    public void setOwnerUserId(Long ownerUserId) {
        this.ownerUserId = ownerUserId;
    }

    public String getName() {
        return name;
    }

    public void setName(String name) {
        this.name = name;
    }

    public String getDescription() {
        return description;
    }

    public void setDescription(String description) {
        this.description = description;
    }

    public String getStatus() {
        return status;
    }

    public Instant getCreatedAt() {
        return createdAt;
    }

    public Instant getUpdatedAt() {
        return updatedAt;
    }

}
