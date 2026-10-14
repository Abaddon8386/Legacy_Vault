package com.legacyvault.audit;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

import java.time.LocalDateTime;
import java.util.UUID;

@Entity
@Table(name = "audit_logs", schema = "dbo")
public class AuditLog {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    @Column(name = "audit_log_id")
    private Long id;

    @Column(name = "actor_user_id")
    private Long actorUserId;

    @Column(name = "vault_id")
    private Long vaultId;

    @Column(name = "action", nullable = false, length = 100)
    private String action;

    @Column(name = "entity_type", nullable = false, length = 50)
    private String entityType;

    @Column(name = "entity_id")
    private Long entityId;

    @Column(name = "occurred_at", nullable = false, insertable = false, updatable = false)
    private LocalDateTime occurredAt;

    @Column(name = "ip_address", length = 45)
    private String ipAddress;

    @Column(name = "details", columnDefinition = "nvarchar(max)")
    private String details;

    @Column(name = "retention_until")
    private LocalDateTime retentionUntil;

    @Column(name = "actor_type", length = 10)
    private String actorType;

    @Column(name = "actor_roles", columnDefinition = "nvarchar(max)")
    private String actorRoles;

    @Column(name = "state_before", columnDefinition = "nvarchar(max)")
    private String stateBefore;

    @Column(name = "state_after", columnDefinition = "nvarchar(max)")
    private String stateAfter;

    @Column(name = "trace_id")
    private UUID traceId;

    @Column(name = "step_id", length = 50)
    private String stepId;

    @Column(name = "rule_id", length = 100)
    private String ruleId;

    protected AuditLog() {
    }

    public AuditLog(
            Long actorUserId,
            Long vaultId,
            String action,
            String entityType,
            Long entityId,
            String ipAddress,
            String details,
            LocalDateTime retentionUntil,
            String actorType,
            String actorRoles,
            String stateBefore,
            String stateAfter,
            UUID traceId,
            String stepId,
            String ruleId
    ) {
        this.actorUserId = actorUserId;
        this.vaultId = vaultId;
        this.action = action;
        this.entityType = entityType;
        this.entityId = entityId;
        this.ipAddress = ipAddress;
        this.details = details;
        this.retentionUntil = retentionUntil;
        this.actorType = actorType;
        this.actorRoles = actorRoles;
        this.stateBefore = stateBefore;
        this.stateAfter = stateAfter;
        this.traceId = traceId;
        this.stepId = stepId;
        this.ruleId = ruleId;
    }

    public Long getId() {
        return id;
    }

    public Long getActorUserId() {
        return actorUserId;
    }

    public Long getVaultId() {
        return vaultId;
    }

    public String getAction() {
        return action;
    }

    public String getEntityType() {
        return entityType;
    }

    public Long getEntityId() {
        return entityId;
    }

    public LocalDateTime getOccurredAt() {
        return occurredAt;
    }

    public String getIpAddress() {
        return ipAddress;
    }

    public String getDetails() {
        return details;
    }

    public LocalDateTime getRetentionUntil() {
        return retentionUntil;
    }

    public String getActorType() {
        return actorType;
    }

    public String getActorRoles() {
        return actorRoles;
    }

    public String getStateBefore() {
        return stateBefore;
    }

    public String getStateAfter() {
        return stateAfter;
    }

    public UUID getTraceId() {
        return traceId;
    }

    public String getStepId() {
        return stepId;
    }

    public String getRuleId() {
        return ruleId;
    }
}