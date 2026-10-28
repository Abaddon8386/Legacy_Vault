CREATE TABLE dbo.workflow_notifications (
 notification_id BIGINT IDENTITY(1,1) NOT NULL PRIMARY KEY,
 public_id UNIQUEIDENTIFIER NOT NULL DEFAULT NEWID() UNIQUE,
 audit_log_id BIGINT NOT NULL UNIQUE REFERENCES dbo.audit_logs(audit_log_id),
 verification_case_id BIGINT NOT NULL REFERENCES dbo.verification_cases(verification_case_id),
 action VARCHAR(100) NOT NULL,
 reason NVARCHAR(1000) NULL,
 occurred_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
);
CREATE INDEX IX_workflow_notifications_case ON dbo.workflow_notifications(verification_case_id, notification_id DESC);
CREATE TABLE dbo.workflow_notification_reads (
 notification_id BIGINT NOT NULL REFERENCES dbo.workflow_notifications(notification_id),
 user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
 read_at DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT PK_workflow_notification_reads PRIMARY KEY(notification_id,user_id)
);
