-- PS-112. Additive migration; retain these columns on binary rollback.
ALTER TABLE dbo.users ADD auth_version BIGINT NOT NULL CONSTRAINT DF_users_auth_version DEFAULT 0,
    password_login_enabled BIT NULL CONSTRAINT DF_users_password_login_enabled DEFAULT NULL,
    password_reset_at DATETIME2 NULL;
GO
ALTER TABLE dbo.users ADD CONSTRAINT CK_users_auth_version CHECK (auth_version >= 0);
-- Only an explicit registration audit plus a BCrypt hash proves local password provisioning.
-- Unclassified legacy/internal accounts remain disabled until reviewed; never infer from Google email.
UPDATE u SET password_login_enabled = 1 FROM dbo.users u
WHERE LEN(u.password_hash)=60 AND u.password_hash LIKE '$2[aby]$[0-9][0-9]$%'
AND EXISTS (SELECT 1 FROM dbo.audit_logs a WHERE a.entity_type='USER'
    AND a.entity_id=u.user_id AND a.action='AUTH_REGISTERED');

CREATE TABLE dbo.password_reset_credentials (
    credential_id BIGINT IDENTITY PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES dbo.users(user_id),
    credential_hash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL UNIQUE,
    purpose VARCHAR(30) NOT NULL CONSTRAINT DF_reset_purpose DEFAULT 'PASSWORD_RESET',
    auth_version BIGINT NOT NULL,
    created_at DATETIME2 NOT NULL,
    expires_at DATETIME2 NOT NULL,
    consumed_at DATETIME2 NULL,
    revoked_at DATETIME2 NULL,
    CONSTRAINT CK_reset_purpose CHECK (purpose='PASSWORD_RESET'),
    CONSTRAINT CK_reset_expiry CHECK (expires_at>created_at),
    CONSTRAINT CK_reset_terminal CHECK (consumed_at IS NULL OR revoked_at IS NULL)
);
CREATE INDEX IX_reset_user ON dbo.password_reset_credentials(user_id,expires_at);
CREATE TABLE dbo.password_recovery_jobs (
    job_id BIGINT IDENTITY PRIMARY KEY,
    email NVARCHAR(254) NOT NULL,
    locale VARCHAR(2) NOT NULL,
    requested_at DATETIME2 NOT NULL,
    status VARCHAR(20) NOT NULL CONSTRAINT DF_recovery_job_status DEFAULT 'QUEUED',
    CONSTRAINT CK_recovery_job_status CHECK (status IN ('QUEUED','CLAIMED','ACCEPTED','FAILED','SKIPPED')),
    CONSTRAINT CK_recovery_job_locale CHECK (locale IN ('vi','en'))
);
CREATE INDEX IX_recovery_queue ON dbo.password_recovery_jobs(status,job_id);
-- HMAC keys only. A transaction-owned application lock serializes each rolling-window counter.
CREATE TABLE dbo.password_recovery_limits (
    event_id BIGINT IDENTITY PRIMARY KEY,
    bucket_hash CHAR(64) COLLATE Latin1_General_100_BIN2 NOT NULL,
    occurred_at DATETIME2 NOT NULL
);
CREATE INDEX IX_recovery_limit ON dbo.password_recovery_limits(bucket_hash,occurred_at);
