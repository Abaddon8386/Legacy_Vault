package com.legacyvault.verification.entity;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.PrePersist;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.UUID;

@Entity
@Table(name = "handover_sessions", schema = "dbo")
public class HandoverSession {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "handover_session_id")
    private Long id;

    @Column(name = "public_id", nullable = false, unique = true, updatable = false)
    private UUID publicId;

    @Column(name = "verification_case_id", nullable = false, updatable = false)
    private Long verificationCaseId;

    @Column(name = "staff_user_id", nullable = false, updatable = false)
    private Long staffUserId;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false, length = 20)
    private HandoverSessionStatus status;

    @Column(name = "opened_at", nullable = false, updatable = false)
    private LocalDateTime openedAt;

    @Column(name = "closed_at")
    private LocalDateTime closedAt;

    @Column(name = "updated_at", nullable = false)
    private LocalDateTime updatedAt;

    protected HandoverSession() {}

    public HandoverSession(Long verificationCaseId, Long staffUserId) {
        this.verificationCaseId = verificationCaseId;
        this.staffUserId = staffUserId;
        this.status = HandoverSessionStatus.OPEN;
    }

    @PrePersist
    protected void onCreate() {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        if (publicId == null) publicId = UUID.randomUUID();
        if (status == null) status = HandoverSessionStatus.OPEN;
        if (openedAt == null) openedAt = now;
        if (updatedAt == null) updatedAt = now;
    }

    @PreUpdate
    protected void onUpdate() {
        updatedAt = LocalDateTime.now(ZoneOffset.UTC);
    }

    public void close(HandoverSessionStatus terminalStatus, LocalDateTime now) {
        if (status != HandoverSessionStatus.OPEN
                || (terminalStatus != HandoverSessionStatus.COMPLETED
                && terminalStatus != HandoverSessionStatus.CANCELLED)) {
            throw new IllegalStateException("Invalid handover session transition");
        }
        status = terminalStatus;
        closedAt = now;
        updatedAt = now;
    }

    public Long getId() { return id; }
    public UUID getPublicId() { return publicId; }
    public Long getVerificationCaseId() { return verificationCaseId; }
    public Long getStaffUserId() { return staffUserId; }
    public HandoverSessionStatus getStatus() { return status; }
    public LocalDateTime getOpenedAt() { return openedAt; }
    public LocalDateTime getClosedAt() { return closedAt; }
    public LocalDateTime getUpdatedAt() { return updatedAt; }
}
