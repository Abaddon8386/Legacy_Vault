package com.legacyvault.beneficiary;

import com.legacyvault.auth.EmailNormalizer;
import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "beneficiary_invitations", schema = "dbo")
public class BeneficiaryInvitation {
    @Id @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "invitation_id") private Long id;
    @Column(name = "public_id", nullable = false, updatable = false) private UUID publicId;
    @ManyToOne(fetch = FetchType.LAZY, optional = false)
    @JoinColumn(name = "beneficiary_id", updatable = false) private Beneficiary beneficiary;
    @Column(nullable = false, updatable = false) private int generation;
    @Column(name = "is_current", nullable = false) private boolean current;
    @Column(name = "code_hash", nullable = false, updatable = false, length = 64) private String codeHash;
    @Column(name = "recipient_email", length = 254) private String recipientEmail;
    @Column(name = "issued_at", nullable = false, updatable = false) private LocalDateTime issuedAt;
    @Column(name = "expires_at", nullable = false, updatable = false) private LocalDateTime expiresAt;
    @Column(name = "issued_by_user_id", nullable = false, updatable = false) private Long issuedBy;
    @Column(name = "revoked_at") private LocalDateTime revokedAt;
    @Column(name = "revoked_by_user_id") private Long revokedBy;
    @Column(name = "consumed_at") private LocalDateTime consumedAt;
    @Column(name = "consumed_by_user_id") private Long consumedBy;

    protected BeneficiaryInvitation() { }
    BeneficiaryInvitation(Beneficiary beneficiary, int generation, String hash, Long actor, LocalDateTime now) {
        this.publicId = UUID.randomUUID(); this.beneficiary = beneficiary; this.generation = generation;
        this.current = true; this.codeHash = hash; this.issuedAt = now; this.expiresAt = now.plusDays(7);
        this.issuedBy = actor;
    }
    BeneficiaryInvitation(Beneficiary beneficiary, int generation, String hash, Long actor, LocalDateTime now,
            String recipientEmail) {
        this(beneficiary, generation, hash, actor, now);
        this.recipientEmail = EmailNormalizer.normalize(recipientEmail);
    }
    public String state(LocalDateTime now) {
        if (consumedAt != null) return "CONSUMED";
        if (revokedAt != null) return "REVOKED";
        return now.isBefore(expiresAt) ? "PENDING" : "EXPIRED";
    }
    void revoke(Long actor, LocalDateTime now) { revokedAt = now; revokedBy = actor; }
    void retire() { current = false; }
    void consume(Long account, LocalDateTime now) { consumedAt = now; consumedBy = account; }
    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Beneficiary getBeneficiary() { return beneficiary; }
    public int getGeneration() { return generation; }
    public boolean isCurrent() { return current; }
    public Long getConsumedBy() { return consumedBy; }
    public LocalDateTime getIssuedAt() { return issuedAt; }
    public LocalDateTime getExpiresAt() { return expiresAt; }
    public LocalDateTime getRevokedAt() { return revokedAt; }
    public LocalDateTime getConsumedAt() { return consumedAt; }
    public String getRecipientEmail() { return recipientEmail; }
}
