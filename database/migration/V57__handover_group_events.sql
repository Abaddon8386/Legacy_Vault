CREATE TABLE dbo.handover_group_events (
 event_id bigint IDENTITY PRIMARY KEY,
 public_id uniqueidentifier NOT NULL UNIQUE,
 case_id bigint NOT NULL REFERENCES dbo.verification_cases(verification_case_id),
 session_id bigint NOT NULL REFERENCES dbo.handover_sessions(handover_session_id),
 actor_user_id bigint NOT NULL REFERENCES dbo.users(user_id),
 operation varchar(20) NOT NULL CHECK(operation IN ('ATTENDANCE','REQUEST','APPROVE','REJECT')),
 idempotency_key uniqueidentifier NOT NULL,
 payload_hash char(64) NOT NULL,
 revision bigint NOT NULL,
 state_json nvarchar(max) NOT NULL CHECK(ISJSON(state_json)=1),
 present_json nvarchar(max) NOT NULL CHECK(ISJSON(present_json)=1),
 reason nvarchar(1000) NOT NULL,
 created_at datetime2 NOT NULL DEFAULT SYSUTCDATETIME(),
 CONSTRAINT UQ_group_event_revision UNIQUE(case_id,revision),
 CONSTRAINT UQ_group_event_retry UNIQUE(case_id,actor_user_id,idempotency_key)
);
CREATE INDEX IX_group_event_case ON dbo.handover_group_events(case_id,event_id DESC);
