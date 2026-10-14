package com.legacyvault.audit;

import java.util.Map;

public record AuditEvent(
        AuditAction action,
        AuditActorType actorType,
        Long actorUserId,
        Long vaultId,
        String entityType,
        Long entityId,
        String stateBefore,
        String stateAfter,
        String ipAddress,
        Map<String, Object> context,
        String stepId,
        String ruleId
) {
    public AuditEvent {
        if (action == null) {
            throw new IllegalArgumentException("Audit action is required");
        }
        if (actorType == null) {
            throw new IllegalArgumentException("Audit actor type is required");
        }
        if (actorType == AuditActorType.USER
                && actorUserId == null
                && action != AuditAction.AUTH_LOGIN_FAILED) {
            throw new IllegalArgumentException(
                    "USER audit events require actorUserId except AUTH_LOGIN_FAILED"
            );
        }
        if (entityType == null || entityType.isBlank()) {
            throw new IllegalArgumentException("Entity type is required");
        }
        if (entityType.length() > 50) {
            throw new IllegalArgumentException("Entity type must not exceed 50 characters");
        }
        if (stepId != null && stepId.length() > 50) {
            throw new IllegalArgumentException("Step ID must not exceed 50 characters");
        }
        if (ruleId != null && ruleId.length() > 100) {
            throw new IllegalArgumentException("Rule ID must not exceed 100 characters");
        }
        context = context == null ? Map.of() : Map.copyOf(context);
    }
}