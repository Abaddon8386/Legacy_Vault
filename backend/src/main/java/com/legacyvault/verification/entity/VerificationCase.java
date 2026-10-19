package com.legacyvault.verification.entity;

import jakarta.persistence.*;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "verification_cases", schema = "dbo")
public class VerificationCase {

    public static final String STATUS_OPEN = "OPEN";
    public static final String STATUS_CLOSED = "CLOSED";

    @Column(name = "closed_handover_session_id")
    private Long closedHandoverSessionId;

    public Long getClosedHandoverSessionId() { return closedHandoverSessionId; }

    public void complete(LocalDateTime now, Long handoverSessionId) {
        if (!isOpen()) throw new IllegalStateException("Verification case is not open");
        java.util.Objects.requireNonNull(handoverSessionId, "handoverSessionId");
        status = STATUS_CLOSED;
        closedAt = now;
        updatedAt = now;
        closedHandoverSessionId = handoverSessionId;
    }
    public static final String STATUS_CANCELLED = "CANCELLED";

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "verification_case_id")
    private Long verificationCaseId;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "vault_id", nullable = false)
    private Long vaultId;

    @Column(name = "status", nullable = false, length = 30)
    private String status;

    @Column(name = "triggered_at", nullable = false)
    private LocalDateTime triggeredAt;

    @Column(name = "assigned_staff_user_id")
    private Long assignedStaffUserId;

    @Column(name = "opened_by_user_id")
    private Long openedByUserId;

    @Column(name = "opened_at", nullable = false)
    private LocalDateTime openedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "created_at", nullable = false, updatable = false)
    private LocalDateTime createdAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected VerificationCase() {
    }

    public VerificationCase(
            Long vaultId,
            LocalDateTime triggeredAt,
            Long openedByUserId
    ) {
        this.vaultId = vaultId;
        this.triggeredAt = triggeredAt;
        this.openedByUserId = openedByUserId;
        this.status = STATUS_OPEN;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = STATUS_OPEN;
        if (openedAt == null) openedAt = now;
        if (createdAt == null) createdAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public boolean isOpen() {
        return STATUS_OPEN.equals(status);
    }

    public void cancel(LocalDateTime now) {
        if (!isOpen()) {
            throw new IllegalStateException("Verification case is not open");
        }
        this.status = STATUS_CANCELLED;
        this.closedAt = now;
        this.updatedAt = now;
    }

    public Long getVerificationCaseId() {
        return verificationCaseId;
    }

    public UUID getPublicId() {
        return publicId;
    }

    public Long getVaultId() {
        return vaultId;
    }

    public String getStatus() {
        return status;
    }

    public LocalDateTime getTriggeredAt() {
        return triggeredAt;
    }

    public Long getAssignedStaffUserId() {
        return assignedStaffUserId;
    }

    public LocalDateTime getClosedAt() {
        return closedAt;
    }

    public Long getOpenedByUserId() {
        return openedByUserId;
    }

    public LocalDateTime getOpenedAt() {
        return openedAt;
    }

    public LocalDateTime getCreatedAt() {
        return createdAt;
    }

    public LocalDateTime getUpdatedAt() {
        return updatedAt;
    }
}
