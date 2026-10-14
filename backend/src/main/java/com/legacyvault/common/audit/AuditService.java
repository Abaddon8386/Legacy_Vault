package com.legacyvault.common.audit;

import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;
import com.legacyvault.audit.AuditAction;
import com.legacyvault.audit.AuditActorType;
import com.legacyvault.audit.AuditEvent;

/** Compatibility entry point; persistence stays in the PS-13 audit service. */
@Service
public class AuditService {
    private final com.legacyvault.audit.AuditService delegate;

    public AuditService(com.legacyvault.audit.AuditService delegate) {
        this.delegate = delegate;
    }

    public void record(Long actorUserId, Long vaultId, String action, String entityType, Long entityId,
            String actorType, Map<String, ?> details) {
        Map<String, Object> context = new LinkedHashMap<>();
        if (details != null) context.putAll(details);
        String before = removeString(context, "stateBefore");
        String after = removeString(context, "stateAfter");
        String stepId = removeString(context, "stepId");
        String ruleId = removeString(context, "ruleId");
        delegate.record(new AuditEvent(AuditAction.valueOf(action), AuditActorType.valueOf(actorType),
                actorUserId, vaultId, entityType, entityId, before, after, null, context, stepId, ruleId));
    }

    private String removeString(Map<String, Object> context, String key) {
        Object value = context.remove(key);
        return value == null ? null : value.toString();
    }
}
