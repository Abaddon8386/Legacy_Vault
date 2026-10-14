package com.legacyvault.common.audit;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;

/** Compatibility entry point; persistence stays in the PS-13 audit service. */
@Service("workflowAuditService")
public class AuditService {
    private final com.legacyvault.audit.AuditService delegate;
    private final ObjectMapper objectMapper;

    public AuditService(com.legacyvault.audit.AuditService delegate, ObjectMapper objectMapper) {
        this.delegate = delegate;
        this.objectMapper = objectMapper;
    }

    public void record(Long actorUserId, Long vaultId, String action, String entityType, Long entityId,
            String actorType, Map<String, ?> details) {
        Map<String, Object> context = new LinkedHashMap<>();
        if (details != null) context.putAll(details);
        String before = stateJson(removeString(context, "stateBefore"));
        String after = stateJson(removeString(context, "stateAfter"));
        String stepId = removeString(context, "stepId");
        String ruleId = removeString(context, "ruleId");
        delegate.record(new AuditEvent(AuditAction.valueOf(action), AuditActorType.valueOf(actorType),
                actorUserId, vaultId, entityType, entityId, before, after, null, context, stepId, ruleId));
    }

    private String removeString(Map<String, Object> context, String key) {
        Object value = context.remove(key);
        return value == null ? null : value.toString();
    }

    private String stateJson(String status) {
        if (status == null) return null;
        try {
            return objectMapper.writeValueAsString(Map.of("status", status));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Could not serialize audit state", ex);
        }
    }
}
