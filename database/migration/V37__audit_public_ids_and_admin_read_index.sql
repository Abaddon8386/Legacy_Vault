-- PS-108: additive public event identity. Existing event payload/state/time are untouched.
-- ALTER WITH VALUES populates only the new column without UPDATE/DELETE of append-only events.
ALTER TABLE dbo.audit_logs ADD public_id UNIQUEIDENTIFIER NOT NULL
 CONSTRAINT DF_audit_logs_public_id DEFAULT NEWID() WITH VALUES;
GO
CREATE UNIQUE INDEX UX_audit_logs_public_id ON dbo.audit_logs(public_id);
CREATE INDEX IX_audit_logs_admin_time ON dbo.audit_logs(occurred_at DESC, audit_log_id DESC)
 INCLUDE(public_id, action, actor_user_id, actor_type, entity_type, vault_id, trace_id);
GO
