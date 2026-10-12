package com.legacyvault.common.audit;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.ObjectMapper;
import com.legacyvault.common.web.TraceIdFilter;

@Service
public class AuditService {

	private final AuditLogRepository auditLogs;
	private final ObjectMapper objectMapper;

	public AuditService(AuditLogRepository auditLogs, ObjectMapper objectMapper) {
		this.auditLogs = auditLogs;
		this.objectMapper = objectMapper;
	}

	public void record(Long actorUserId, Long vaultId, String action, String entityType, Long entityId,
			String actorType, Map<String, ?> context) {
		Map<String, Object> details = new LinkedHashMap<>();
		details.put("actorType", actorType);
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		List<String> actorRoles = authentication == null ? List.of()
				: authentication.getAuthorities().stream().map(authority -> authority.getAuthority()).toList();
		details.put("actorRoles", actorRoles);
		String traceId = MDC.get(TraceIdFilter.MDC_KEY);
		if (traceId != null) {
			details.put("traceId", traceId);
		}
		if (context != null) {
			details.putAll(context);
		}
		try {
			auditLogs.save(new AuditLog(actorUserId, vaultId, action, entityType, entityId,
					LocalDateTime.now(ZoneOffset.UTC), objectMapper.writeValueAsString(details)));
		} catch (JacksonException ex) {
			throw new IllegalStateException("Could not serialize audit context", ex);
		}
	}
}
