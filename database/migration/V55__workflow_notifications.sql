CREATE TABLE dbo.workflow_notifications (
 public_id uniqueidentifier NOT NULL PRIMARY KEY,
 case_id bigint NOT NULL REFERENCES dbo.verification_cases(verification_case_id),
 workspace varchar(5) NOT NULL CHECK (workspace IN ('STAFF','LEGAL')),
 recipient_user_id bigint NULL REFERENCES dbo.users(user_id),
 action varchar(80) NOT NULL,
 event_key varchar(160) NOT NULL,
 reason nvarchar(1000) NULL,
 occurred_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_workflow_notification_event UNIQUE(case_id,event_key),
 CONSTRAINT CK_workflow_notification_recipient CHECK
   ((workspace='STAFF' AND recipient_user_id IS NOT NULL) OR (workspace='LEGAL' AND recipient_user_id IS NULL))
);
CREATE INDEX IX_workflow_notifications_workspace ON dbo.workflow_notifications(workspace,occurred_at DESC);
CREATE TABLE dbo.workflow_notification_reads (
 notification_id uniqueidentifier NOT NULL REFERENCES dbo.workflow_notifications(public_id),
 user_id bigint NOT NULL REFERENCES dbo.users(user_id),
 read_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 PRIMARY KEY(notification_id,user_id)
);
