package com.legacyvault.common.audit;

import java.time.LocalDateTime;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

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

	@Column(name = "occurred_at", nullable = false)
	private LocalDateTime occurredAt;

	@Column(name = "details", columnDefinition = "nvarchar(max)")
	private String details;

	protected AuditLog() {
	}

	public AuditLog(Long actorUserId, Long vaultId, String action, String entityType, Long entityId,
			LocalDateTime occurredAt, String details) {
		this.actorUserId = actorUserId;
		this.vaultId = vaultId;
		this.action = action;
		this.entityType = entityType;
		this.entityId = entityId;
		this.occurredAt = occurredAt;
		this.details = details;
	}
}
